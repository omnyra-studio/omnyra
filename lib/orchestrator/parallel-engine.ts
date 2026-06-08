// Parallel Orchestration Engine — the core speed improvement.
//
// Replaces sequential Hedra → wait → Kling with true parallel execution:
//
//   T=0   → All Kling shots fire immediately (no audio dependency)
//   T=0   → All avatar shots: ElevenLabs TTS fires immediately (parallel per shot)
//   T≈3s  → Each avatar shot's audio resolves → Hedra fires immediately for that shot
//   T≈60s → Kling clips complete (all in parallel)
//   T≈90s → Hedra clips complete (all in parallel)
//   T≈95s → Assembly
//
// This file DOES NOT modify lib/providers/hedra.ts.
// Hedra is called via submitHedraJob + checkHedraGenerationStatus (unchanged).

import { supabaseAdmin }                from "@/lib/supabase/admin";
import { submitHedraJob, checkHedraGenerationStatus } from "@/lib/providers/hedra";
import type { HedraInput }              from "@/lib/providers/hedra";
import { generateKlingClip }            from "./kling-worker";
import { generateSceneAudio, generateVoiceover } from "./elevenlabs-worker";
import { routeShot }                    from "./scene-router";
import type { ShotRoute }               from "./scene-router";
import { isMultiCharacterScene, generateMultiCharacterClip } from "./multi-character-handler";
import { stitchClips }                  from "./clip-stitcher";
import { loadCharacterMemory, buildKlingCharacterSuffix } from "@/lib/memory/character-memory";
import { loadBrandMemory }              from "@/lib/memory/brand-memory";
import { KLING_T2V_MODEL, KLING_T2V_PRO } from "@/lib/video-models";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ParallelEngineInput {
  planId:             string;
  userId:             string;
  characterId?:       string;    // primary character (backward compat)
  characterIds?:      string[];  // [char1Id, char2Id] — use for multi-character scenes
  draftMode?:         boolean;
  speedMode?:         'draft' | 'balanced' | 'quality';
  aspectRatio?:       string;
  targetDurationSecs?: number;   // stitch target — default 30s
  skipStitch?:        boolean;   // skip assembly (caller handles stitching)
  fullScript?:        string;    // full video script for voiceover generation (fires at T=0)
  voiceId?:           string;    // ElevenLabs voice override for voiceover
  maxClips?:          number;    // cap number of shots (default 3 for 30s target)
}

export interface ClipResult {
  shotId:           string;
  shotNumber:       number;
  provider:         "hedra" | "kling";
  video_url:        string;
  duration_seconds: number;
  generation_ms:    number;
  fromCache:        boolean;
}

export interface ParallelEngineResult {
  planId:        string;
  clips:         ClipResult[];   // ordered by shot_number
  totalMs:       number;
  hedraCount:    number;
  klingCount:    number;
  failedShots:   string[];
  assembledUrl?: string;         // final stitched video URL (if targetDurationSecs set)
}

// ── Shot row shape ────────────────────────────────────────────────────────────

interface ShotRow {
  id:                string;
  shot_number:       number;
  render_assignment: string;
  visual_prompt:     string;
  audio_intent:      string;
  narration_text:    string | null;
  duration_seconds:  number;
  fal_model:         string | null;
  content_type:      string | null;
}

// ── Raw event emitter (bypasses typed AppEvent union) ─────────────────────────
// The orchestration_events table stores arbitrary JSON; the SSE stream
// forwards these to the client by type string. No need for strict union here.

function emitRaw(
  type:          string,
  correlationId: string,
  payload:       Record<string, unknown>,
): void {
  // supabaseAdmin returns PromiseLike; use void to discard — errors are non-fatal observability
  void supabaseAdmin
    .from("orchestration_events")
    .insert({ type, correlation_id: correlationId, payload });
}

// ── Hedra polling ─────────────────────────────────────────────────────────────

const HEDRA_POLL_INTERVAL_MS = 5_000;
const HEDRA_MAX_POLLS        = 72;   // 72 × 5s = 360s budget

