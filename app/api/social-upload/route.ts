// POST /api/social-upload — Upload or share a generated video to a social platform.
//
// YouTube:  Full server-side upload via OAuth + Data API v3.
// All others: Returns a deep_link for the client to open + a signal to trigger download.
//             Full API integration for TikTok/Meta/etc requires business-level approval;
//             the download+redirect UX is the reliable cross-platform fallback.

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 120;

export type SocialPlatform =
  | "youtube" | "youtube_shorts" | "youtube_longform"
  | "tiktok"
  | "instagram" | "instagram_reels" | "instagram_feed" | "instagram_stories"
  | "facebook" | "facebook_reels" | "facebook_feed"
  | "twitter_x"
  | "threads"
  | "snapchat"
  | "linkedin"
  | "pinterest"
  | "discord"
  | "telegram"
  | "rumble"
  | "twitch"
  | "whatsapp"
  | "bereal";

interface UploadRequest {
  platform:     SocialPlatform;
  video_url:    string;    // Supabase public URL
  title:        string;
  description?: string;
  tags?:        string[];
  privacy?:     "public" | "private" | "unlisted";
  render_id?:   string;
}

// Platform metadata — deep links and upload page URLs for each platform
const PLATFORM_META: Record<string, { label: string; uploadUrl: string; supportsDirectUpload: boolean }> = {
  youtube:            { label: "YouTube",           uploadUrl: "https://studio.youtube.com/channel/UC/videos/upload", supportsDirectUpload: true  },
  youtube_shorts:     { label: "YouTube Shorts",    uploadUrl: "https://studio.youtube.com/channel/UC/videos/upload", supportsDirectUpload: true  },
  youtube_longform:   { label: "YouTube",           uploadUrl: "https://studio.youtube.com/channel/UC/videos/upload", supportsDirectUpload: true  },
  tiktok:             { label: "TikTok",            uploadUrl: "https://www.tiktok.com/upload",                        supportsDirectUpload: false },
  instagram:          { label: "Instagram Reels",   uploadUrl: "https://www.instagram.com/reels/create",               supportsDirectUpload: false },
  instagram_reels:    { label: "Instagram Reels",   uploadUrl: "https://www.instagram.com/reels/create",               supportsDirectUpload: false },
  instagram_feed:     { label: "Instagram",         uploadUrl: "https://www.instagram.com/create/select/",             supportsDirectUpload: false },
  instagram_stories:  { label: "Instagram Stories", uploadUrl: "https://www.instagram.com/stories/create",             supportsDirectUpload: false },
  facebook:           { label: "Facebook",          uploadUrl: "https://www.facebook.com/watch/live/video-upload",     supportsDirectUpload: false },
  facebook_reels:     { label: "Facebook Reels",    uploadUrl: "https://www.facebook.com/reels/create",                supportsDirectUpload: false },
  facebook_feed:      { label: "Facebook",          uploadUrl: "https://www.facebook.com/",                            supportsDirectUpload: false },
  twitter_x:          { label: "X / Twitter",       uploadUrl: "https://x.com/compose/tweet",                         supportsDirectUpload: false },
  threads:            { label: "Threads",           uploadUrl: "https://www.threads.net/",                             supportsDirectUpload: false },
  snapchat:           { label: "Snapchat",          uploadUrl: "https://story.snapchat.com/",                          supportsDirectUpload: false },
  linkedin:           { label: "LinkedIn",          uploadUrl: "https://www.linkedin.com/feed/",                       supportsDirectUpload: false },
  pinterest:          { label: "Pinterest",         uploadUrl: "https://pinterest.com/pin-builder/",                   supportsDirectUpload: false },
  discord:            { label: "Discord",           uploadUrl: "https://discord.com/channels/@me",                     supportsDirectUpload: false },
  telegram:           { label: "Telegram",          uploadUrl: "https://web.telegram.org/",                            supportsDirectUpload: false },
  rumble:             { label: "Rumble",            uploadUrl: "https://rumble.com/upload.php",                        supportsDirectUpload: false },
  twitch:             { label: "Twitch",            uploadUrl: "https://dashboard.twitch.tv/u/user/clips",             supportsDirectUpload: false },
  whatsapp:           { label: "WhatsApp",          uploadUrl: "https://web.whatsapp.com/",                            supportsDirectUpload: false },
  bereal:             { label: "BeReal",            uploadUrl: "https://bere.al/",                                     supportsDirectUpload: false },
};

function isYouTubePlatform(p: string): boolean {
  return p === "youtube" || p === "youtube_shorts" || p === "youtube_longform";
}

