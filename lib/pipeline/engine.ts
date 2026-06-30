/**
 * Pipeline Engine — deterministic scene compiler with media backends.
 *
 * Execution model:
 *   DirectorPlan + SceneSpecs  →  locked global constraints + per-scene intent
 *   Voice                      →  timing authority (freezes timeline)
 *   SceneContracts             →  SceneSpec + VoiceTiming + DirectorPlan = immutable truth
 *   Images                     →  one Flux image per contract
 *   Vision validate + repair   →  gate before wasting a Runway credit
 *   Clips                      →  one Runway clip per contract
 *   Assembly                   →  single FFmpeg pass, voice-duration capped
 *
 * INVARIANT: SceneContract is the single source of truth.
 * Nothing downstream may redefine it. Everything reads from it.
 */

import { runDirectorAI }       from "./director";
import { runVoiceEngine }       from "./voice-engine";
import { compileContracts }     from "./contract-compiler";
import { withRetry, classifyError, getRetryDecision } from "./retry-policy";
import { validateImage }        from "./vision-validator";
import { validateExecutionContract } from "./execution-contract";
import { generateRunwayClip } from "@/lib/services/runway";
import { generateKlingClip, isDirectKlingAvailable } from "@/lib/providers/kling-direct";
import { stitchClipsWithAudio } from "@/lib/services/elevenlabs";
import { mirrorToSupabase }     from "@/lib/utils/mirror-to-supabase";

import type {
  PipelineInput,
  PipelineResult,
  PipelineStage,
  DebugPacket,
  SceneContract,
  SceneOutput,
  SceneAnalytics,
} from "./types";
import { createMemory, updateMemory, selectProvider } from "./types";

const FAL_ENDPOINT = "https://fal.run/fal-ai/flux/dev";
const DEBUG_PIPELINE = process.env.PIPELINE_DEBUG === "true";

// ── Debug packet collector ────────────────────────────────────────────────────

function stage<T>(
  packets:  DebugPacket[],
  name:     PipelineStage,
  input:    Record<string, unknown>,
  fn:       () => Promise<T>,
): Promise<T> {
  if (!DEBUG_PIPELINE) return fn();

  const t = Date.now();
  return fn().then(
    result => {
      packets.push({
        stage:          name,
        status:         "ok",
        latencyMs:      Date.now() - t,
        inputSnapshot:  input,
        outputSnapshot: summarise(result),
      });
      return result;
    },
    err => {
      packets.push({
        stage:          name,
        status:         "fail",
        latencyMs:      Date.now() - t,
        inputSnapshot:  input,
        outputSnapshot: {},
        error:          err instanceof Error ? err.message : String(err),
      });
      throw err;
    },
  );
}

