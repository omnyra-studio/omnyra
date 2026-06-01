/**
 * POST /api/avatar-lipsync
 *
 * Turns any selected/generated image into a talking character video.
 *
 * Pipeline — Hedra Character-2 (~360s max):
 *   image + audio → lip-synced talking character video
 *
 * Env vars: HEDRA_API_KEY
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { generateHedraAvatar } from "@/lib/providers/hedra";

export const maxDuration = 300;

export async function POST(req: Request) {
  const routeT0 = Date.now();

  // ── Auth ──────────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { imageUrl?: string; audioUrl?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { imageUrl, audioUrl } = body;
  if (!imageUrl?.startsWith("https://")) {
    return Response.json({ error: "imageUrl must be a valid https URL" }, { status: 400 });
  }
  if (!audioUrl?.startsWith("https://")) {
    return Response.json({ error: "audioUrl must be a valid https URL" }, { status: 400 });
  }

  // ── Generate ──────────────────────────────────────────────────────────────
  try {
    const result = await generateHedraAvatar({ image_url: imageUrl, audio_url: audioUrl });
    const totalMs = Date.now() - routeT0;
    console.log(`[TIMING] avatar-lipsync TOTAL ${totalMs}ms`);

    return Response.json({
      success:    true,
      video_url:  result.video_url,
      request_id: result.request_id,
      timing_ms:  { route_total: totalMs },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[avatar-lipsync] FAILED:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