export async function POST(req: Request) {
  // Auth
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: UploadRequest;
  try { body = await req.json() as UploadRequest; }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { platform, video_url, title, description = "", tags = [], privacy = "public", render_id } = body;
  if (!platform || !video_url || !title) {
    return Response.json({ error: "platform, video_url, and title are required" }, { status: 400 });
  }

  const meta = PLATFORM_META[platform];

  // ── Non-direct-upload platforms: return deep link so client handles download+redirect ──
  if (!isYouTubePlatform(platform)) {
    return Response.json({
      success:   false,
      platform,
      deep_link: meta?.uploadUrl ?? "https://www.google.com",
      label:     meta?.label ?? platform,
      action:    "download_and_redirect",
      message:   `Download your video, then upload it to ${meta?.label ?? platform}.`,
    });
  }

  // ── YouTube: full server-side OAuth upload ────────────────────────────────────
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("brand_profiles")
    .select("youtube_oauth")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileErr || !profile?.youtube_oauth) {
    return Response.json({
      error:       "YouTube not connected. Connect your channel in Brand Settings.",
      connect_url: "/api/auth/youtube",
    }, { status: 403 });
  }

  const oauth = profile.youtube_oauth as {
    access_token:  string;
    refresh_token: string | null;
    expiry_date:   number;
    channel_id:    string;
    channel_title: string;
  };

  // Refresh access token if expired (60s buffer)
  let accessToken = oauth.access_token;
  if (oauth.expiry_date < Date.now() + 60_000) {
    if (!oauth.refresh_token) {
      return Response.json({ error: "YouTube token expired. Please reconnect.", connect_url: "/api/auth/youtube" }, { status: 403 });
    }
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return Response.json({ error: "Google OAuth not configured" }, { status: 500 });

    const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: oauth.refresh_token,
        client_id:     clientId,
        client_secret: clientSecret,
        grant_type:    "refresh_token",
      }),
    });
    if (!refreshRes.ok) {
      return Response.json({ error: "YouTube token refresh failed. Please reconnect.", connect_url: "/api/auth/youtube" }, { status: 403 });
    }
    const refreshData = await refreshRes.json() as { access_token: string; expires_in: number };
    accessToken = refreshData.access_token;
    await supabaseAdmin
      .from("brand_profiles")
      .update({
        youtube_oauth: { ...oauth, access_token: accessToken, expiry_date: Date.now() + (refreshData.expires_in ?? 3600) * 1000 },
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id);
  }

  // Download video
  console.info(`[social-upload] YouTube upload start userId=${user.id} title="${title.slice(0, 60)}"`);
  let videoBuffer: ArrayBuffer;
  try {
    const videoRes = await fetch(video_url, { signal: AbortSignal.timeout(60_000) });
    if (!videoRes.ok) throw new Error(`Video fetch failed: ${videoRes.status}`);
    videoBuffer = await videoRes.arrayBuffer();
  } catch (err) {
    return Response.json({ error: `Could not download video: ${err instanceof Error ? err.message : err}` }, { status: 500 });
  }

  // Resumable upload: initiate
  const metaRes = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status&uploadType=resumable",
    {
      method: "POST",
      headers: {
        "Authorization":           `Bearer ${accessToken}`,
        "Content-Type":            "application/json",
        "X-Upload-Content-Type":   "video/mp4",
        "X-Upload-Content-Length": String(videoBuffer.byteLength),
      },
      body: JSON.stringify({
        snippet: {
          title:       title.slice(0, 100),
          description: description.slice(0, 5000),
          tags:        tags.slice(0, 500),
          categoryId:  "22",
        },
        status: { privacyStatus: privacy, selfDeclaredMadeForKids: false },
      }),
    },
  );

  if (!metaRes.ok) {
    const detail = await metaRes.text();
    console.error("[social-upload] YouTube metadata failed:", metaRes.status, detail);
    return Response.json({ error: `YouTube error ${metaRes.status}: ${detail.slice(0, 200)}` }, { status: 500 });
  }

  const uploadUrl = metaRes.headers.get("Location");
  if (!uploadUrl) return Response.json({ error: "YouTube did not return upload URL" }, { status: 500 });

  // Upload bytes
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4", "Content-Length": String(videoBuffer.byteLength) },
    body: videoBuffer,
  });
  if (!uploadRes.ok && uploadRes.status !== 201) {
    const detail = await uploadRes.text();
    return Response.json({ error: `YouTube upload failed ${uploadRes.status}: ${detail.slice(0, 200)}` }, { status: 500 });
  }

  const uploadData = await uploadRes.json() as { id?: string };
  const youtubeVideoId = uploadData.id;
  if (!youtubeVideoId) return Response.json({ error: "YouTube upload succeeded but no video ID" }, { status: 500 });

  const youtubeUrl = `https://www.youtube.com/watch?v=${youtubeVideoId}`;
  console.info(`[social-upload] YouTube done videoId=${youtubeVideoId} channel=${oauth.channel_id}`);

  if (render_id) {
    void supabaseAdmin
      .from("renders")
      .update({ uploaded_to_youtube: true, youtube_video_id: youtubeVideoId, updated_at: new Date().toISOString() })
      .eq("id", render_id)
      .then(({ error: e }) => { if (e) console.warn("[social-upload] render update failed:", e.message); });
  }

  return Response.json({
    success:       true,
    platform,
    video_id:      youtubeVideoId,
    video_url:     youtubeUrl,
    channel_id:    oauth.channel_id,
    channel_title: oauth.channel_title,
  });
}
