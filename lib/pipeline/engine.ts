/**
 * Pipeline Engine — Orchestrator
 *
 * Executes the full production pipeline in deterministic order:
 *
 *   1. DirectorPlan + SceneSkeletons  (Claude — global constraints + visual intent)
 *   2. Voice Engine                   (ElevenLabs — timing authority)
 *   3. Contract Compiler              (deterministic — skeleton + voice -> contracts)
 *   4. Temporal Ledger                (sync tracking — built from contracts)
 *   5. Scene Images                   (Flux — one per contract, with retry)
 *   6. Video Clips                    (Runway — parallel, with retry)
 *   7. Assembly                       (FFmpeg — voice-synced, ledger-corrected)
 *
 * INVARIANT: No stage invents structure. Everything compiles downward.
 */

import { runDirectorAI }       from "./director";
import { runVoiceEngine }       from "./voice-engine";
import { compileContracts }     from "./contract-compiler";
import { buildLedger, recordActualDurations, verifyLedger } from "./temporal-ledger";
import { withRetry }            from "./retry-policy";
import { generateRunwayClip, generateRunwaySeedanceClip } from "@/lib/services/runway";
import { stitchClipsWithAudio } from "@/lib/services/elevenlabs";
import { mirrorToSupabase }     from "@/lib/utils/mirror-to-supabase";

import type {
  PipelineInput,
  PipelineResult,
  SceneContract,
  SceneOutput,
  TemporalLedger,
} from "./types";

const FAL_ENDPOINT = "https://fal.run/fal-ai/flux/dev";

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const t0 = Date.now();
  log("START", `script=${input.script.length}chars voice=${input.voiceId} niche=${input.niche} target=${input.targetDuration}s`);

  // ── Stage 1: Director AI ────────────────────────────────────────────────────
  log("STAGE_1", "Director AI — building plan and scene skeletons");
  const { plan, skeletons } = await runDirectorAI(
    input.script,
    input.voiceId,
    input.niche,
    input.targetDuration,
    input.referenceImageUrl,
  );

  // ── Stage 2: Voice Engine ───────────────────────────────────────────────────
  log("STAGE_2", `Voice Engine — generating narration voice=${input.voiceId}`);
  const voice = await runVoiceEngine(skeletons, input.voiceId, input.userId);
  log("STAGE_2_DONE", `totalDuration=${(voice.totalDurationMs/1000).toFixed(2)}s scenes=${voice.timings.length}`);

  // ── Stage 3: Contract Compiler ─────────────────────────────────────��────────
  log("STAGE_3", "Contract Compiler — binding skeletons + timings -> contracts");
  const contracts = compileContracts(plan, skeletons, voice.timings);

  // ── Stage 4: Temporal Ledger ─────────��───────────────────────────────────────
  log("STAGE_4", "Temporal Ledger — initialising sync tracking");
  let ledger = buildLedger(contracts);

  // ── Stage 5: Scene Images ─────────────────────────────────────────────────
  log("STAGE_5", `Scene Images — generating ${contracts.length} Flux images in parallel`);
  const imageUrls = await generateImages(contracts, input.referenceImageUrl);

  // Mirror all fal.media URLs to Supabase (Runway rejects fal.media CDN)
  const mirroredImageUrls = await mirrorImages(imageUrls, input.userId);

  // ── Stage 6: Video Clips ────────────���─────────────────────────────────────
  log("STAGE_6", `Video Clips — generating ${contracts.length} Runway clips in parallel`);
  const clipResults = await generateClips(contracts, mirroredImageUrls, input.speedMode);

  // Update ledger with actual durations
  const actualDurationsMs = clipResults.map(r => (r.clipUrl ? r.durationSec * 1000 : undefined));
  ledger = recordActualDurations(ledger, actualDurationsMs);

  // ── Stage 7: Assembly ────��────────────────────────────────────────────────
  log("STAGE_7", `Assembly — voice-synced FFmpeg assembly strategy=${ledger.assemblyStrategy}`);
  const clipUrls     = clipResults.map(r => r.clipUrl).filter(Boolean) as string[];
  const successCount = clipUrls.length;

  if (successCount === 0) {
    throw new Error("All clip generation failed — cannot assemble video");
  }

  const videoUrl = await assembleVideo(
    clipUrls,
    voice.audioUrl,
    ledger,
    input.userId,
  );

  // ── Verify output ─────────────────────────────────────────────────────────
  const assembledDurationMs = voice.totalDurationMs; // FFmpeg syncs to voice
  const verification = verifyLedger(ledger, assembledDurationMs);
  if (!verification.valid) {
    log("WARN", `Assembly verification: ${verification.error}`);
  }

  const elapsed = Date.now() - t0;
  log("DONE", `elapsed=${(elapsed/1000).toFixed(1)}s clips=${successCount}/${contracts.length} video=${videoUrl.slice(0, 60)}`);

  return {
    videoUrl,
    audioUrl:        voice.audioUrl,
    durationSeconds: voice.totalDurationMs / 1000,
    sceneCount:      contracts.length,
    scenes:          clipResults,
    qualityScore:    computeQualityScore(clipResults, verification.valid),
    temporalLedger:  ledger,
  };
}

