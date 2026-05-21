import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
}

const TOKEN_ENDPOINTS = {
  tiktok: {
    url: 'https://open.tiktokapis.com/v2/oauth/token/',
    body: (code, redirect, stored) => ({
      client_key: process.env.TIKTOK_CLIENT_KEY,
      client_secret: process.env.TIKTOK_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirect,
    }),
    userUrl: (token) => ({
      url: 'https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url',
      headers: { Authorization: `Bearer ${token}` },
    }),
    parseUser: (data) => ({
      platform_user_id: data.data?.user?.open_id,
      username: data.data?.user?.display_name,
      avatar_url: data.data?.user?.avatar_url,
    }),
  },
  instagram: {
    url: 'https://api.instagram.com/oauth/access_token',
    body: (code, redirect) => ({
      client_id: process.env.INSTAGRAM_APP_ID,
      client_secret: process.env.INSTAGRAM_APP_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirect,
    }),
    userUrl: (token) => ({
      url: `https://graph.instagram.com/v21.0/me?fields=id,username&access_token=${token}`,
    }),
    parseUser: (data) => ({ platform_user_id: data.id, username: data.username }),
  },
  youtube: {
    url: 'https://oauth2.googleapis.com/token',
    body: (code, redirect) => ({
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirect,
    }),
    userUrl: (token) => ({
      url: 'https://www.googleapis.com/oauth2/v2/userinfo',
      headers: { Authorization: `Bearer ${token}` },
    }),
    parseUser: (data) => ({ platform_user_id: data.id, username: data.name, avatar_url: data.picture }),
  },
  twitter: {
    url: 'https://api.twitter.com/2/oauth2/token',
    body: (code, redirect, stored) => ({
      client_id: process.env.TWITTER_CLIENT_ID,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirect,
      code_verifier: stored.codeVerifier,
    }),
    headers: () => ({
      Authorization: `Basic ${Buffer.from(`${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`).toString('base64')}`,
    }),
    userUrl: (token) => ({
      url: 'https://api.twitter.com/2/users/me',
      headers: { Authorization: `Bearer ${token}` },
    }),
    parseUser: (data) => ({ platform_user_id: data.data?.id, username: data.data?.username }),
  },
};

export async function GET(request, context) {
  const { platform } = await context.params;
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  const fail = (msg) =>
    Response.redirect(`${APP_URL}/?social_error=${encodeURIComponent(msg)}`);

  if (error) return fail(error);
  if (!code || !state) return fail('Missing code or state');

  const cookieStore = await cookies();
  const raw = cookieStore.get('omnyra_oauth')?.value;
  if (!raw) return fail('Session expired — please try again');

  let stored;
  try { stored = JSON.parse(raw); } catch { return fail('Invalid session'); }

  if (stored.state !== state || stored.platform !== platform) return fail('State mismatch');

  cookieStore.delete('omnyra_oauth');

  const cfg = TOKEN_ENDPOINTS[platform];
  if (!cfg) return fail('Unknown platform');

  const redirectUri = `${APP_URL}/api/social/callback/${platform}`;
  const tokenBody = cfg.body(code, redirectUri, stored);
  const tokenRes = await fetch(cfg.url, {
    method: 'POST',
    headers: {
      'Content-Type': platform === 'twitter' ? 'application/x-www-form-urlencoded' : 'application/json',
      ...(cfg.headers?.() ?? {}),
    },
    body: platform === 'twitter'
      ? new URLSearchParams(tokenBody)
      : (platform === 'instagram' ? new URLSearchParams(tokenBody) : JSON.stringify(tokenBody)),
  });

  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || tokenData.error) {
    return fail(tokenData.error_description || tokenData.error || 'Token exchange failed');
  }

  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token ?? null;
  const expiresIn = tokenData.expires_in ?? null;
  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null;
  const scope = tokenData.scope ?? null;

  let userInfo = {};
  try {
    const { url: uUrl, headers: uHeaders } = cfg.userUrl(accessToken, tokenData.user_id);
    const uRes = await fetch(uUrl, { headers: uHeaders ?? {} });
    if (uRes.ok) userInfo = cfg.parseUser(await uRes.json());
  } catch {}

  await getDb().from('social_connections').upsert(
    {
      user_id: stored.userId,
      platform,
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: expiresAt,
      scope,
      ...userInfo,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,platform' }
  );

  return Response.redirect(`${APP_URL}/?social_connected=${platform}`);
}