function summarise(v: unknown): Record<string, unknown> {
  if (v === null || v === undefined) return {};
  if (typeof v !== "object") return { value: v };
  const obj = v as Record<string, unknown>;
  // Truncate large arrays and strings to keep snapshots readable
  const summary: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(obj)) {
    if (Array.isArray(val))        summary[k] = `Array(${val.length})`;
    else if (typeof val === "string" && val.length > 120) summary[k] = val.slice(0, 120) + "…";
    else summary[k] = val;
  }
  return summary;
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const t0 = Date.now();
  const packets: DebugPacket[] = [];
  log("START", `script=${input.script.length}chars voice=${input.voiceId} niche=${input.niche} target=${input.targetDuration}s debug=${DEBUG_PIPELINE}`);

  // ── Step 1: Director — locked plan + per-scene visual specs ─────────────────
  log("STEP_1", "Director AI — building plan and scene specs");
  const { plan, skeletons: specs } = await stage(
    packets, "director",
    { scriptLen: input.script.length, niche: input.niche, targetDuration: input.targetDuration },
    () => runDirectorAI(input.script, input.voiceId, input.niche, input.targetDuration, input.referenceImageUrl),
  );

  // ── Step 2: Voice — timing authority, freezes the timeline ──────────────────
  console.info(`[VOICE_ID_CHECK] voiceId=${input.voiceId} scriptLen=${input.script.length}`);
  log("STEP_2", `Voice Engine — generating narration voice=${input.voiceId}`);
  const voice = await stage(
    packets, "voice",
    { voiceId: input.voiceId, sceneCount: specs.length },
    () => runVoiceEngine(specs, input.voiceId, input.userId),
  );
  log("STEP_2_DONE", `totalDuration=${(voice.totalDurationMs / 1000).toFixed(2)}s scenes=${voice.timings.length}`);

  // ── Step 3: SceneContracts — immutable compiled truth ───────────────────────
  log("STEP_3", "Compile contracts — binding specs + timings -> immutable contracts");
  const contracts = await stage(
    packets, "compile",
    { skeletonCount: specs.length, timingCount: voice.timings.length },
    async () => compileContracts(plan, specs, voice.timings, input.brandMemory),
  );

  // ── Execution Contract gate — throws before any credit is spent ─────────────
  await stage(
    packets, "contract_gate",
    { contractCount: contracts.length, voiceDurationMs: voice.totalDurationMs },
    async () => {
      validateExecutionContract(contracts, voice);
      log("CONTRACT_OK", `${contracts.length} scenes — contract checks advisory (non-blocking)`);
      return {};
    },
  );

  // ── Step 4: Images — one Flux image per contract ────────────────────────────
  log("STEP_4", `Images — generating ${contracts.length} Flux images in parallel`);
  const rawImageUrls = await stage(
    packets, "images",
    { contractCount: contracts.length },
    () => generateImages(contracts, input.referenceImageUrl),
  );

  // Mirror fal.media URLs to Supabase (Runway rejects fal.media CDN)
  const imageUrls = await mirrorImages(rawImageUrls, input.userId);

  // ── Step 5: Vision gate — DISABLED, using images as-is ──────────────────────
  log("STEP_5", "Vision gate disabled — using images as-is");
  console.info("[VISION_GATE_DISABLED] skipping vision check — using image as-is");
  const validatedUrls = imageUrls;

  // ── Step 6: Clips — one Runway clip per contract ─────────────────────────────
  log("STEP_6", `Clips — generating ${contracts.length} Runway clips sequentially`);
  const clipResults = await stage(
    packets, "clips",
    { contractCount: contracts.length, speedMode: input.speedMode },
    () => generateClips(contracts, validatedUrls, input.speedMode),
  );

  const successCount = clipResults.filter(r => r.passed).length;
  if (successCount === 0) throw new Error("All clip generation failed — cannot assemble");

  // ── Step 7: Assembly — voice-synced single pass ──────────────────────────────
  const maxDuration = voice.totalDurationMs / 1000;
  log("STEP_7", `Assembly — ${successCount}/${contracts.length} clips maxDuration=${maxDuration.toFixed(2)}s`);

  const clipUrls = clipResults.map(r => r.clipUrl).filter(Boolean) as string[];
  const videoUrl = await stage(
    packets, "assembly",
    { clipCount: clipUrls.length, maxDuration },
    () => withRetry(
      () => stitchClipsWithAudio({ clipUrls, audioUrl: voice.audioUrl, userId: input.userId, maxDuration }),
      "assembly",
      "final assembly",
    ),
  );

  const analytics     = scoreAnalytics(contracts, clipResults);
  const trailerScenes = selectTrailerScenes(contracts, clipResults);

  const elapsed = Date.now() - t0;
  log("DONE", `elapsed=${(elapsed / 1000).toFixed(1)}s clips=${successCount}/${contracts.length} url=${videoUrl.slice(0, 60)}`);

  return {
    videoUrl,
    audioUrl:        voice.audioUrl,
    durationSeconds: maxDuration,
    sceneCount:      contracts.length,
    scenes:          clipResults,
    qualityScore:    successCount / contracts.length,
    analytics,
    trailerScenes,
    debugPackets: DEBUG_PIPELINE ? packets : undefined,
  };
}

// ── Step 4: Image generation ───────────────────────────────────────────────────

