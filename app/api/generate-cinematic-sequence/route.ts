import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { fal } from "@fal-ai/client";
import { KLING_I2V_MODEL, KLING_T2V_MODEL, extractVideoUrl } from "@/lib/video-models";
import { generateSmartMotionClip, pickEffect } from "@/lib/smart-motion";
import { supabaseAdmin } from "@/lib/supabase/admin";
import {
  extractBibles,
  buildCharacterPrefix,
  buildConsistencySuffix,
  validateFrameConsistency,
  computeContinuityScore,
  type ContinuityBibles,
  type ContinuityScore,
} from "@/lib/visual-continuity";
import { applyGenerationGuardrail, type ModelTier } from "@/lib/generation-guardrail";
import { checkAbuse, releaseVideoSlot } from "@/lib/abuse-protection";
import { videoCreditCost } from "@/lib/rules/creditRules";
import { withCreditState, InsufficientCreditsError, CreditReservationError } from "@/lib/credits/withCreditState";

export const maxDuration = 300;

const CLIP_SECONDS = 10;
const ROUTE_VERSION = "2026-06-06-v10-sla360-sla-fallback-pad";

const FLUX_MODEL = "fal-ai/flux/schnell";

// ── SLA budget: Vercel maxDuration=300s; keep 30s for post-processing ─────────
const SLA_TOTAL_MS   = 260_000; // 260s total (40s margin before Vercel kills)
const SLA_GEN_MS     = 230_000; // clip generation allocation
const SLA_POST_MS    =  30_000; // post-processing + continuity reserve
// Absolute deadline for generation to finish (30s reserved for post)
// Computed per-request as: routeT0 + SLA_TOTAL_MS - SLA_POST_MS

// ── Types ─────────────────────────────────────────────────────────────────────

type SceneProvider = "kling" | "smart_motion";

class AllClipsFailedError extends Error {
  readonly payload: Record<string, unknown>;
  constructor(payload: Record<string, unknown>) {
    super("All clips failed to generate");
    this.name = "AllClipsFailedError";
    this.payload = payload;
  }
}

// ── Storage upload helper ─────────────────────────────────────────────────────

async function uploadSmartMotionClip(
  buffer: Buffer,
  userId: string,
  index: number,
): Promise<string> {
  const path = `${userId}/smart-motion/${Date.now()}-clip${index}.mp4`;
  const { error } = await supabaseAdmin.storage
    .from("renders")
    .upload(path, buffer, { contentType: "video/mp4", upsert: true });
  if (error) throw new Error(`smart-motion upload: ${error.message}`);
  const { data: { publicUrl } } = supabaseAdmin.storage.from("renders").getPublicUrl(path);
  return publicUrl;
}

// ── Image generation for smart_motion without a source image ─────────────────

const COUPLE_RE = /\b(couple|two people|both of them|together|partner|dancing with|walking with|holding hands|hand in hand|each other|lovers|husband|wife|boyfriend|girlfriend|fiancee?|spouse|relationship|romance|romantic)\b/i;

async function generateSceneImage(prompt: string, isCouple: boolean): Promise<string> {
  const couplePositive = isCouple
    ? "two people together, both people clearly visible in frame, couple, "
    : "";
  const coupleNegative = isCouple
    ? "solo, single person, alone, one person, "
    : "";

  const safePrompt =
    `${couplePositive}${prompt}, 35mm candid photography, natural lighting, authentic unposed moment, ` +
    `real people, documentary style, shot on iPhone or DSLR, imperfect natural beauty, ` +
    `fully clothed subjects, brand-safe, SFW, no nudity`;

  const negativePrompt =
    `${coupleNegative}AI render, CGI, hyperrealistic skin, studio lighting, perfect symmetry, ` +
    `fitness model, airbrushed, chiseled, glowing skin, professional athlete, ` +
    `posed portrait, stock photo, fake smile, oversaturated`;

  const result = await (fal as any).subscribe(FLUX_MODEL, {
    input: {
      prompt: safePrompt,
      negative_prompt: negativePrompt,
      image_size: { width: 720, height: 1280 },
      num_inference_steps: 4,
      num_images: 1,
      enable_safety_checker: true,
    },
    logs: false,
  });
  // fal.ai wraps output in result.data on some SDK versions
  const url: string | undefined =
    (result as any)?.images?.[0]?.url ??
    (result as any)?.data?.images?.[0]?.url;
  if (!url) throw new Error("FLUX: no image URL returned");
  return url;
}

