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
import { generateRunwayClip, generateRunwaySeedanceClip } from "@/lib/services/runway";
import { stitchClipsWithAudio } from "@/lib/services/elevenlabs";
import { mirrorToSupabase }     from "@/lib/utils/mirror-to-supabase";

import type {
  PipelineInput,
  PipelineResult,
  SceneContract,
  SceneOutput,
} from "./types";

const FAL_ENDPOINT = "https://fal.run/fal-ai/flux/dev";

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const t0 = Date.now();
  log("START", `script=${input.script.length}chars voice=${input.voiceId} niche=${input.niche} target=${input.targetDuration}s`);

  // ── Step 1: Director — locked plan + per-scene visual specs ─────────────────
  log("STEP_1", "Director AI — building plan and scene specs");
  const { plan, skeletons: specs } = await runDirectorAI(
    input.script,
    input.voiceId,
    input.niche,
    input.targetDuration,
    input.referenceImageUrl,
  );

  // ── Step 2: Voice — timing authority, freezes the timeline ──────────────────
  log("STEP_2", `Voice Engine — generating narration voice=${input.voiceId}`);
  const voice = await runVoiceEngine(specs, input.voiceId, input.userId);
  log("STEP_2_DONE", `totalDuration=${(voice.totalDurationMs / 1000).toFixed(2)}s scenes=${voice.timings.length}`);

  // ── Step 3: SceneContracts — immutable compiled truth ───────────────────────
  // SceneSpec + VoiceTiming + DirectorPlan = contract. Nothing downstream rewrites it.
  log("STEP_3", "Compile contracts — binding specs + timings -> immutable contracts");
  const contracts = compileContracts(plan, specs, voice.timings);

  // ── Step 4: Images — one Flux image per contract ────────────────────────────
  log("STEP_4", `Images — generating ${contracts.length} Flux images in parallel`);
  const rawImageUrls = await generateImages(contracts, input.referenceImageUrl);

  // Mirror fal.media URLs to Supabase (Runway rejects fal.media CDN)
  const imageUrls = await mirrorImages(rawImageUrls, input.userId);

  // ── Step 5: Vision gate — validate image against contract before Runway ──────
  log("STEP_5", "Vision gate — checking images against contracts, repairing failures");
  const validatedUrls = await validateAndRepairImages(contracts, imageUrls, input.userId);

  // ── Step 6: Clips — one Runway clip per contract ─────────────────────────────
  log("STEP_6", `Clips — generating ${contracts.length} Runway clips in parallel`);
  const clipResults = await generateClips(contracts, validatedUrls, input.speedMode);

  const successCount = clipResults.filter(r => r.passed).length;
  if (successCount === 0) throw new Error("All clip generation failed — cannot assemble");

  // ── Step 7: Assembly — voice-synced single pass ──────────────────────────────
  // maxDuration = authoritative voice duration. FFmpeg -t caps output exactly here.
  const maxDuration = voice.totalDurationMs / 1000;
  log("STEP_7", `Assembly — ${successCount}/${contracts.length} clips maxDuration=${maxDuration.toFixed(2)}s`);

  const clipUrls = clipResults.map(r => r.clipUrl).filter(Boolean) as string[];
  const videoUrl = await withRetry(
    () => stitchClipsWithAudio({ clipUrls, audioUrl: voice.audioUrl, userId: input.userId, maxDuration }),
    "assembly",
    "final assembly",
  );

  const elapsed = Date.now() - t0;
  log("DONE", `elapsed=${(elapsed / 1000).toFixed(1)}s clips=${successCount}/${contracts.length} url=${videoUrl.slice(0, 60)}`);

  return {
    videoUrl,
    audioUrl:        voice.audioUrl,
    durationSeconds: maxDuration,
    sceneCount:      contracts.length,
    scenes:          clipResults,
    qualityScore:    successCount / contracts.length,
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
        () => generateOneImage(contract, falKey, i === 0 ? referenceImageUrl : undefined),
        "image",
        `image scene=${contract.index + 1}`,
      )
    )
  );

  let lastGoodUrl = referenceImageUrl ?? "";
  return results.map((r, i) => {
    if (r.status === "fulfilled") { lastGoodUrl = r.value; return r.value; }
    log("WARN", `Image failed scene=${i + 1}: ${(r.reason as Error)?.message?.slice(0, 80)}`);
    return lastGoodUrl;
  });
}