async function generateImages(
  contracts:          SceneContract[],
  referenceImageUrl?: string,
): Promise<string[]> {
  const falKey = process.env.FAL_API_KEY ?? process.env.FALAI_API_KEY;
  if (!falKey) {
    log("WARN", "No FAL_API_KEY — skipping image generation, will use reference or t2v");
    return contracts.map(() => referenceImageUrl ?? "");
  }

  const results = await Promise.allSettled(
    contracts.map((contract, i) =>
      withRetry(
        () => generateOneImage(contract, falKey, referenceImageUrl, i === 0 ? 0.85 : 0.65),
        "image",
        `image scene=${contract.index + 1}`,
      )
    )
  );

  let lastGoodUrl = referenceImageUrl ?? "";
  const finalResults = await Promise.allSettled(
    results.map(async (r, i) => {
      if (r.status === "fulfilled") { lastGoodUrl = r.value; return r.value; }
      log("WARN", `Flux failed scene=${i + 1}: ${(r.reason as Error)?.message?.slice(0, 80)} — trying DALL·E fallback`);
      // DALL·E fallback — only if OPENAI_API_KEY is configured
      const openaiKey = process.env.OPENAI_API_KEY;
      if (!openaiKey) { return lastGoodUrl; }
      try {
        const dalle = await fetch("https://api.openai.com/v1/images/generations", {
          method: "POST",
          headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model:   "dall-e-3",
            prompt:  contracts[i].imagePrompt.slice(0, 1000),
            n:       1,
            size:    "1024x1792",
            quality: "standard",
          }),
          signal: AbortSignal.timeout(50_000),
        });
        if (!dalle.ok) throw new Error(`DALL·E HTTP ${dalle.status}`);
        const data = await dalle.json();
        const url  = data.data?.[0]?.url;
        if (!url) throw new Error("DALL·E returned no URL");
        log("IMG_DALLE_OK", `scene=${i + 1} url=${url.slice(0, 60)}`);
        return url;
      } catch (err) {
        log("WARN", `DALL·E fallback failed scene=${i + 1}: ${(err as Error)?.message?.slice(0, 60)}`);
        return lastGoodUrl;
      }
    })
  );
  return finalResults.map((r, i) => {
    if (r.status === "fulfilled") return r.value;
    return lastGoodUrl || "";
  });
}