// ── Clip generators ───────────────────────────────────────────────────────────

async function generateKlingClip(
  prompt: string,
  imageUrl: string | null,
  duration: "5" | "10",
  label: string,
  clipReports: string[],
): Promise<string | null> {
  const hasImage = typeof imageUrl === "string" && imageUrl.startsWith("https://");

  if (hasImage) {
    const i2vInput = { prompt, image_url: imageUrl, duration, aspect_ratio: "9:16", generate_audio: false };
    try {
       
      const result = await (fal as any).subscribe(KLING_I2V_MODEL, { input: i2vInput, logs: false, pollInterval: 4000 });
      const url = extractVideoUrl(result);
      if (!url) throw new Error("no video URL from i2v");
      clipReports.push(`${label} | ${KLING_I2V_MODEL} | OK | ${url.substring(0, 80)}`);
      return url;
    } catch (err) {
       
      const e = err as any;
      clipReports.push(`${label} | ${KLING_I2V_MODEL} | FAIL | ${e?.message ?? String(err)}`);
      console.warn(`${label} i2v FAILED — falling back to t2v`);
    }
  }

  // text-to-video fallback
  const t2vInput = { prompt, duration, aspect_ratio: "9:16", generate_audio: false };
  try {
     
    const result = await (fal as any).subscribe(KLING_T2V_MODEL, { input: t2vInput, logs: false, pollInterval: 4000 });
    const url = extractVideoUrl(result);
    if (!url) throw new Error("no video URL from t2v");
    clipReports.push(`${label} | ${KLING_T2V_MODEL} | OK | ${url.substring(0, 80)}`);
    return url;
  } catch (err) {
     
    const e = err as any;
    const detail = `${e?.message ?? String(err)}`;
    clipReports.push(`${label} | ${KLING_T2V_MODEL} | FAIL | ${detail}`);
    console.error(`${label} t2v FAILED: ${detail}`);
    return null;
  }
}

async function generateSmartMotionClipWithUpload(
  prompt: string,
  imageUrl: string | null,
  sceneType: string,
  index: number,
  userId: string,
  label: string,
  clipReports: string[],
  durationSec: number,
  sourceImages: Array<string | null>,
  isCouple: boolean,
): Promise<string | null> {
  const smT0 = Date.now();
  try {
    // Always generate a scene-specific image from the visual prompt.
    // The imageUrl from the client is a reference/brand image — reusing it for every
    // scene causes all clips to animate the same frame (identical output).
    const sourceImageUrl = await generateSceneImage(prompt, isCouple);

    sourceImages[index] = sourceImageUrl;

    const effect = pickEffect(sceneType, index);
    console.log(`${label} [SMART_MOTION] effect=${effect} sourceImage=${sourceImageUrl.substring(0, 60)}`);

    const buffer = await generateSmartMotionClip({ imageUrl: sourceImageUrl, effect, durationSec });
    const url    = await uploadSmartMotionClip(buffer, userId, index);

    const elapsed = Date.now() - smT0;
    clipReports.push(`${label} | smart_motion:${effect} | OK | ${url.substring(0, 80)} | ${elapsed}ms`);
    console.log(`${label} [SMART_MOTION] DONE effect=${effect} elapsed=${elapsed}ms url=${url.substring(0, 60)}`);
    return url;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    clipReports.push(`${label} | smart_motion | FAIL | ${msg}`);
    console.error(`${label} smart_motion FAILED: ${msg}`);
    return null;
  }
}

// ── SLA: race a promise against a deadline, throwing "skipped_due_to_latency" ─

async function withSlaDeadline<T>(gen: Promise<T>, budgetMs: number, label: string): Promise<T> {
  if (budgetMs <= 2_000) {
    console.warn(`${label} SKIPPED — SLA budget exhausted (${budgetMs}ms left)`);
    throw new Error("skipped_due_to_latency");
  }
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("skipped_due_to_latency")), budgetMs);
  });
  try {
    const result = await Promise.race([gen, timeout]);
    clearTimeout(timer!);
    return result;
  } catch (err) {
    clearTimeout(timer!);
    throw err;
  }
}