async function pollHedra(generationId: string, shotId: string): Promise<string> {
  for (let i = 0; i < HEDRA_MAX_POLLS; i++) {
    await new Promise(r => setTimeout(r, HEDRA_POLL_INTERVAL_MS));

    // checkHedraGenerationStatus returns { status, videoUrl, errorMessage }
    const result = await checkHedraGenerationStatus(generationId);

    if (result.status === "complete") {
      if (!result.videoUrl) throw new Error(`Hedra shot=${shotId}: complete but no videoUrl`);
      return result.videoUrl;
    }

    if (result.status === "error") {
      throw new Error(`Hedra shot=${shotId}: error after ${i + 1} polls — ${result.errorMessage ?? "unknown"}`);
    }

    console.debug(`[parallel-engine] hedra poll ${i + 1}/${HEDRA_MAX_POLLS} shot=${shotId} status=${result.status}`);
  }

  throw new Error(`Hedra shot=${shotId}: timed out after ${HEDRA_MAX_POLLS} polls`);
}

// ── Avatar lane ───────────────────────────────────────────────────────────────

async function processAvatarShot(
  shot:              ShotRow,
  characterImageUrl: string,
  voiceId:           string | null,
  correlationId:     string,
): Promise<ClipResult> {
  const startMs = Date.now();

  // Step 1: ElevenLabs TTS for this shot
  const narrationText = (shot.narration_text ?? "").trim() || shot.audio_intent.trim();
  if (!narrationText) throw new Error(`Avatar shot ${shot.id}: no narration text`);

  const { audio_url } = await generateSceneAudio(
    { text: narrationText, voiceId: voiceId ?? undefined },
    correlationId,
    shot.id,
  );

  emitRaw("ELEVENLABS_SHOT_DONE", correlationId, { shotId: shot.id, shotNumber: shot.shot_number });

  // Step 2: Submit to Hedra — submitHedraJob returns the generationId string directly
  const hedraInput: HedraInput = {
    image_url:  characterImageUrl,
    audio_url,
    resolution: "720p",
    _jobId:     `parallel-${shot.id}`,
  };

  const generationId = await submitHedraJob(
    hedraInput,
    async (genId: string) => {
      emitRaw("HEDRA_SHOT_SUBMITTED", correlationId, { shotId: shot.id, shotNumber: shot.shot_number, generationId: genId });
    },
  );

  // Step 3: Poll until complete
  const video_url     = await pollHedra(generationId, shot.id);
  const generation_ms = Date.now() - startMs;

  emitRaw("HEDRA_CLIP_READY", correlationId, { shotId: shot.id, shotNumber: shot.shot_number, video_url, generation_ms });

  return {
    shotId:           shot.id,
    shotNumber:       shot.shot_number,
    provider:         "hedra",
    video_url,
    duration_seconds: shot.duration_seconds,
    generation_ms,
    fromCache:        false,
  };
}

// ── Kling lane ────────────────────────────────────────────────────────────────

async function processKlingShot(
  shot:          ShotRow,
  route:         ShotRoute,
  charSuffix:    string,
  brandSuffix:   string,
  correlationId: string,
): Promise<ClipResult> {
  const result = await generateKlingClip({
    shotId:                shot.id,
    shotNumber:            shot.shot_number,
    visualPrompt:          shot.visual_prompt,
    modelId:               route.klingModelId,
    durationSecs:          shot.duration_seconds,
    aspectRatio:           "9:16",
    characterPromptSuffix: charSuffix || undefined,
    brandSuffix:           brandSuffix || undefined,
  });

  emitRaw("KLING_CLIP_READY", correlationId, { shotId: shot.id, shotNumber: shot.shot_number, video_url: result.video_url, generation_ms: result.generation_ms });

  return {
    shotId:           shot.id,
    shotNumber:       shot.shot_number,
    provider:         "kling",
    video_url:        result.video_url,
    duration_seconds: result.duration_seconds,
    generation_ms:    result.generation_ms,
    fromCache:        false,
  };
}

// ── Persistence helpers ───────────────────────────────────────────────────────

async function persistClipResult(clip: ClipResult): Promise<void> {
  await supabaseAdmin
    .from("shots")
    .update({ render_status: "completed", render_url: clip.video_url })
    .eq("id", clip.shotId);
}

