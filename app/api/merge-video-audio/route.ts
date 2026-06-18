import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin, cleanEnv } from "@/lib/supabase/admin";
import { mergeVideoWithAudio } from "@/lib/utils/merge-video-audio";

export const maxDuration = 300;

async function fetchWithTimeout(url: string, timeoutMs: number, label: string): Promise<Buffer> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) throw new Error(`${label}: HTTP ${res.status} — ${url.substring(0, 120)}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new Error(`${label}: 0 bytes — URL may be expired`);
    return buf;
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`${label}: download timed out after ${timeoutMs / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(req: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = createServerClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: any;  // flexible for client keys like stitchedUrl, audioBase64 etc.
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Normalize flexible client input keys (supports stitchedUrl + audioBase64 from cinematic flows, plus standard names)
  const videoUrl = body.video_url || body.stitchedUrl || body.video || body.clip_url || body.url;
  const audioUrl = body.audio_url || body.audioUrl;
  const audioB64 = body.audio_base64 || body.audioBase64 || body.audio_base64 || body.audio;

  if (!videoUrl || (!audioUrl && !audioB64)) {
    return Response.json({ error: "video (video_url or stitchedUrl) and audio (audio_url or audioBase64) are required" }, { status: 400 });
  }

  if (audioB64 && typeof audioB64 === "string" && audioB64.length > 100_000_000) {
    return Response.json({ error: "audio_base64 too large (max 75MB)" }, { status: 413 });
  }

  try {
    const result = await mergeVideoWithAudio(user.id, videoUrl, audioUrl || undefined, audioB64 || undefined);
    return Response.json({
      video_url: result.video_url,
      merged_url: result.video_url,
      duration_seconds: result.duration_seconds,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[merge-video-audio] FAILED:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
