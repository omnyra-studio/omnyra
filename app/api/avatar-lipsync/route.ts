/**
 * POST /api/avatar-lipsync
 *
 * Full pipeline: classify scene → validate assets → route model → execute → score output.
 *
 * Credit lifecycle is the caller's responsibility (avatar-pipeline, worker, or any
 * orchestrator that wraps this call in withCreditState).
 *
 * Response includes `status: "success" | "fallback_used" | "failed"` so the
 * caller can decide how to handle degraded output.
 *
 * Env vars: HEDRA_API_KEY (required for Hedra), KLING_API_KEY (required for Kling)
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { generateHedraAvatar } from "@/lib/providers/hedra";
import { validateAssetBundle } from "@/lib/avatar/asset-validator";
import { classifyScene } from "@/lib/avatar/scene-classifier";
import { routeModel, injectVisualLock } from "@/lib/avatar/model-router";
import { scoreGenerationOutput } from "@/lib/avatar/quality-scorer";
import { classifyFailure, logFailure } from "@/lib/avatar/failure-taxonomy";

export const maxDuration = 300;

// ── Lipsync result type ───────────────────────────────────────────────────────

interface LipsyncResult {
  video_url:          string | null;
  request_id:         string;
  status:             "success" | "fallback_used" | "failed";
  fallback_provider?: string;
  reason?:            string;
  model_used?:        string;
  quality_score?:     number;
  routing?:           { model: string; reason: string; kling_score: number; hedra_score: number };
}

// ── Provider chain: Hedra → static fallback ───────────────────────────────────
// Phase 1 routing: motion_complexity > 25 → Kling (not yet integrated; Hedra-only for now).
// When Kling provider is available, route by model decision here.

async function generateLipsyncWithFallback(
  imageUrl:    string,
  audioUrl:    string,
  description: string = "",
): Promise<LipsyncResult> {
  // ── Step 1: Scene classification + model routing ──────────────────────────
  const scene    = classifyScene(description || "talking head portrait lipsync voiceover");
  const routing  = routeModel(scene);
  const { prompt: _lockedPrompt, negative_prompt: _negativePrompt } = injectVisualLock(
    description || "portrait talking head",
  );

  console.info("[avatar-lipsync] routing decision", {
    scene_type:  scene.scene_type,
    model:       routing.model,
    reason:      routing.reason,
    kling_score: routing.kling_score,
    hedra_score: routing.hedra_score,
  });

  // ── Step 2: Phase 1 execution — Hedra handles lipsync-primary scenes ─────
  // Phase 1 rule: motion_complexity > 25 → Kling (not yet plumbed — fallback to Hedra).
  // Hedra is the stable lipsync provider. Kling integration adds in Phase 2.
  if (!process.env.HEDRA_API_KEY) {
    console.warn("[CONFIG_DRIFT] missing_env=HEDRA_API_KEY impact=lipsync_provider_disabled");
    return {
      video_url:         null,
      request_id:        `fallback-${Date.now()}`,
      status:            "fallback_used",
      fallback_provider: "static",
      reason:            "HEDRA_API_KEY_MISSING",
      model_used:        "none",
    };
  }

  try {
    // ── Step 2: Asset validation + signed URL enforcement ────────────────────
    // Supabase public storage URLs are inaccessible from Hedra's network.
    // validateAssetBundle converts them to signed URLs before submission.
    const bundle = await validateAssetBundle({ imageUrl, audioUrl });
    if (!bundle.ok) {
      const msg = `Asset validation failed: ${bundle.errors.join("; ")}`;
      console.error("[avatar-lipsync] ASSET_VALIDATION_FAILED", { errors: bundle.errors });
      return {
        video_url:  null,
        request_id: `validation-fail-${Date.now()}`,
        status:     "failed" as const,
        reason:     msg,
        model_used: "none",
        routing:    { model: routing.model, reason: routing.reason, kling_score: routing.kling_score, hedra_score: routing.hedra_score },
      };
    }

    const resolvedImageUrl = bundle.resolved.imageUrl!;
    const resolvedAudioUrl = bundle.resolved.audioUrl!;

    // Hash comparison proves URL mutation (original → signed)
    const { createHash } = await import("crypto");
    const origImgHash = createHash("sha256").update(imageUrl).digest("hex").substring(0, 16);
    const resImgHash  = createHash("sha256").update(resolvedImageUrl).digest("hex").substring(0, 16);
    const origAudHash = createHash("sha256").update(audioUrl).digest("hex").substring(0, 16);
    const resAudHash  = createHash("sha256").update(resolvedAudioUrl).digest("hex").substring(0, 16);
    console.info("[avatar-lipsync] URL_RESOLUTION", {
      image_url_changed:   origImgHash !== resImgHash,
      audio_url_changed:   origAudHash !== resAudHash,
      orig_image_hash:     origImgHash,
      resolved_image_hash: resImgHash,
      orig_audio_hash:     origAudHash,
      resolved_audio_hash: resAudHash,
    });

    const result = await generateHedraAvatar({ image_url: resolvedImageUrl, audio_url: resolvedAudioUrl });

    // ── Step 3: Post-generation quality scoring ─────────────────────────────
    const quality = await scoreGenerationOutput(result.video_url);
    if (!quality.ok) {
      const issuesSummary = quality.issues.join("; ");
      console.warn("[avatar-lipsync] output failed quality gate:", issuesSummary);
      return {
        video_url:     null,
        request_id:    result.request_id,
        status:        "failed",
        reason:        `Quality gate failed: ${issuesSummary}`,
        model_used:    routing.model,
        quality_score: quality.score,
        routing:       { model: routing.model, reason: routing.reason, kling_score: routing.kling_score, hedra_score: routing.hedra_score },
      };
    }

    return {
      video_url:     quality.url,    // use signed/resolved URL from quality scorer
      request_id:    result.request_id,
      status:        "success",
      model_used:    "hedra",
      quality_score: quality.score,
      routing:       { model: routing.model, reason: routing.reason, kling_score: routing.kling_score, hedra_score: routing.hedra_score },
    };
  } catch (hedraErr) {
    const failure = classifyFailure(hedraErr);
    logFailure("avatar-lipsync", failure);
    return {
      video_url:         null,
      request_id:        `fallback-${Date.now()}`,
      status:            "fallback_used",
      fallback_provider: "static",
      reason:            `${failure.code}: ${failure.message.substring(0, 200)}`,
      model_used:        "none",
    };
  }
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const routeT0 = Date.now();

  // ── Auth ─────────────────────────────────────────────────────────────────────
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
  let body: { imageUrl?: string; audioUrl?: string; description?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { imageUrl, audioUrl, description } = body;
  if (!imageUrl?.startsWith("https://")) {
    return Response.json({ error: "imageUrl must be a valid https URL" }, { status: 400 });
  }
  if (!audioUrl?.startsWith("https://")) {
    return Response.json({ error: "audioUrl must be a valid https URL" }, { status: 400 });
  }

  // ── Generate (caller owns credit lifecycle) ───────────────────────────────────
  try {
    const lipsync = await generateLipsyncWithFallback(imageUrl, audioUrl, description);
    const totalMs = Date.now() - routeT0;
    console.info(`[TIMING] avatar-lipsync TOTAL ${totalMs}ms status=${lipsync.status}`);
    return Response.json({
      success:   lipsync.status !== "failed",
      ...lipsync,
      timing_ms: { route_total: totalMs },
    });
  } catch (err) {
    const failure = classifyFailure(err);
    logFailure("avatar-lipsync:route", failure);
    return Response.json({
      error:   failure.message.substring(0, 300),
      code:    failure.code,
      hint:    failure.hint,
      status:  "failed",
    }, { status: 500 });
  }
}
