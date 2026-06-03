/**
 * POST /api/avatar-lipsync
 *
 * Pure generation endpoint — this route does NOT own credit transactions.
 * Credit lifecycle is the caller's responsibility (avatar-pipeline, worker, or
 * any orchestrator that wraps this call in withCreditState).
 *
 * Provider chain: Hedra Character-2 → static fallback
 *
 * Response includes `status: "success" | "fallback_used" | "failed"` so the
 * caller can decide how to handle degraded output.
 *
 * Env vars: HEDRA_API_KEY (optional — static fallback used when absent)
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { generateHedraAvatar } from "@/lib/providers/hedra";

export const maxDuration = 300;

// ── Lipsync result type ───────────────────────────────────────────────────────

export interface LipsyncResult {
  video_url:         string | null;
  request_id:        string;
  status:            "success" | "fallback_used" | "failed";
  fallback_provider?: string;
  reason?:           string;
}

// ── Provider chain: Hedra → static fallback ───────────────────────────────────

export async function generateLipsyncWithFallback(
  imageUrl: string,
  audioUrl: string,
): Promise<LipsyncResult> {
  if (!process.env.HEDRA_API_KEY) {
    console.warn("[CONFIG_DRIFT] missing_env=HEDRA_API_KEY impact=lipsync_provider_disabled");
    console.warn("[HEDRA_FALLBACK] missing API key — static fallback", {
      provider: "static",
      reason:   "HEDRA_API_KEY_MISSING",
    });
    return {
      video_url:         null,
      request_id:        `fallback-${Date.now()}`,
      status:            "fallback_used",
      fallback_provider: "static",
      reason:            "HEDRA_API_KEY_MISSING",
    };
  }

  try {
    const result = await generateHedraAvatar({ image_url: imageUrl, audio_url: audioUrl });
    return { video_url: result.video_url, request_id: result.request_id, status: "success" };
  } catch (hedraErr) {
    const reason = hedraErr instanceof Error ? hedraErr.message : String(hedraErr);
    console.error("[avatar-lipsync] Hedra FAILED — static fallback:", reason);
    return {
      video_url:         null,
      request_id:        `fallback-${Date.now()}`,
      status:            "fallback_used",
      fallback_provider: "static",
      reason,
    };
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const routeT0 = Date.now();

  // ── Auth ──────────────────────────────────────────────────────────────────────
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

  // ── Parse body ────────────────────────────────────────────────────────────────
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

  // ── Generate (caller owns credit lifecycle) ───────────────────────────────────
  try {
    const lipsync = await generateLipsyncWithFallback(imageUrl, audioUrl);
    const totalMs = Date.now() - routeT0;
    console.log(`[TIMING] avatar-lipsync TOTAL ${totalMs}ms status=${lipsync.status}`);
    return Response.json({
      success:   lipsync.status !== "failed",
      ...lipsync,
      timing_ms: { route_total: totalMs },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[avatar-lipsync] FAILED:", msg);
    return Response.json({ error: msg, status: "failed" }, { status: 500 });
  }
}