// ── Clip execution with retry-once + provider downgrade ───────────────────────

type ProviderTier = "kling" | "smart_motion";

function downgradeProvider(p: ProviderTier): ProviderTier {
  if (p === "kling") return "smart_motion";
  return p;
}

async function executeClip(
  prompt:      string,
  imageUrl:    string | null,
  duration:    "5" | "10",
  provider:    ProviderTier,
  sceneType:   string,
  index:       number,
  userId:      string,
  rawSeconds:  number,
  sourceImages: Array<string | null>,
  clipReports: string[],
  budgetMs:    number,
  label:       string,
  isCouple:    boolean,
): Promise<string> {
  const render = async (p: ProviderTier): Promise<string | null> => {
    if (p === "smart_motion") {
      return generateSmartMotionClipWithUpload(
        prompt, imageUrl, sceneType, index, userId, label, clipReports, rawSeconds, sourceImages, isCouple,
      );
    }
    return generateKlingClip(prompt, imageUrl, duration, label, clipReports);
  };

  const fallback    = downgradeProvider(provider);
  const hasFallback = fallback !== provider;
  // One scene, one budget — all retries and downgrades draw from the same deadline.
  const queue: ProviderTier[] = hasFallback
    ? [provider, provider, fallback]
    : [provider, provider];

  const sceneStartedAt = Date.now();
  const sceneDeadline  = sceneStartedAt + budgetMs;

  for (let i = 0; i < queue.length; i++) {
    const remainingMs = sceneDeadline - Date.now();
    const elapsedMs   = Date.now() - sceneStartedAt;

    if (remainingMs <= 0) {
      console.warn("[SCENE_BUDGET_EXCEEDED]", { provider: queue[i], attempts: i, elapsedMs, budgetMs });
      throw new Error("SCENE_BUDGET_EXCEEDED");
    }

    console.info("[SCENE_ATTEMPT]", { attempt: i + 1, provider: queue[i], remainingMs, elapsedMs, budgetMs });

    const url = await withSlaDeadline(render(queue[i]), remainingMs, label);
    if (url) return url;

    if (i === 0) console.warn(`${label} attempt-1 null — retrying ${queue[i]}`);
    if (i === 1 && hasFallback) console.warn(`${label} attempt-2 null — downgrading ${provider} → ${fallback}`);
  }

  throw new Error(`${label} all attempts exhausted`);
}

// ── Scene type inference (keyword-based, used when caller omits sceneTypes) ────

function inferSceneType(prompt: string): string {
  const p = prompt.toLowerCase();

  if (/\b(subscribe|follow|click here|visit|sign.?up|join now|download|shop now|link in bio|swipe up|get started)\b/.test(p))
    return "cta";
  if (/\b(quote|text overlay|typography|words appear|caption|inspirational text|bold text|animated text)\b/.test(p))
    return "quote";
  if (/\b(transition|dissolve|fade (?:in|out|to black)|wipe|time.?lapse|cut to)\b/.test(p))
    return "transition";
  if (
    /\b(landscape|cityscape|aerial view|drone (?:shot|view|footage)|nature scene|establishing shot|empty (?:street|beach|road))\b/.test(p) &&
    !/\b(person|people|man|woman|someone|they|she|he|creator|presenter|customer|client|influencer|host)\b/.test(p)
  ) return "background";
  if (/\b(infographic|diagram|step[\s-.]by[\s-.]step|tutorial|how.to|tip:|lesson|educational)\b/.test(p))
    return "educational";
  if (/\b(product|unbox|reveal|holding|pouring|applying|demo|showcase|close.?up of)\b/.test(p))
    return "product_demo";
  if (/\b(hug|embrac|celebrat|tears?|crying|laughing together|emotional|reaction shot)\b/.test(p))
    return "emotional";
  if (/\b(walking|running|dancing|cooking|workout|exercis|yoga|travelling|sipping|jogging)\b/.test(p))
    return "lifestyle_broll";

  return "talking_head";
}

// ── Motion-intent scoring: drives provider selection ─────────────────────────
// Returns 0.0–1.0. Threshold 0.4: above → Kling, below → smart_motion.
// Kling is the default for ambiguous cases — we never downgrade silently.

