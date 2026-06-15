// GET /api/auth/youtube/callback — Receives Google OAuth2 code, exchanges for tokens,
// stores tokens in brand_profiles.youtube_oauth (server-side only, never exposed to client).

import { supabaseAdmin } from "@/lib/supabase/admin";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code    = searchParams.get("code");
  const state   = searchParams.get("state");   // user ID passed through OAuth state
  const errParam = searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://omnyra.studio";

  if (errParam) {
    console.warn("[youtube-oauth] user denied consent:", errParam);
    return Response.redirect(`${appUrl}/dashboard/brand?youtube_error=${encodeURIComponent(errParam)}`);
  }

  if (!code || !state) {
    return Response.redirect(`${appUrl}/dashboard/brand?youtube_error=missing_params`);
  }

  const clientId     = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return Response.redirect(`${appUrl}/dashboard/brand?youtube_error=server_config`);
  }

  const redirectUri = `${appUrl}/api/auth/youtube/callback`;

  // Exchange code for tokens
  let tokenData: {
    access_token:  string;
    refresh_token?: string;
    token_type:    string;
    expires_in:    number;
    scope:         string;
  };

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id:     clientId,
        client_secret: clientSecret,
        redirect_uri:  redirectUri,
        grant_type:    "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      const detail = await tokenRes.text();
      console.error("[youtube-oauth] token exchange failed:", detail);
      return Response.redirect(`${appUrl}/dashboard/brand?youtube_error=token_exchange`);
    }
    tokenData = await tokenRes.json() as typeof tokenData;
  } catch (err) {
    console.error("[youtube-oauth] token exchange threw:", err);
    return Response.redirect(`${appUrl}/dashboard/brand?youtube_error=token_exchange`);
  }

  if (!tokenData.access_token) {
    return Response.redirect(`${appUrl}/dashboard/brand?youtube_error=no_access_token`);
  }

  // Fetch the user's YouTube channel info
  let channelId    = "";
  let channelTitle = "";
  try {
    const chanRes = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      { headers: { Authorization: `Bearer ${tokenData.access_token}` } },
    );
    if (chanRes.ok) {
      const chanData = await chanRes.json() as { items?: Array<{ id: string; snippet: { title: string } }> };
      const channel = chanData.items?.[0];
      if (channel) {
        channelId    = channel.id;
        channelTitle = channel.snippet.title;
      }
    }
  } catch { /* channel info is non-fatal */ }

  // Store tokens in brand_profiles (server-side only — never sent to client)
  const expiryDate = Date.now() + (tokenData.expires_in ?? 3600) * 1000;
  const oauthPayload = {
    access_token:   tokenData.access_token,
    refresh_token:  tokenData.refresh_token ?? null,
    token_type:     tokenData.token_type,
    expiry_date:    expiryDate,
    channel_id:     channelId,
    channel_title:  channelTitle,
    connected_at:   new Date().toISOString(),
  };

  const { error: saveErr } = await supabaseAdmin
    .from("brand_profiles")
    .upsert(
      { user_id: state, youtube_oauth: oauthPayload, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );

  if (saveErr) {
    console.error("[youtube-oauth] save failed:", saveErr.message);
    return Response.redirect(`${appUrl}/dashboard/brand?youtube_error=save_failed`);
  }

  console.info(`[youtube-oauth] connected userId=${state} channel="${channelTitle}" id=${channelId}`);
  return Response.redirect(`${appUrl}/dashboard/brand?youtube_connected=1&channel=${encodeURIComponent(channelTitle)}`);
}