export async function generateOneImage(
  contract:           SceneContract,
  falKey:             string,
  referenceImageUrl?: string,
  referenceStrength:  number = 0.85,
): Promise<string> {
  console.info(`[FLUX_REF_CHECK] scene=${contract.index + 1} referenceImageUrl=${referenceImageUrl?.slice(0, 80) ?? "none"} strength=${referenceStrength}`);
  const res = await fetch(FAL_ENDPOINT, {
    method:  "POST",
    headers: { Authorization: `Key ${falKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt:          contract.imagePrompt,
      negative_prompt: contract.negativePrompt,
      num_images:      1,
      image_size:      { width: 1080, height: 1920 },
      num_inference_steps: 28,
      guidance_scale:  3.5,
      enable_safety_checker: true,
      ...(referenceImageUrl ? { image_url: referenceImageUrl, strength: referenceStrength } : {}),
    }),
    signal: AbortSignal.timeout(50_000),
  });

  if (!res.ok) throw new Error(`Flux HTTP ${res.status} scene ${contract.index + 1}`);
  const data = await res.json();
  const url  = data.images?.[0]?.url;
  if (!url) throw new Error(`Flux returned no image URL scene ${contract.index + 1}`);

  log("IMG_OK", `scene=${contract.index + 1} url=${url.slice(0, 60)}`);
  return url;
}

// ── Mirror images ──────────────────────────────────────────────────────────────

async function mirrorImages(imageUrls: string[], userId: string): Promise<string[]> {
  const results = await Promise.allSettled(
    imageUrls.map((url, i) =>
      url && (url.includes("fal.media") || url.includes("fal.run"))
        ? mirrorToSupabase(url, userId, i)
        : Promise.resolve(url)
    )
  );
  return results.map((r, i) => {
    if (r.status === "fulfilled") return r.value ?? imageUrls[i];
    log("WARN", `Mirror failed scene=${i + 1}: ${(r.reason as Error)?.message?.slice(0, 60)}`);
    return imageUrls[i];
  });
}

// ── Step 5: Vision gate ────────────────────────────────────────────────────────

async function validateAndRepairImages(
  contracts: SceneContract[],
  imageUrls: string[],
  userId:    string,
): Promise<string[]> {
  const falKey  = process.env.FAL_API_KEY ?? process.env.FALAI_API_KEY;
  const results = [...imageUrls];

  // Run sequentially so each scene can reference the previous contract for continuity
  for (let i = 0; i < contracts.length; i++) {
    const contract  = contracts[i];
    const prevContract = i > 0 ? contracts[i - 1] : undefined;
    const url       = imageUrls[i];
    if (!url) continue;

    const vr = await validateImage(url, contract, prevContract);
    if (vr.passed) continue;

    log("VISION_FAIL", `scene=${contract.index + 1} score=${vr.score.toFixed(2)} issues=${vr.issues.join("; ")}`);
    if (!falKey) continue;

    // Retry once — regenerate the failing scene only, never restart pipeline
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const repairedUrl = await generateOneImage(contract, falKey, undefined);
        const recheck     = await validateImage(repairedUrl, contract, prevContract);
        log("VISION_REPAIR", `scene=${contract.index + 1} attempt=${attempt} score=${recheck.score.toFixed(2)} passed=${recheck.passed}`);
        if (recheck.score >= vr.score) {
          const mirrored = await mirrorToSupabase(repairedUrl, userId, i);
          results[i] = mirrored ?? repairedUrl;
          break;
        }
      } catch (err) {
        log("WARN", `Vision repair failed scene=${contract.index + 1} attempt=${attempt}: ${(err as Error)?.message?.slice(0, 60)}`);
      }
    }
  }

  return results;
}

// ── Step 6: Clip generation ────────────────────────────────────────────────────
// Sequential: each scene locks its contract before the next begins.
// ContinuityMemory threads through the loop — previous scene state available.
// Last-frame chaining: anchor (scene 0) last frame used as scene 1..N reference.

async function generateClips(
  contracts: SceneContract[],
  imageUrls: string[],
  speedMode: "fast" | "quality",
): Promise<SceneOutput[]> {
  const results: SceneOutput[] = [];
  let memory = createMemory();
  let chainFrame: string | null = null;

  for (let i = 0; i < contracts.length; i++) {
    const contract = contracts[i];
    const sceneImg  = imageUrls[i] || chainFrame || imageUrls[0];

    const routedProvider = selectProvider("video", contract);
    const useQuality = speedMode === "quality";

    log("CLIP_START", `scene=${contract.index + 1} role=${contract.narrativeRole} motion=${contract.motion} routed=${routedProvider}`);

    try {
      const result = await generateOneClip(contract, sceneImg, useQuality ? "quality" : "fast");
      results.push(result);

      // Update continuity memory with locked contract state
      memory = updateMemory(memory, contract);

      // Extract last frame of scene 0 for chaining into scene 1..N
      if (i === 0 && result.clipUrl) {
        try {
          const { extractLastFrame } = await import("@/lib/utils/extract-last-frame");
          chainFrame = await extractLastFrame(result.clipUrl, "", 0);
          if (chainFrame) log("CHAIN", "anchor last frame ready for continuity");
        } catch {
          log("WARN", "Last frame extraction failed — scenes 1..N use own images");
        }
      }
    } catch (err) {
      log("WARN", `Clip failed scene=${contract.index + 1}: ${(err as Error)?.message?.slice(0, 80)}`);
      results.push({
        index:         contract.index,
        imageUrl:      sceneImg,
        clipUrl:       null,
        durationSec:   contract.clipDurationSec,
        provider:      "runway",
        imageAttempts: 1,
        clipAttempts:  3,
        passed:        false,
      });
    }
  }

  return results;
}

async function generateOneClip(
  contract:  SceneContract,
  imageUrl:  string,
  speedMode: "fast" | "quality",
): Promise<SceneOutput> {
  let attempts     = 0;
  let usedProvider = "gen4_turbo";
  let lastErr: unknown;

  const MAX_ATTEMPTS = isDirectKlingAvailable() ? 4 : 3;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    attempts++;
    try {
      // Attempt 4 = Kling last-resort fallback
      if (attempt === 4) {
        const r = await generateKlingClip({
          prompt:      contract.videoPrompt,
          imageUrl:    imageUrl || undefined,
          duration:    contract.clipDurationSec,
          aspectRatio: "9:16",
          mode:        "std",
          sceneNumber: contract.index + 1,
        });
        usedProvider = "kling";
        log("CLIP_OK", `scene=${contract.index + 1} provider=kling attempt=4 ${r.generationMs}ms`);
        return {
          index:         contract.index,
          imageUrl,
          clipUrl:       r.videoUrl,
          durationSec:   contract.clipDurationSec,
          provider:      "kling",
          imageAttempts: 1,
          clipAttempts:  attempts,
          passed:        true,
        };
      }

      // Runway Gen-4 Turbo only — Seedance disabled (returns 400 validation errors)
      const r = await generateRunwayClip({
        prompt:      contract.videoPrompt,
        imageUrl:    imageUrl || undefined,
        duration:    contract.clipDurationSec as 5 | 10,
        aspectRatio: "9:16",
      });

      usedProvider = "gen4_turbo";
      log("CLIP_OK", `scene=${contract.index + 1} provider=${usedProvider} attempt=${attempt} ${r.generationMs}ms`);

      return {
        index:         contract.index,
        imageUrl,
        clipUrl:       r.videoUrl,
        durationSec:   contract.clipDurationSec,
        provider:      usedProvider,
        imageAttempts: 1,
        clipAttempts:  attempts,
        passed:        true,
      };
    } catch (err) {
      lastErr = err;
      const decision = getRetryDecision(err, attempt, "clip");
      log("WARN", `Clip scene=${contract.index + 1} attempt=${attempt} ${decision.category}${decision.switchProvider ? " → switching provider" : ""}${attempt === MAX_ATTEMPTS ? " → abort" : ""}`);
      if (attempt < MAX_ATTEMPTS && !decision.shouldRetry && !decision.switchProvider) break;
      if (decision.delayMs > 0) await sleep(decision.delayMs);
    }
  }

  throw lastErr;
}

// ── Analytics scoring ─────────────────────────────────────────────────────────
// Deterministic heuristics from data the pipeline already has.
// No viewer feedback required — this is a pre-publish quality signal.

function scoreAnalytics(
  contracts:  SceneContract[],
  outputs:    SceneOutput[],
): SceneAnalytics[] {
  const roleRetentionWeight: Record<string, number> = {
    hook:        0.95,  // must grab attention immediately
    context:     0.60,  // informational — lower inherent tension
    escalation:  0.85,  // rising energy
    payoff:      0.90,  // emotional resolution — high engagement
  };

  return contracts.map((c, i) => {
    const out = outputs[i];
    const passed = out?.passed ? 1 : 0;
    const visionScore = out?.visionScore ?? (passed ? 0.8 : 0.3);
    const role = c.retentionRole ?? "context";

    return {
      sceneIndex:       c.index,
      retentionRole:    c.retentionRole,
      retentionScore:   roleRetentionWeight[role] ?? 0.6,
      clarityScore:     passed,          // passed validation = action was clear
      visualImpact:     visionScore * (roleRetentionWeight[role] ?? 0.6),
      consistencyScore: visionScore,
    };
  });
}

// ── Trailer selector ──────────────────────────────────────────────────────────
// Selects ~15s worth of scenes ordered by impact, not story order.
// Returns indices into the contracts array — not scene indices.
// Trailer generation itself happens downstream using these clip URLs.

export function selectTrailerScenes(
  contracts: SceneContract[],
  outputs:   SceneOutput[],
  targetSec  = 15,
): number[] {
  const impactScore = (c: SceneContract, o: SceneOutput): number => {
    const roleScore: Record<string, number> = { hook: 4, escalation: 3, payoff: 5, context: 1 };
    const base = roleScore[c.retentionRole ?? "context"] ?? 1;
    return base * (o?.passed ? 1 : 0.3);
  };

  const ranked = contracts
    .map((c, i) => ({ i, score: impactScore(c, outputs[i]), dur: c.clipDurationSec }))
    .filter(x => outputs[x.i]?.clipUrl)             // only scenes with a clip
    .sort((a, b) => b.score - a.score);              // highest impact first

  const selected: number[] = [];
  let totalSec = 0;
  for (const item of ranked) {
    if (totalSec + item.dur > targetSec + 2) continue; // allow 2s overshoot
    selected.push(item.i);
    totalSec += item.dur;
    if (totalSec >= targetSec) break;
  }

  return selected.sort((a, b) => a - b); // restore story order for assembly
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function log(tag: string, msg: string): void {
  console.log(`[PIPELINE:${tag}] ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