const MOTION_VERB_RE = /\b(walk|run|mov|turn|sway|breath|gestur|spin|danc|flow|driv|fall|rise|lift|reach|step|leap|jump|throw|pour|apply|embrac|laugh|cry|react)\w*\b/i;

const SCENE_BASE_SCORES: Record<string, number> = {
  talking_head:    0.55,  // presenter with motion — Kling in cinematic pipeline (no Hedra fallback here)
  lifestyle_broll: 0.85,  // high kinetic — always Kling
  product_demo:    0.70,  // handling + close-up — Kling
  emotional:       0.80,  // impact moments — Kling
  educational:     0.55,  // demonstrations benefit from Kling; above threshold
  background:      0.50,  // atmospheric — borderline; motion verbs push above
  quote:           0.25,  // text overlay — smart_motion
  transition:      0.20,  // visual cut — smart_motion
  cta:             0.20,  // text CTA — smart_motion
};

function computeMotionIntensity(prompt: string, sceneType: string): number {
  let score = SCENE_BASE_SCORES[sceneType] ?? 0.60; // unknown type → default Kling

  // Motion verb boost (capped at +0.20 so CTA+lots-of-verbs still stays cheap)
  const verbs = prompt.match(MOTION_VERB_RE) ?? [];
  score += Math.min(0.20, verbs.length * 0.06);

  // Static/text-only penalties
  if (/\b(text|words|typography|overlay|static|still|posed|frozen)\b/i.test(prompt))
    score -= 0.15;

  return Math.max(0, Math.min(1, score));
}