// ── Stage 5: Image generation ──────────────────────────────────────────────────

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
    if (r.status === "fulfilled") {
      lastGoodUrl = r.value;
      return r.value;
    }
    log("WARN", `Image failed scene=${i + 1}: ${(r.reason as Error)?.message?.slice(0, 80)}`);
    return lastGoodUrl;
  });
}

async function generateOneImage(
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

// ── Stage 5b: Mirror images ───────────────────────────────────────────────────

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

// ── Stage 6: Clip generation ───────────────────────────────────────────────────

async function generateClips(
  contracts:  SceneContract[],
  imageUrls:  string[],
  speedMode:  "fast" | "quality",
): Promise<SceneOutput[]> {
  // Scene 0 (anchor) runs first — its last frame feeds scenes 1..N
  const anchorResult = await generateOneClip(contracts[0], imageUrls[0], speedMode);
  const results: SceneOutput[] = [anchorResult];

  if (contracts.length === 1) return results;

  // Extract last frame of anchor for scene 1..N continuity
  let chainFrame: string | null = null;
  if (anchorResult.clipUrl) {
    try {
      const { extractLastFrame } = await import("@/lib/utils/extract-last-frame");
      chainFrame = await extractLastFrame(anchorResult.clipUrl, "", 0);
      if (chainFrame) log("CHAIN", `anchor last frame ready`);
    } catch {
      log("WARN", "Last frame extraction failed — scenes 1..N will use own images");
    }
  }

  // Scenes 1..N in parallel (staggered 600ms to avoid Runway 429)
  const restResults = await Promise.allSettled(
    contracts.slice(1).map(async (contract, idx) => {
      if (idx > 0) await sleep(idx * 600);
      // Prefer per-scene image; chainFrame as continuity anchor only if no scene image
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

  // Re-sort by index (parallel execution may complete out of order)
  results.sort((a, b) => a.index - b.index);
  return results;
}

async function generateOneClip(
  contract:  SceneContract,
  imageUrl:  string,
  speedMode: "fast" | "quality",
): Promise<SceneOutput> {
  let attempts = 0;

  const result = await withRetry(
    async () => {
      attempts++;
      const r = speedMode === "quality"
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
      log("CLIP_OK", `scene=${contract.index + 1} ${r.generationMs}ms`);
      return r;
    },
    "clip",
    `clip scene=${contract.index + 1}`,
  );

  return {
    index:         contract.index,
    imageUrl:      imageUrl,
    clipUrl:       result.videoUrl,
    durationSec:   contract.clipDurationSec,
    provider:      "runway",
    imageAttempts: 1,
    clipAttempts:  attempts,
    passed:        true,
  };
}

// ── Stage 7: Assembly ──────────────────────────────────────────────────────────

async function assembleVideo(
  clipUrls:  string[],
  audioUrl:  string,
  ledger:    TemporalLedger,
  userId:    string,
): Promise<string> {
  log("ASSEMBLY", `${clipUrls.length} clips + audio strategy=${ledger.assemblyStrategy}`);

  // maxDuration = authoritative voice duration (seconds) — FFmpeg syncs to this
  const maxDuration = ledger.totalVoiceDurationMs / 1000;

  return withRetry(
    () => stitchClipsWithAudio({ clipUrls, audioUrl, userId, maxDuration }),
    "assembly",
    "final assembly",
  );
}

// ── Quality score ──────────────────────────────────────────────────────────────

function computeQualityScore(
  scenes:   SceneOutput[],
  verified: boolean,
): number {
  const successRate = scenes.filter(s => s.passed).length / scenes.length;
  const verifyBonus = verified ? 0.1 : 0;
  return Math.min(1, successRate * 0.9 + verifyBonus);
}

// ── Helpers ───��─────────────────────────────────��─────────────────────────────

function log(tag: string, msg: string): void {
  console.log(`[PIPELINE:${tag}] ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
