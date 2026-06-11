// GET /api/download?url=<encoded_url>&filename=<encoded_name>
//
// Server-side download proxy. Fetches the video from Supabase storage and
// returns it with Content-Disposition: attachment so the browser always
// triggers a file save dialog instead of opening the player fullscreen.
//
// Security: only Supabase project URLs are permitted through this proxy.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";

const ALLOWED_HOSTS = [
  process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/^https?:\/\//, '') ?? '',
  // Add additional allowed CDN hostnames here if needed
].filter(Boolean);

export async function GET(req: NextRequest) {
  // Auth check — must be logged-in user
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const rawUrl  = req.nextUrl.searchParams.get("url");
  const rawName = req.nextUrl.searchParams.get("filename") ?? "omnyra-video.mp4";

  if (!rawUrl) return new Response("Missing url param", { status: 400 });

  // Validate URL is from an allowed host (no SSRF)
  let parsed: URL;
  try { parsed = new URL(rawUrl); } catch {
    return new Response("Invalid URL", { status: 400 });
  }
  const isAllowed = ALLOWED_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`));
  if (!isAllowed) {
    console.warn("[download-proxy] blocked host:", parsed.hostname);
    return new Response("URL not allowed", { status: 403 });
  }

  // Sanitize filename — strip path separators, control chars
  const filename = rawName.replace(/[/\\<>:"|?*\x00-\x1F]/g, "_").slice(0, 200);

  // Fetch from origin
  let upstream: Response;
  try {
    upstream = await fetch(rawUrl, { cache: "no-store" });
  } catch (e) {
    console.error("[download-proxy] fetch error:", e);
    return new Response("Failed to fetch video", { status: 502 });
  }

  if (!upstream.ok) {
    return new Response(`Origin returned ${upstream.status}`, { status: 502 });
  }

  const contentType = upstream.headers.get("content-type") ?? "video/mp4";
  const body = upstream.body;
  if (!body) return new Response("Empty response from origin", { status: 502 });

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type":        contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control":       "no-store",
      // Stream the body — don't buffer in memory
      "Transfer-Encoding":   "chunked",
    },
  });
}