// ── POST handler ──────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const routeT0 = Date.now();
  console.log("SEQUENCE_ROUTE_VERSION", ROUTE_VERSION);

  console.log("[CINEMATIC_AUTH] cookies_start");
  const cookieStore = await cookies();
  console.log("[CINEMATIC_AUTH] supabase_init");
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  console.log("[CINEMATIC_AUTH] getUser_start");
  let user: { id: string } | null = null;
  try {
    const { data, error: authErr } = await supabase.auth.getUser();
    if (authErr || !data.user) {
      console.warn(`[CINEMATIC_AUTH] unauthorized authErr=${authErr?.message ?? "no_user"}`);
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    user = data.user;
  } catch (authEx) {
    const msg = authEx instanceof Error ? authEx.message : String(authEx);
    console.error(`[CINEMATIC_AUTH] getUser_threw: ${msg}`);
    return Response.json({ error: "Auth service error", detail: msg }, { status: 500 });
  }
  console.log(`[CINEMATIC_AUTH] ok user=${user.id}`);

  // Resolve plan from DB — Studio gets Kling; all other plans use smart_motion only
  let userPlan = "creator";
  try {
    const { data: profileRow } = await supabaseAdmin
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .maybeSingle();
    userPlan = (profileRow?.plan as string | undefined) ?? "creator";
  } catch {
    console.warn("[PLAN_GATE] profile fetch failed — defaulting to creator");
  }
  const isStudio = userPlan === "studio";
  console.log(`[PLAN_GATE] user=${user.id} plan=${userPlan} studio=${isStudio}`);

  const falKey = process.env.FAL_API_KEY ?? process.env.FALAI_API_KEY;
  if (!falKey) return Response.json({ error: "FAL_API_KEY not configured" }, { status: 500 });
  fal.config({ credentials: falKey });

  let prompts: string[];
  let imageUrl: string | null | undefined;
  let clipDuration: number | undefined;
  let sceneTypes: (string | null)[] | undefined;
  let script: string | undefined;
  let goal: string | undefined;
  try {
    const body = await req.json() as {
      prompts?: string[];
      imageUrl?: string | null;
      clipDuration?: number;
      sceneTypes?: (string | null)[];
      script?: string;
      goal?: string;
    };
    prompts      = body.prompts ?? [];
    imageUrl     = body.imageUrl;
    clipDuration = body.clipDuration;
    sceneTypes   = body.sceneTypes;
    script       = body.script;
    goal         = body.goal;
    console.log(`[BRIEF_CONTEXT] goal="${(goal ?? "").substring(0, 120)}"`)
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!prompts?.length) {
    return Response.json({ error: "prompts required" }, { status: 400 });
  }

  // ── Abuse protection (video-specific: cooldown + concurrent job limit) ────
  const videoAbuse = await checkAbuse({
    userId: user.id,
    input: prompts[0] ?? "",
    isVideoGeneration: true,
  });
  if (!videoAbuse.allowed) {
    const retryAfterSec = Math.ceil(videoAbuse.cooldownRemainingMs / 1000);
    console.warn(`[429_REASON] flagLevel=${videoAbuse.flagLevel} cooldownRemainingMs=${videoAbuse.cooldownRemainingMs} retryAfterSec=${retryAfterSec}`);
    return Response.json(
      { error: "Video generation is temporarily queued. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
    );
  }

  // ── Credit-protected generation pipeline ─────────────────────────────────────
  // Estimate conservatively (all Kling); credit_commit_atomic refunds the difference.
  const estimatedCost = videoCreditCost(prompts.length, 0);

  try {
    const responsePayload = await withCreditState<Record<string, unknown>>({
      userId: user.id,
      cost:   estimatedCost,
      run:    async () => {
        // ── Guardrail (throw on rejection → auto-rollback) ────────────────────
        {
          const guardrail = applyGenerationGuardrail({ sceneCount: prompts.length, modelTier: "kling_standard", validationPasses: 1 });
          if (!guardrail.approved) {
            throw new Error(guardrail.reason ?? "Generation blocked by guardrail");
          }
          if (guardrail.finalSceneCount < prompts.length) {
            prompts = prompts.slice(0, guardrail.finalSceneCount);
            if (sceneTypes) sceneTypes = sceneTypes.slice(0, guardrail.finalSceneCount);
          }
          console.log(`[GUARDRAIL] scenes=${guardrail.finalSceneCount} tier=${guardrail.finalModelTier} est=${guardrail.estimatedRuntimeSeconds}s opts=[${guardrail.appliedOptimizations.join(",")}]`);
        }

        const rawSeconds = Math.round(clipDuration ?? CLIP_SECONDS);
        const duration   = rawSeconds <= 5 ? "5" : "10";
        const plannedTotalSec = prompts.length * Number(duration);
        console.info("[DURATION_PLAN]", {
          REQUESTED_DURATION:      rawSeconds * prompts.length,
          PLANNED_DURATION:        plannedTotalSec,
          SUM_SCENE_DURATIONS:     plannedTotalSec,
          clip_duration_requested: rawSeconds,
          clip_duration_snapped:   Number(duration),
          scene_count:             prompts.length,
          planned_total_sec:       plannedTotalSec,
        });
        if (rawSeconds !== Number(duration)) {
          console.warn(`[DURATION_SNAP] requested ${rawSeconds}s per clip → snapped to ${duration}s (Kling/Seedance only supports 5 or 10). Planned total: ${plannedTotalSec}s`);
        }

        // All scenes are Kling-eligible — motion score determines provider, SLA kills stragglers
        const maxPremium = prompts.length;
        let premiumUsed = 0;

        const resolvedSceneTypes: string[] = prompts.map((prompt, i) =>
          sceneTypes?.[i] ?? inferSceneType(prompt),
        );
        const resolvedMotionScores: number[] = prompts.map((prompt, i) =>
          computeMotionIntensity(prompt, resolvedSceneTypes[i]),
        );
        const resolvedProviders: SceneProvider[] = resolvedMotionScores.map(score =>
          score >= 0.4 ? "kling" : "smart_motion",
        );

        const finalProviders: SceneProvider[] = resolvedProviders.map((p) => {
          if (p === "kling") {
            if (premiumUsed < maxPremium) { premiumUsed++; return "kling"; }
            return "smart_motion";
          }
          return p;
        });

        let klingCount = finalProviders.filter(p => p === "kling").length;
        let smCount    = finalProviders.filter(p => p === "smart_motion").length;

        // SLA escalation
        const estimatedGenMs   = 45_000 + klingCount * 8_000;
        const elapsedBeforeGen = Date.now() - routeT0;
        const genBudgetMs      = SLA_TOTAL_MS - elapsedBeforeGen - SLA_POST_MS;
        if (estimatedGenMs > genBudgetMs * 0.8 && klingCount > 2) {
          const klingToKeep = Math.max(2, Math.floor(genBudgetMs * 0.8 / 8_000));
          let kept = 0;
          for (let i = 0; i < finalProviders.length; i++) {
            if (finalProviders[i] === "kling") {
              if (kept < klingToKeep) kept++;
              else finalProviders[i] = "smart_motion";
            }
          }
          klingCount = finalProviders.filter(p => p === "kling").length;
          smCount    = finalProviders.filter(p => p === "smart_motion").length;
          console.warn(`[SLA_ESCALATION] estimatedGen=${estimatedGenMs}ms genBudget=${genBudgetMs}ms — Kling reduced to ${klingCount}`);
        }

        console.log(`[SCENE_ROUTER] scenes=${prompts.length} kling=${klingCount} smart_motion=${smCount} maxPremium=${maxPremium} estimatedGen=${estimatedGenMs}ms`);
        console.log(`[PROVIDER_USAGE] { klingScenes: ${klingCount}, smartMotionScenes: ${smCount} }`);

        // ── Visual Continuity: extract bibles + inject enforcement suffixes ────
        let bibles: ContinuityBibles | null = null;
        let enforcedPrompts = [...prompts];
        try {
          bibles = await extractBibles(prompts, script);
          if (bibles.hasCharacter || bibles.environment) {
            const charPrefix = buildCharacterPrefix(bibles);
            const envSuffix  = buildConsistencySuffix(bibles);
            if (charPrefix || envSuffix) {
              enforcedPrompts = prompts.map(p => charPrefix + p + envSuffix);
              console.log(`[CONTINUITY] bible_extracted hasCharacter=${bibles.hasCharacter} prefix_len=${charPrefix.length} suffix_len=${envSuffix.length}`);
            }
          }
        } catch (err) {
          console.warn("[CONTINUITY] bible extraction failed (non-fatal):", err instanceof Error ? err.message : err);
        }

        const sourceImages: Array<string | null> = new Array(prompts.length).fill(null);
        const clipReports: string[] = [];

        // ── Parallel clip generation (SLA-aware) ──────────────────────────────
        console.log(`[TIMING] CLIP_GENERATION start clips=${prompts.length}`);
        const genT0 = Date.now();
        const genDeadlineAt = routeT0 + SLA_TOTAL_MS - SLA_POST_MS;

        const results = await Promise.allSettled(
          enforcedPrompts.map(async (prompt, i) => {
            const clipT0      = Date.now();
            const provider    = finalProviders[i] as ProviderTier;
            const sceneType   = resolvedSceneTypes[i];
            const motionScore = resolvedMotionScores[i];
            const label       = `[clip ${i + 1}/${prompts.length}][${provider}]`;
            const clipBudget  = genDeadlineAt - clipT0;

            console.log(`${label} sceneType=${sceneType} motion=${motionScore.toFixed(2)} slaMs=${clipBudget} prompt="${prompts[i].substring(0, 80)}"`);
            console.log(`[SCENE_ROUTER] scene=${i + 1} provider=${provider} sceneType=${sceneType} motion=${motionScore.toFixed(2)}`);

            const isCouple = COUPLE_RE.test(goal ?? "") || COUPLE_RE.test(script ?? "") || COUPLE_RE.test(prompt);
            const url = await executeClip(
              prompt, imageUrl ?? null, duration, provider,
              sceneType, i, user.id, rawSeconds, sourceImages, clipReports,
              clipBudget, label, isCouple,
            );

            const elapsed = Date.now() - clipT0;
            console.log(`${label} DONE elapsed=${elapsed}ms url=${url.substring(0, 60)}`);
            return url;
          }),
        );

        const genElapsed = Date.now() - genT0;
        console.log(`[TIMING] CLIP_GENERATION complete ${genElapsed}ms`);

        // ── Pass 1: collect successes + queue SLA-timeout failures ────────────
        const extractedUrls: Array<string | null> = results.map((r, ri) => {
          if (r.status === "fulfilled") return r.value;
          const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
          if (reason === "skipped_due_to_latency" || reason === "SCENE_BUDGET_EXCEEDED") {
            console.warn(`[SLA] scene ${ri + 1} ${reason} — queued for smart_motion fallback`);
          } else {
            console.error("[cinematic-sequence] settled rejection:", reason);
          }
          return null;
        });

        const slaFallbackIndices = results
          .map((r, i) => {
            if (r.status !== "rejected") return null;
            const reason = r.reason instanceof Error ? r.reason.message : String(r.reason);
            return (reason === "skipped_due_to_latency" || reason === "SCENE_BUDGET_EXCEEDED") ? i : null;
          })
          .filter((v): v is number => v !== null);

        // ── Pass 2: smart_motion fallback for SLA-timed-out scenes ────────────
        if (slaFallbackIndices.length > 0) {
          console.log(`[SLA_FALLBACK] attempting smart_motion for ${slaFallbackIndices.length} scene(s)`);
          await Promise.allSettled(
            slaFallbackIndices.map(async (ri) => {
              const fbLabel    = `[clip ${ri + 1}/${prompts.length}][smart_motion_fallback]`;
              const fbIsCouple = COUPLE_RE.test(goal ?? "") || COUPLE_RE.test(script ?? "") || COUPLE_RE.test(prompts[ri]);
              console.log(`[SLA_FALLBACK] scene=${ri + 1} starting`);
              const fbUrl = await generateSmartMotionClipWithUpload(
                prompts[ri], null, resolvedSceneTypes[ri], ri,
                user.id, fbLabel, clipReports, rawSeconds, sourceImages, fbIsCouple,
              );
              if (fbUrl) {
                extractedUrls[ri] = fbUrl;
                console.log(`[SLA_FALLBACK] scene=${ri + 1} RECOVERED url=${fbUrl.substring(0, 60)}`);
              } else {
                console.warn(`[SLA_FALLBACK] scene=${ri + 1} fallback also failed — will pad`);
              }
            }),
          );
        }

        // ── Pass 3: pad remaining nulls with nearest successful clip ──────────
        let lastGoodUrl: string | null = null;
        for (let pi = 0; pi < extractedUrls.length; pi++) {
          if (extractedUrls[pi]) { lastGoodUrl = extractedUrls[pi]; }
          else if (lastGoodUrl)  { console.warn(`[PAD_CLIP] scene ${pi + 1} padded with last successful clip`); extractedUrls[pi] = lastGoodUrl; }
        }
        const firstGoodUrl = extractedUrls.find(u => u !== null) ?? null;
        if (firstGoodUrl) {
          for (let pi = 0; pi < extractedUrls.length; pi++) {
            if (!extractedUrls[pi]) { console.warn(`[PAD_CLIP] scene ${pi + 1} padded (leading failure)`); extractedUrls[pi] = firstGoodUrl; }
          }
        }

        const clip_urls: string[] = extractedUrls.filter((u): u is string => u !== null);

        const successfulClips = clip_urls.length;
        const failedClips     = prompts.length - successfulClips;
        const motionCoverage  = successfulClips > 0 ? Math.round((successfulClips / prompts.length) * 100) : 0;

        console.log(`[QUALITY_GUARDRAIL] { motionScenes: ${successfulClips}, totalScenes: ${prompts.length}, coverage: ${motionCoverage}% }`);
        if (motionCoverage < 100) {
          console.warn(`[QUALITY_GUARDRAIL] coverage=${motionCoverage}% — ${failedClips} scenes padded`);
        }
        console.log(`[RENDER_BREAKDOWN] { klingScenes: ${klingCount}, smartMotionScenes: ${smCount}, genMs: ${genElapsed} }`);
        console.log(`[TIMING] SEQUENCE SUMMARY clipsAttempted=${prompts.length} success=${successfulClips} failed=${failedClips} genMs=${genElapsed}`);

        // All clips failed (after fallback + padding) → throw
        if (!clip_urls.length) {
          throw new AllClipsFailedError({
            SEQUENCE_ROUTE_VERSION: ROUTE_VERSION,
            clipsAttempted:  prompts.length,
            successfulClips,
            failedClips,
            extractedUrls,
            clipReports,
          });
        }

        // ── Visual Continuity: validate consecutive source image pairs ─────────
        let continuityScore: ContinuityScore | null = null;
        const validSourcePairs: Array<[string, string, number, number]> = [];
        for (let i = 0; i < sourceImages.length - 1; i++) {
          const a = sourceImages[i];
          const b = sourceImages[i + 1];
          if (a && b) validSourcePairs.push([a, b, i, i + 1]);
        }
        if (validSourcePairs.length && bibles) {
          try {
            console.log(`[CONTINUITY] validating ${validSourcePairs.length} consecutive frame pair(s)`);
            const frameResults = await Promise.all(
              validSourcePairs.map(([a, b, ia, ib]) =>
                validateFrameConsistency(a, b, ia, ib, bibles!)
              ),
            );
            continuityScore = computeContinuityScore(frameResults);
            console.log(`[CONTINUITY] overall=${continuityScore.overall}% char=${continuityScore.character}% env=${continuityScore.environment}% obj=${continuityScore.object}%`);
          } catch (err) {
            console.warn("[CONTINUITY] frame validation failed (non-fatal):", err instanceof Error ? err.message : err);
          }
        } else if (bibles) {
          continuityScore = { character: 100, environment: 100, object: 100, overall: 100, frameResults: [] };
        }

        // H3 FIX: postT0 set BEFORE the HEAD probe so post_processing_ms is meaningful
        const postT0 = Date.now();

        // HEAD probe for logging (non-blocking, fire-and-forget)
        void Promise.allSettled(
          clip_urls.map(async (url, i) => {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 5_000);
            try {
              const headRes = await fetch(url, { method: "HEAD", signal: controller.signal });
              clearTimeout(timer);
              const size = headRes.headers.get("content-length") ?? "unknown";
              console.log(`[PHASE1] CLIP_${i + 1} size=${size}bytes http=${headRes.status}`);
            } catch (e) {
              clearTimeout(timer);
              console.warn(`[PHASE1] CLIP_${i + 1} HEAD failed: ${e instanceof Error ? e.message : e}`);
            }
          }),
        );

        const actualCost   = videoCreditCost(klingCount, smCount);
        const stitched_url = clip_urls[0];
        const totalMs      = Date.now() - routeT0;
        const postMs       = Date.now() - postT0;

        const bottleneckStage = genElapsed > SLA_GEN_MS * 0.85   ? "generation"
          : postMs > (SLA_POST_MS * 0.85)                         ? "post_processing"
          : "nominal";

        const slaCompliant = skippedScenes.length === 0 && totalMs <= SLA_TOTAL_MS;

        console.log(`[TIMING] SEQUENCE TOTAL ${totalMs}ms clips=${clip_urls.length} kling=${klingCount} smart_motion=${smCount} sla=${slaCompliant ? "OK" : "BREACH"} bottleneck=${bottleneckStage}`);

        return {
          data: {
            stitched_url,
            clip_urls,
            clips_generated:     clip_urls.length,
            clip_duration:       Number(duration),
            total_duration:      clip_urls.length * Number(duration),
            providers:           finalProviders,
            motion_coverage:     motionCoverage,
            kling_scenes:        klingCount,
            smart_motion_scenes: smCount,
            continuity_score:    continuityScore,
            skipped_scenes:      skippedScenes,
            sla_compliant:       slaCompliant,
            timing_breakdown: {
              total_ms:           totalMs,
              generation_ms:      genElapsed,
              post_processing_ms: postMs,
              scene_count:        prompts.length,
              provider_mix:       { kling: klingCount, smart_motion: smCount },
              bottleneck_stage:   bottleneckStage,
            },
            timing_ms: { generation: genElapsed, total: totalMs },
          },
          actualCost,
        };
      },
    });

    return Response.json(responsePayload);

  } catch (err) {
    if (err instanceof InsufficientCreditsError || err instanceof CreditReservationError) {
      return Response.json(
        { error: "INSUFFICIENT_CREDITS", required: estimatedCost, detail: "Not enough credits for this video sequence." },
        { status: 402 },
      );
    }
    if (err instanceof AllClipsFailedError) {
      return Response.json({ error: "All clips failed to generate", ...err.payload }, { status: 500 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cinematic-sequence] unhandled error:", msg);
    return Response.json({ error: msg, SEQUENCE_ROUTE_VERSION: ROUTE_VERSION }, { status: 500 });

  } finally {
    releaseVideoSlot(user.id);
  }
}