export async function generateOneImage(
  contract:           SceneContract,
  falKey:             string,
  referenceImageUrl?: string,
): Promise<string> {
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

async function generateClips(
  contracts: SceneContract[],
  imageUrls: string[],
  speedMode: "fast" | "quality",
): Promise<SceneOutput[]> {
  // Scene 0 (anchor) first — its last frame feeds scenes 1..N for continuity
  const anchorResult = await generateOneClip(contracts[0], imageUrls[0], speedMode);
  const results: SceneOutput[] = [anchorResult];

  if (contracts.length === 1) return results;

  // Extract anchor last frame for visual continuity on scenes 1..N
  let chainFrame: string | null = null;
  if (anchorResult.clipUrl) {
    try {
      const { extractLastFrame } = await import("@/lib/utils/extract-last-frame");
      chainFrame = await extractLastFrame(anchorResult.clipUrl, "", 0);
      if (chainFrame) log("CHAIN", "anchor last frame ready");
    } catch {
      log("WARN", "Last frame extraction failed — scenes 1..N use own images");
    }
  }

  // Scenes 1..N in parallel (600ms stagger avoids Runway 429)
  const restResults = await Promise.allSettled(
    contracts.slice(1).map(async (contract, idx) => {
      if (idx > 0) await sleep(idx * 600);
      const sceneImg = imageUrls[contract.index] || chainFrame || imageUrls[0];
      return generateOneClip(contract, sceneImg, speedMode);
    })
  );

  restResults.forEach((r, idx) => {
    if (r.status === "fulfilled") {
      results.push(r.value);
    } else {
      log("WARN", `Clip failed scene=${idx + 2}: ${(r.reason as Error)?.message?.slice(0, 80)}`);
      results.push({
        index:         idx + 1,
        imageUrl:      imageUrls[idx + 1] ?? "",
        clipUrl:       null,
        durationSec:   contracts[idx + 1].clipDurationSec,
        provider:      "runway",
        imageAttempts: 1,
        clipAttempts:  2,
        passed:        false,
      });
    }
  });

  results.sort((a, b) => a.index - b.index);
  return results;
}

async function generateOneClip(
  contract:  SceneContract,
  imageUrl:  string,
  speedMode: "fast" | "quality",
): Promise<SceneOutput> {
  // Attempt 1–2: primary provider (gen4_turbo for fast, Seedance2 for quality)
  // Attempt 3:   provider switch — if primary fails twice, cross to the other
  let attempts     = 0;
  let usedProvider = speedMode === "quality" ? "seedance2" : "gen4_turbo";
  let lastErr: unknown;

  for (let attempt = 1; attempt <= 3; attempt++) {
    attempts++;
    try {
      const switchNow = attempt === 3; // switch provider on third attempt
      const useQuality = switchNow
        ? speedMode !== "quality"  // cross-switch: fast→quality, quality→fast
        : speedMode === "quality";

      const r = useQuality
        ? await generateRunwaySeedanceClip({
            prompt:      contract.videoPrompt,
            imageUrl:    imageUrl || undefined,
            duration:    contract.clipDurationSec,
            aspectRatio: "9:16",
            fast:        false,
          })
        : await generateRunwayClip({
            prompt:      contract.videoPrompt,
            imageUrl:    imageUrl || undefined,
            duration:    contract.clipDurationSec as 5 | 10,
            aspectRatio: "9:16",
          });

      usedProvider = useQuality ? "seedance2" : "gen4_turbo";
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
      log("WARN", `Clip scene=${contract.index + 1} attempt=${attempt} ${decision.category}${decision.switchProvider ? " → switching provider" : ""}`);
      if (!decision.shouldRetry && !decision.switchProvider) break;
      if (decision.delayMs > 0) await sleep(decision.delayMs);
    }
  }

  throw lastErr;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function log(tag: string, msg: string): void {
  console.log(`[PIPELINE:${tag}] ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