async function persistGenerationHistory(
  clip:        ClipResult,
  userId:      string,
  planId:      string,
  characterId: string | undefined,
  modelId:     string,
): Promise<void> {
  await supabaseAdmin.from("generation_history").insert({
    user_id:          userId,
    plan_id:          planId,
    shot_id:          clip.shotId,
    provider:         clip.provider,
    model_id:         modelId,
    output_url:       clip.video_url,
    duration_seconds: clip.duration_seconds,
    generation_ms:    clip.generation_ms,
    character_id:     characterId ?? null,
    status:           "completed",
  });
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function runParallelEngine(
  input: ParallelEngineInput,
): Promise<ParallelEngineResult> {
  const {
    planId, userId, draftMode = false,
    targetDurationSecs, skipStitch = false,
    fullScript, voiceId,
    maxClips = 3,
    speedMode = draftMode ? 'draft' : 'balanced',
  } = input;

  // Resolve primary + secondary character IDs
  const characterIds = input.characterIds?.length
    ? input.characterIds
    : input.characterId ? [input.characterId] : [];
  const primaryCharId   = characterIds[0] ?? null;
  const secondaryCharId = characterIds[1] ?? null;

  const t0 = Date.now();
  console.info(`[SPEED] engine start planId=${planId} maxClips=${maxClips} speedMode=${speedMode} draftMode=${draftMode}`);
  emitRaw("PARALLEL_ENGINE_STARTED", planId, { planId, userId, speedMode, maxClips });

  // 1. Load shots
  const { data: shots, error: shotsErr } = await supabaseAdmin
    .from("shots")
    .select("id, shot_number, render_assignment, visual_prompt, audio_intent, narration_text, duration_seconds, fal_model, content_type")
    .eq("shot_plan_id", planId)
    .order("shot_number", { ascending: true });

  if (shotsErr || !shots?.length) {
    throw new Error(`parallel-engine: no shots for plan ${planId}: ${shotsErr?.message ?? "empty"}`);
  }

  // Enforce max clip count (4–6 for 30s target). Take first N shots ordered by shot_number.
  const shotRows = (shots as ShotRow[]).slice(0, maxClips);

  // 2. Load memory context (primary + secondary character in parallel)
  const [charMemory, char2Memory, brandMemory] = await Promise.all([
    primaryCharId   ? loadCharacterMemory(primaryCharId,   userId) : Promise.resolve(null),
    secondaryCharId ? loadCharacterMemory(secondaryCharId, userId) : Promise.resolve(null),
    loadBrandMemory(userId),
  ]);

  const charSuffix    = charMemory ? buildKlingCharacterSuffix(charMemory) : "";
  const brandSuffix   = brandMemory.klingStyleSuffix;
  const avatarVoiceId = charMemory?.voice_id ?? null;
  const charImageUrl  = charMemory?.ref_frame_url ?? null;

  // 3. Route each shot — detect multi-character at routing time
  const routes = shotRows.map(s => {
    const multiChar = !!(char2Memory && isMultiCharacterScene(s.visual_prompt));
    return routeShot(s, {
      characterHasImage: !!charImageUrl,
      draftMode,
      isMultiCharacter: multiChar,
    });
  });

  const avatarShots     = shotRows.filter((_, i) => routes[i].provider === "hedra");
  const klingShots      = shotRows.filter((_, i) => routes[i].provider === "kling" && !isMultiCharacterScene(_.visual_prompt));
  const multiCharShots  = shotRows.filter((_, i) => routes[i].provider === "kling" && !!(char2Memory) && isMultiCharacterScene(_.visual_prompt));

  console.info("[parallel-engine] routed", {
    planId,
    total:       shotRows.length,
    hedra:       avatarShots.length,
    kling:       klingShots.length,
    multiChar:   multiCharShots.length,
  });
  emitRaw("PARALLEL_ENGINE_ROUTED", planId, {
    hedra:     avatarShots.length,
    kling:     klingShots.length,
    multiChar: multiCharShots.length,
  });

  // 4. Fire all lanes in parallel — voiceover at T=0 alongside clips
  const failedShots: string[] = [];

  // Full-video voiceover — completes in ~2–4s while clips are generating (~60–90s)
  // Guard on trimmed length, not just truthiness — empty string "" is falsy but worth logging
  const voiceScript = fullScript?.trim() ?? "";
  console.info("[parallel-engine] voiceover dispatch", {
    planId,
    hasScript:   voiceScript.length > 0,
    scriptLen:   voiceScript.length,
    scriptWords: voiceScript.split(/\s+/).filter(Boolean).length,
    targetSecs:  targetDurationSecs ?? 30,
  });

  const voiceoverPromise = voiceScript.length > 0
    ? generateVoiceover(
        { script: voiceScript, voiceId, targetDurationSecs: targetDurationSecs ?? 30 },
        userId,
        planId,
      ).catch(err => { console.warn("[parallel-engine] voiceover failed (non-fatal):", err); return null; })
    : Promise.resolve(null);

  const klingPromises = klingShots.map(shot => {
    const route = routes[shotRows.indexOf(shot)];
    return processKlingShot(shot, route, charSuffix, brandSuffix, planId)
      .catch(err => { console.error(`[parallel-engine] kling shot=${shot.id}:`, err); failedShots.push(shot.id); return null; });
  });

  const avatarPromises = avatarShots.map(shot => {
    if (!charImageUrl) { failedShots.push(shot.id); return Promise.resolve(null); }
    return processAvatarShot(shot, charImageUrl, avatarVoiceId, planId)
      .catch(err => { console.error(`[parallel-engine] hedra shot=${shot.id}:`, err); failedShots.push(shot.id); return null; });
  });

  const multiCharPromises = multiCharShots.map(shot => {
    if (!charMemory || !char2Memory) { failedShots.push(shot.id); return Promise.resolve(null); }
    return generateMultiCharacterClip({
      shotId:       shot.id,
      shotNumber:   shot.shot_number,
      visualPrompt: shot.visual_prompt,
      char1:        charMemory,
      char2:        char2Memory,
      durationSecs: shot.duration_seconds,
      brandSuffix:  brandSuffix || undefined,
    }).then((r): ClipResult => ({
      shotId:           r.shotId,
      shotNumber:       r.shotNumber,
      provider:         "kling",
      video_url:        r.video_url,
      duration_seconds: r.duration_seconds,
      generation_ms:    r.generation_ms,
      fromCache:        false,
    })).catch(err => {
      console.error(`[parallel-engine] multi-char shot=${shot.id}:`, err);
      failedShots.push(shot.id);
      return null;
    });
  });

  const [klingResults, avatarResults, multiCharResults, voiceoverResult] = await Promise.all([
    Promise.all(klingPromises),
    Promise.all(avatarPromises),
    Promise.all(multiCharPromises),
    voiceoverPromise,
  ]);

  // 5. Collect and order
  const allClips: ClipResult[] = [
    ...klingResults.filter((r): r is ClipResult => r !== null),
    ...avatarResults.filter((r): r is ClipResult => r !== null),
    ...multiCharResults.filter((r): r is ClipResult => r !== null),
  ].sort((a, b) => a.shotNumber - b.shotNumber);

  // 6. Persist (non-blocking)
  const klingModel = draftMode ? KLING_T2V_MODEL : KLING_T2V_PRO;
  void Promise.all(allClips.map(clip =>
    Promise.all([
      persistClipResult(clip),
      persistGenerationHistory(clip, userId, planId, primaryCharId ?? undefined, clip.provider === "kling" ? klingModel : "hedra-avatar"),
    ]).catch(err => console.warn("[parallel-engine] persist:", err))
  ));

  const totalMs = Date.now() - t0;
  emitRaw("PARALLEL_ENGINE_COMPLETE", planId, {
    clipCount:    allClips.length,
    totalMs,
    failedShots,
    voiceoverUrl: voiceoverResult?.audioUrl ?? null,
  });
  console.info(`[SPEED] engine done planId=${planId} clips=${allClips.length} failed=${failedShots.length} totalMs=${totalMs} speedMode=${speedMode} hasVoiceover=${!!voiceoverResult}`);

  // 7. Optional stitch into a single video
  let assembledUrl: string | undefined;
  if (!skipStitch && allClips.length > 0 && (targetDurationSecs ?? 0) > 0) {
    try {
      const stitch = await stitchClips(allClips, {
        targetSecs:        targetDurationSecs,
        voiceDurationSecs: voiceoverResult?.duration,
        userId,
        planId,
        voiceoverUrl:      voiceoverResult?.audioUrl,
        speedMode,
      });
      assembledUrl = stitch.output_url;
      const finalDuration = voiceoverResult?.duration ?? stitch.duration_seconds;
      emitRaw("PARALLEL_ENGINE_ASSEMBLED", planId, {
        output_url:       stitch.output_url,
        duration_seconds: finalDuration,
        clip_count:       stitch.clip_count,
        voice_driven:     !!voiceoverResult,
      });
      console.info("[parallel-engine] assembled", { planId, url: assembledUrl?.slice(0, 80) });
    } catch (err) {
      console.error("[parallel-engine] stitch failed (non-fatal):", err);
      emitRaw("PARALLEL_ENGINE_STITCH_FAILED", planId, { error: err instanceof Error ? err.message : String(err) });
    }
  }

  return {
    planId,
    clips:       allClips,
    totalMs,
    hedraCount:  allClips.filter(c => c.provider === "hedra").length,
    klingCount:  allClips.filter(c => c.provider === "kling").length,
    failedShots,
    assembledUrl,
  };
}
