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
import { generateRunwayClip }           from "./runway-worker";
import { generateGetImgFrame }          from "./getimg-worker";
import { generateSceneAudio, generateVoiceover } from "./elevenlabs-worker";
import { routeShot }                    from "./scene-router";
import type { ShotRoute }               from "./scene-router";
import { isMultiCharacterScene, generateMultiCharacterClip } from "./multi-character-handler";
import { stitchClips }                  from "./clip-stitcher";
import { loadCharacterMemory, buildKlingCharacterSuffix } from "@/lib/memory/character-memory";
import { loadBrandMemory }              from "@/lib/memory/brand-memory";
import { saveRenderToLibrary }          from "@/lib/renders/save-render";
import { generateRecommendations }      from "@/lib/intelligence/recommendation-engine";
import { KLING_T2V_PRO } from "@/lib/video-models";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ParallelEngineInput {
  planId:             string;
  userId:             string;
  characterId?:       string;    // primary character (backward compat)
  characterIds?:      string[];  // [char1Id, char2Id] — use for multi-character scenes
  draftMode?:         boolean;
  speedMode?:         'ultra-draft' | 'draft' | 'balanced' | 'quality';
  aspectRatio?:       string;
  targetDurationSecs?: number;   // stitch target — default 30s
  skipStitch?:        boolean;   // skip assembly (caller handles stitching)
  fullScript?:        string;    // full video script for voiceover generation (fires at T=0)
  voiceId?:           string;    // ElevenLabs voice override for voiceover
  maxClips?:          number;    // cap number of shots (default 3 for 30s target)
  enableRunway?:      boolean;   // opt-in: route quality i2v shots to Runway Gen-4
  niche?:             string;    // user-selected content niche (e.g. "Animation") for style gating
}

export interface ClipResult {
  shotId:           string;
  shotNumber:       number;
  provider:         "hedra" | "kling" | "runway";
  video_url:        string;
  duration_seconds: number;
  generation_ms:    number;
  fromCache:        boolean;
}

export interface ParallelEngineResult {
  planId:             string;
  clips:              ClipResult[];   // ordered by shot_number
  totalMs:            number;
  hedraCount:         number;
  klingCount:         number;
  runwayCount:        number;
  failedShots:        string[];
  assembledUrl?:      string;         // set only when internal stitch ran
  voiceoverUrl?:      string;         // raw ElevenLabs audio — always returned for Railway
  voiceDurationSecs?: number;         // voiceover length in seconds
  targetDurationSecs: number;         // what was requested (echoed back for Railway)
}

// ── Shot row shape ────────────────────────────────────────────────────────────

interface ShotRow {
  id:                string;
  shot_number:       number;
  render_assignment: string;
  visual_prompt:     string;
  audio_intent:      string;
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
// Time-based hard cap (fallbackAfterMs) triggers Kling fallback before Vercel
// 300s function limit. Aggressive polling intervals surface completions fast.

interface HedraConfig {
  intervalMs:     number;
  maxPolls:       number;
  maxAudioSecs:   number;  // hard cap on TTS audio length fed to Hedra
  fallbackAfterMs: number; // wall-clock limit — throw to trigger Kling fallback
}

function getHedraConfig(speedMode: string = 'draft'): HedraConfig {
  switch (speedMode) {
    case 'ultra-draft':
      // Lightning: 22 words (~9s audio). Bail at 45s → Kling.
      return { intervalMs: 2_000, maxPolls: 23, maxAudioSecs: 9,  fallbackAfterMs:  45_000 };
    case 'draft':
      // Draft: 30 words (~12s audio). Bail at 60s → Kling.
      return { intervalMs: 2_000, maxPolls: 30, maxAudioSecs: 12, fallbackAfterMs:  60_000 };
    case 'balanced':
      // Normal: 62 words (~25s audio). Hard cap 60s → Kling fallback to keep total <3min.
      return { intervalMs: 2_000, maxPolls: 30, maxAudioSecs: 25, fallbackAfterMs:  60_000 };
    default:  // quality
      // Quality: 75 words (~30s audio). 80s budget — user opted in to quality.
      return { intervalMs: 2_000, maxPolls: 40, maxAudioSecs: 30, fallbackAfterMs:  80_000 };
  }
}

async function pollHedra(
  generationId:   string,
  shotId:         string,
  speedMode:      string = 'draft',
  correlationId?: string,
): Promise<string> {
  const config  = getHedraConfig(speedMode);
  const startMs = Date.now();
  let attempt   = 0;

  console.info(`[HEDRA_POLL_START] shot=${shotId} id=${generationId} mode=${speedMode} interval=${config.intervalMs}ms maxWait=${config.fallbackAfterMs / 1000}s`);

  while (true) {
    attempt++;
    const elapsed = Date.now() - startMs;

    if (elapsed > config.fallbackAfterMs) {
      console.warn(`[HEDRA_TIMEOUT_FALLBACK] shot=${shotId} elapsed=${Math.round(elapsed / 1000)}s attempts=${attempt} → Kling fallback`);
      if (correlationId) {
        emitRaw("PROGRESS_UPDATE", correlationId, {
          stage: "generating_avatar", progress: 85,
          message: `Hedra timed out after ${Math.round(elapsed / 1000)}s — switching to Kling...`,
          provider: "hedra", shotId,
        });
      }
      throw new Error(`Hedra timeout after ${Math.round(elapsed / 1000)}s — falling back to Kling`);
    }

    const result = await checkHedraGenerationStatus(generationId);

    if (result.status === "complete") {
      if (!result.videoUrl) throw new Error(`Hedra shot=${shotId}: complete but no videoUrl`);
      console.info(`[HEDRA_SUCCESS] shot=${shotId} elapsed=${Math.round(elapsed / 1000)}s attempts=${attempt}`);
      if (correlationId) {
        emitRaw("PROGRESS_UPDATE", correlationId, {
          stage: "generating_avatar", progress: 90,
          message: `Hedra lip-sync complete in ${Math.round(elapsed / 1000)}s`,
          provider: "hedra", shotId,
        });
      }
      return result.videoUrl;
    }

    if (result.status === "error") {
      throw new Error(`Hedra shot=${shotId}: failed after ${attempt} polls — ${result.errorMessage ?? "unknown"}`);
    }

    if (attempt % 5 === 0) {
      const elapsedSec = Math.round(elapsed / 1000);
      console.info(`[HEDRA_POLL] shot=${shotId} attempt=${attempt} elapsed=${elapsedSec}s status=${result.status ?? "pending"}`);
      if (correlationId) {
        emitRaw("PROGRESS_UPDATE", correlationId, {
          stage: "generating_avatar",
          message: `Hedra lip-sync · poll ${attempt} · ${elapsedSec}s elapsed`,
          provider: "hedra", shotId,
        });
      }
    }

    await new Promise(r => setTimeout(r, config.intervalMs));

    // Progressive micro-backoff after 30s — reduces API pressure during slow jobs
    if (elapsed > 30_000 && attempt % 3 === 0) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
}

// ── Avatar lane ───────────────────────────────────────────────────────────────

// Convert third-person narration to first-person avatar dialogue.
// Skips text already in first person to avoid double-processing.
function adaptToAvatarDialogue(text: string): string {
  if (!text || /^\s*I\b/.test(text)) return text;
  return text
    .replace(/\bShe\b/g, "I").replace(/\bHe\b/g, "I").replace(/\bThey\b/g, "I")
    .replace(/\bshe\b/g, "I").replace(/\bhe\b/g, "I").replace(/\bthey\b/g, "I")
    .replace(/\bher\b/g, "my").replace(/\bhis\b/g, "my").replace(/\btheir\b/g, "my")
    .replace(/\bherself\b/g, "myself").replace(/\bhimself\b/g, "myself")
    .replace(/\bthemselves\b/g, "myself")
    .trim();
}

async function processAvatarShot(
  shot:              ShotRow,
  characterImageUrl: string,
  voiceId:           string | null,
  correlationId:     string,
  speedMode:         string = 'balanced',
  maxDurationSecs?:  number,
): Promise<ClipResult> {
  const startMs = Date.now();

  // Step 1: ElevenLabs TTS — HARD-CAP narration to maxAudioSecs from HedraConfig.
  // Hedra generation time scales directly with audio length.
  // ultra-draft=18 words (7.5s), draft=22 words (9s), balanced=30 words (12s).
  // Take the tighter of router-supplied maxDurationSecs and config audio cap.
  const rawNarration = shot.audio_intent.trim();
  if (!rawNarration) throw new Error(`Avatar shot ${shot.id}: no narration text`);

  // Avatar shots drive duration from the full script — no speedMode word cap.
  // Hard-cap at 12s for Lightning (fast + cheap), 35s for all other modes.
  const HEDRA_MAX_SECS = speedMode === 'ultra-draft' ? 12 : 35;
  const audioCap  = Math.min(maxDurationSecs ?? HEDRA_MAX_SECS, HEDRA_MAX_SECS);
  const maxWords  = Math.floor(audioCap * 2.5);
  const allWords  = rawNarration.split(/\s+/).filter(Boolean);
  const wordCount = allWords.length;
  let narrationText: string;

  if (wordCount > maxWords) {
    narrationText = adaptToAvatarDialogue(allWords.slice(0, maxWords).join(" ").replace(/[,;.!?]+$/, "") + ".");
    const estSec  = Math.round((maxWords / 2.5) * 10) / 10;
    console.info(`[AVATAR_CAP] shot=${shot.id} words ${wordCount}→${maxWords} est_audio_sec=${estSec}s audioCap=${audioCap}s speedMode=${speedMode}`);
  } else {
    const estSec  = Math.round((wordCount / 2.5) * 10) / 10;
    narrationText = adaptToAvatarDialogue(rawNarration);
    console.info(`[AVATAR_CAP] shot=${shot.id} words=${wordCount} est_audio_sec=${estSec}s no-truncate speedMode=${speedMode}`);
  }

  emitRaw("PROGRESS_UPDATE", correlationId, {
    stage: "generating_audio", progress: 22,
    message: `ElevenLabs Flash: synthesizing voiceover for shot ${shot.shot_number}...`,
    provider: "elevenlabs", shotId: shot.id,
  });

  const { audio_url } = await generateSceneAudio(
    { text: narrationText, voiceId: voiceId ?? undefined, speed: 1.10 },
    correlationId,
    shot.id,
  );

  emitRaw("ELEVENLABS_SHOT_DONE", correlationId, { shotId: shot.id, shotNumber: shot.shot_number });
  emitRaw("PROGRESS_UPDATE", correlationId, {
    stage: "generating_audio", progress: 30,
    message: `Voiceover ready (${narrationText.split(/\s+/).length} words) — submitting to Hedra...`,
    provider: "elevenlabs", shotId: shot.id,
  });

  // Step 2: Submit to Hedra
  const hedraInput: HedraInput = {
    image_url:   characterImageUrl,
    audio_url,
    resolution:  "720p",
    _jobId:      `parallel-${shot.id}`,
    text_prompt: "Only the primary character is speaking directly to the camera. One person talking.",
  };

  const generationId = await submitHedraJob(
    hedraInput,
    async (genId: string) => {
      emitRaw("HEDRA_SHOT_SUBMITTED", correlationId, { shotId: shot.id, shotNumber: shot.shot_number, generationId: genId });
      emitRaw("PROGRESS_UPDATE", correlationId, {
        stage: "generating_avatar", progress: 35,
        message: `Hedra job queued for shot ${shot.shot_number} — polling every ${getHedraConfig(speedMode).intervalMs / 1000}s...`,
        provider: "hedra", shotId: shot.id,
      });
    },
  );

  // Step 3: Poll until complete (speed-aware timeout)
  const video_url     = await pollHedra(generationId, shot.id, speedMode, correlationId);
  const generation_ms = Date.now() - startMs;

  emitRaw("HEDRA_CLIP_READY", correlationId, { shotId: shot.id, shotNumber: shot.shot_number, video_url, generation_ms });
  console.info(`[HEDRA_TIMING] shot=${shot.id} total_ms=${generation_ms}`);
  console.info(`[AVATAR_SPEED] shot=${shot.id} mode=${speedMode} tts_words=${narrationText.split(/\s+/).length} total_ms=${generation_ms} url=${video_url.substring(0, 60)}`);

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

const PARALLEL_ANIM_PREFIX     = "In vibrant Disney Pixar 3D animated style, colorful cartoon characters with big expressive eyes, smooth CGI animation, stylized proportions, highly detailed 3D animated render, cinematic lighting, ";
const PARALLEL_ANIM_NEG        = "photorealistic, realistic humans, live action, real people, photograph, photo, human skin texture, detailed pores, realistic faces, 35mm film, documentary style, human actors, candid photography, stock photo, blurry, deformed, extra limbs, text, watermark, low quality, ugly, bad anatomy";
const CINEMATIC_QUALITY_PREFIX = "Highly detailed cinematic shot, accurate anatomy, correct lighting, no deformities, sharp focus, natural facial expression, ";

async function processKlingShot(
  shot:          ShotRow,
  route:         ShotRoute,
  charSuffix:    string,
  brandSuffix:   string,
  correlationId: string,
  speedMode:     string = 'balanced',
  charImageUrl?: string | null,
  isAnimated?:   boolean,
): Promise<ClipResult> {
  const shotT0   = Date.now();

  // Animation style enforcement: prepend Disney/Pixar prefix, suppress char ref (causes live-action bleed)
  let visualPrompt = shot.visual_prompt;
  let effectiveCharSuffix = charSuffix;
  let effectiveBrandSuffix = brandSuffix;
  let refImage: string | undefined;

  if (isAnimated) {
    visualPrompt = `${PARALLEL_ANIM_PREFIX}${visualPrompt}`;
    effectiveCharSuffix = "";   // char ref suffix would anchor to live-action description
    effectiveBrandSuffix = "";  // brand suffix may contain live-action style terms
    refImage = undefined;       // never use char photo as i2v ref for animated — causes human bleed
    console.info(`[STYLE_ENFORCED] animation=true shot=${shot.id} prefix="${PARALLEL_ANIM_PREFIX.substring(0, 60)}"`);
  } else {
    visualPrompt = `${CINEMATIC_QUALITY_PREFIX}${visualPrompt}`;
    // Use character image as i2v reference when router flagged preferI2V
    refImage = (route.preferI2V && charImageUrl) ? charImageUrl : undefined;
    if (refImage) console.info(`[KLING_I2V] shot=${shot.id} using char ref image for i2v mode`);
  }

  const result = await generateKlingClip({
    shotId:                shot.id,
    shotNumber:            shot.shot_number,
    visualPrompt,
    modelId:               route.klingModelId,
    durationSecs:          shot.duration_seconds,
    aspectRatio:           "9:16",
    characterPromptSuffix: effectiveCharSuffix || undefined,
    brandSuffix:           effectiveBrandSuffix || undefined,
    speedMode,
    motionStrength:        isAnimated ? Math.max(route.motionStrength ?? 0.65, 0.65) : route.motionStrength,
    imageUrl:              refImage,
    isStylized:            isAnimated ? true : route.isStylized,
    negativePrompt:        isAnimated ? PARALLEL_ANIM_NEG : undefined,
  });
  console.info(`[CLIP_TIMING] kling shot=${shot.id} num=${shot.shot_number} ms=${Date.now() - shotT0} model=${result.model_used}`);

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

// ── Runway lane ──────────────────────────────────────────────────────────────

async function processRunwayShot(
  shot:          ShotRow,
  route:         ShotRoute,
  charSuffix:    string,
  brandSuffix:   string,
  correlationId: string,
  charImageUrl:  string,           // required — Runway is always i2v
): Promise<ClipResult> {
  const shotT0 = Date.now();

  // If route asks for a GetImg-generated source frame, generate one first.
  // Otherwise use the character reference image directly.
  let sourceImageUrl = charImageUrl;
  if (route.sourceImageProvider === "getimg") {
    try {
      const frame = await generateGetImgFrame({
        prompt:          `${shot.visual_prompt}${charSuffix ? ", " + charSuffix : ""}${brandSuffix ? ", " + brandSuffix : ""}`,
        negativePrompt:  "extra limbs, bad anatomy, deformed, ugly, watermark",
        width:           768,
        height:          1344,
        useQualityModel: false,
      });
      sourceImageUrl = frame.imageUrl;
      console.info(`[RUNWAY_GETIMG] shot=${shot.id} getimg frame in ${frame.generationMs}ms`);
    } catch (err) {
      console.warn(`[RUNWAY_GETIMG] shot=${shot.id} getimg failed, falling back to char ref:`, err);
    }
  }

  const prompt = [shot.visual_prompt, charSuffix, brandSuffix].filter(Boolean).join(", ");

  const result = await generateRunwayClip({
    shotId:       shot.id,
    shotNumber:   shot.shot_number,
    prompt,
    imageUrl:     sourceImageUrl,
    durationSecs: shot.duration_seconds,
    aspectRatio:  "9:16",
  });

  console.info(`[CLIP_TIMING] runway shot=${shot.id} num=${shot.shot_number} ms=${Date.now() - shotT0}`);

  emitRaw("RUNWAY_CLIP_READY", correlationId, {
    shotId:        shot.id,
    shotNumber:    shot.shot_number,
    video_url:     result.video_url,
    generation_ms: result.generation_ms,
  });

  return {
    shotId:           shot.id,
    shotNumber:       shot.shot_number,
    provider:         "runway",
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
    planId, userId,
    skipStitch = false,
    fullScript,
  } = input;

  // ── Duration enforcement: cinematic/avatar always 25–30s, Studio sequences up to 60s ──
  const requestedDuration = input.targetDurationSecs ?? 30;
  const isSequence = (input.maxClips ?? 1) > 2;
  const targetDurationSecs = isSequence
    ? Math.min(Math.max(25, requestedDuration), 60)
    : Math.min(Math.max(25, requestedDuration), 30);
  if (targetDurationSecs !== requestedDuration) {
    console.info(`[DURATION_CLAMP] requested=${requestedDuration}s → enforced=${targetDurationSecs}s isSequence=${isSequence}`);
  }
  const voiceId = input.voiceId ?? "EXAVITQu4vr4xnSDxMaO";

  // Animation detection — niche="Animation" or any animated keyword in fullScript locks style
  const _animCtx  = `${fullScript ?? ""} ${input.niche ?? ""}`.toLowerCase();
  const isAnimated = /\b(animation|animated)\b/i.test(input.niche ?? "") ||
    /\b(disney|pixar|dreamworks|cartoon|animated|animation|3d animation|anime)\b/.test(_animCtx);
  if (isAnimated) console.info(`[STYLE_ENFORCED] animation=true niche="${input.niche ?? ""}" planId=${planId}`);

  // ultra-draft forces draftMode + hard-caps at 2 clips
  const speedMode  = input.speedMode ?? (input.draftMode ? 'draft' : 'balanced');
  const draftMode  = input.draftMode ?? (speedMode === 'ultra-draft' || speedMode === 'draft');
  const maxClips   = (speedMode === 'ultra-draft' || speedMode === 'draft') ? Math.min(input.maxClips ?? 2, 2) : (input.maxClips ?? 3);

  if (speedMode === 'ultra-draft') {
    console.info(`[LIGHTNING_ENFORCED] planId=${planId} maxClips=${maxClips} speedMode=${speedMode} model=v3-standard target=${targetDurationSecs}s`);
  }

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
    .select("id, shot_number, render_assignment, visual_prompt, audio_intent, duration_seconds, fal_model, content_type")
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
      speedMode,
      isMultiCharacter: multiChar,
      enableRunway:     input.enableRunway ?? false,
    });
  });

  const avatarShots     = shotRows.filter((_, i) => routes[i].provider === "hedra");
  const runwayShots     = shotRows.filter((_, i) => routes[i].provider === "runway");
  // multi-char only when we actually have two characters; otherwise treat as regular kling
  const multiCharShots  = shotRows.filter((_, i) => routes[i].provider === "kling" && !!char2Memory && isMultiCharacterScene(_.visual_prompt));
  const klingShots      = shotRows.filter((_, i) => routes[i].provider === "kling" && !multiCharShots.includes(_));

  console.info("[parallel-engine] routed", {
    planId,
    total:     shotRows.length,
    hedra:     avatarShots.length,
    kling:     klingShots.length,
    runway:    runwayShots.length,
    multiChar: multiCharShots.length,
  });
  emitRaw("PARALLEL_ENGINE_ROUTED", planId, {
    hedra:     avatarShots.length,
    kling:     klingShots.length,
    runway:    runwayShots.length,
    multiChar: multiCharShots.length,
  });
  emitRaw("PROGRESS_UPDATE", planId, {
    stage: "planning", progress: 12,
    message: `${shotRows.length} scenes planned — ${klingShots.length + runwayShots.length} Kling/Runway + ${avatarShots.length} Hedra starting in parallel...`,
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

  // Voiceover always uses 'cinematic' mode (no word cap) regardless of rendering speedMode.
  // Rendering speed controls clip quality/queue, not how long the narration is.
  const voiceWordCount = voiceScript.split(/\s+/).filter(Boolean).length;
  console.info(`[FULL_VOICEOVER] words=${voiceWordCount} targetSecs=${targetDurationSecs ?? 30} renderSpeed=${speedMode}`);
  const voiceoverPromise = voiceScript.length > 0
    ? (
        emitRaw("PROGRESS_UPDATE", planId, {
          stage: "generating_audio", progress: 15,
          message: "ElevenLabs Flash: generating full voiceover...",
          provider: "elevenlabs",
        }),
        generateVoiceover(
          { script: voiceScript, voiceId, targetDurationSecs: targetDurationSecs ?? 30, speedMode: 'cinematic', speed: speedMode === 'ultra-draft' ? 1.15 : 1.05 },
          userId,
          planId,
        ).then(result => {
          console.info(`[FULL_VOICEOVER] done duration=${result.duration.toFixed(1)}s words=${voiceWordCount}`);
          emitRaw("PROGRESS_UPDATE", planId, {
            stage: "generating_audio", progress: 28,
            message: `Voiceover ready — ${result.duration.toFixed(1)}s audio`,
            provider: "elevenlabs",
          });
          return result;
        }).catch(err => { console.warn("[parallel-engine] voiceover failed (non-fatal):", err); return null; })
      )
    : Promise.resolve(null);

  const klingPromises = klingShots.map(shot => {
    const route = routes[shotRows.indexOf(shot)];
    return processKlingShot(shot, route, charSuffix, brandSuffix, planId, speedMode, charImageUrl, isAnimated)
      .catch(err => { console.error(`[parallel-engine] kling shot=${shot.id}:`, err); failedShots.push(shot.id); return null; });
  });

  const avatarPromises = avatarShots.map(shot => {
    if (!charImageUrl) { failedShots.push(shot.id); return Promise.resolve(null); }
    const resolvedVoiceId = (avatarVoiceId || voiceId || "EXAVITQu4vr4xnSDxMaO") as string;
    const voiceSource = avatarVoiceId ? "charMemory" : input.voiceId ? "input" : "default_bella";
    console.info(`[VOICE_ID_FINAL] voice=${resolvedVoiceId} source=${voiceSource} shot=${shot.id}`);
    const avatarRoute = routes[shotRows.indexOf(shot)];
    return processAvatarShot(shot, charImageUrl, resolvedVoiceId, planId, speedMode, avatarRoute.maxDurationSecs)
      .catch(async (err: Error) => {
        console.warn(`[HEDRA_FALLBACK] shot=${shot.id} hedra_error="${err.message.slice(0, 80)}" → kling`);
        const fallbackRoute: ShotRoute = { ...avatarRoute, provider: "kling", klingModelId: KLING_T2V_PRO, motionStrength: 0.55, reason: "hedra-fallback" };
        return processKlingShot(shot, fallbackRoute, charSuffix, brandSuffix, planId, speedMode, charImageUrl, isAnimated)
          .catch(klingErr => {
            console.error(`[HEDRA_FALLBACK] kling also failed shot=${shot.id}:`, klingErr);
            failedShots.push(shot.id);
            return null;
          });
      });
  });

  const runwayPromises = runwayShots.map(shot => {
    if (!charImageUrl) {
      console.warn(`[parallel-engine] runway shot=${shot.id} skipped — no char image, falling back to kling`);
      const fallbackRoute: ShotRoute = { ...routes[shotRows.indexOf(shot)], provider: "kling", klingModelId: KLING_T2V_PRO, motionStrength: 0.62, reason: "runway-no-image-fallback" };
      return processKlingShot(shot, fallbackRoute, charSuffix, brandSuffix, planId, speedMode, null, isAnimated)
        .catch(err => { console.error(`[parallel-engine] runway-kling-fallback shot=${shot.id}:`, err); failedShots.push(shot.id); return null; });
    }
    const route = routes[shotRows.indexOf(shot)];
    return processRunwayShot(shot, route, charSuffix, brandSuffix, planId, charImageUrl)
      .catch(async (err: Error) => {
        console.warn(`[RUNWAY_FALLBACK] shot=${shot.id} runway_error="${err.message.slice(0, 80)}" → kling`);
        const fallbackRoute: ShotRoute = { ...route, provider: "kling", klingModelId: KLING_T2V_PRO, motionStrength: 0.62, reason: "runway-fallback" };
        return processKlingShot(shot, fallbackRoute, charSuffix, brandSuffix, planId, speedMode, charImageUrl, isAnimated)
          .catch(klingErr => {
            console.error(`[RUNWAY_FALLBACK] kling also failed shot=${shot.id}:`, klingErr);
            failedShots.push(shot.id);
            return null;
          });
      });
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

  const [klingResults, avatarResults, runwayResults, multiCharResults, voiceoverResult] = await Promise.all([
    Promise.all(klingPromises),
    Promise.all(avatarPromises),
    Promise.all(runwayPromises),
    Promise.all(multiCharPromises),
    voiceoverPromise,
  ]);

  // 5. Collect and order
  const allClips: ClipResult[] = [
    ...klingResults.filter((r): r is ClipResult => r !== null),
    ...avatarResults.filter((r): r is ClipResult => r !== null),
    ...runwayResults.filter((r): r is ClipResult => r !== null),
    ...multiCharResults.filter((r): r is ClipResult => r !== null),
  ].sort((a, b) => a.shotNumber - b.shotNumber);

  emitRaw("PROGRESS_UPDATE", planId, {
    stage: "stitching", progress: 88,
    message: `${allClips.length} clip${allClips.length === 1 ? "" : "s"} ready — stitching final video...`,
  });

  // 6. Persist (non-blocking)
  const klingModel = KLING_T2V_PRO;
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
  const clipBreakdown = allClips.map(c => `${c.provider}[${c.shotNumber}]=${c.generation_ms}ms`).join(", ");
  console.info(`[SPEED_BREAKDOWN] planId=${planId} Total=${totalMs}ms | Clips=(${clipBreakdown}) | Voiceover=${voiceoverResult ? "yes" : "no"} | speedMode=${speedMode} | clips=${allClips.length}/${shotRows.length}`);
  const hedraClips = allClips.filter(c => c.provider === "hedra");
  if (hedraClips.length > 0) {
    const maxHedraMs = Math.max(...hedraClips.map(c => c.generation_ms));
    console.info(`[AVATAR_TOTAL_TIME] planId=${planId} mode=${speedMode} hedra_clips=${hedraClips.length} slowest_hedra_ms=${maxHedraMs} pipeline_ms=${totalMs}`);
  }

  // 7. Optional stitch into a single video
  let assembledUrl: string | undefined;
  const willStitch = !skipStitch && allClips.length > 0 && (targetDurationSecs ?? 0) > 0;
  console.info("[STITCH_GATE]", { willStitch, skipStitch, clipCount: allClips.length, targetDurationSecs, hasVoiceover: !!voiceoverResult });
  if (willStitch) {
    let stitchErr: unknown;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const stitch = await stitchClips(allClips, {
          targetSecs:        targetDurationSecs,
          voiceDurationSecs: voiceoverResult?.duration,
          minDurationSecs:   speedMode === 'ultra-draft' ? 20 : 26,
          userId,
          planId,
          voiceoverUrl:      voiceoverResult?.audioUrl,
          speedMode,
          // AV1 for non-draft renders — better quality at lower file sizes (~5–10 MB/30s)
          // Silently ignored when libsvtav1 is not compiled into the ffmpeg binary
          useAV1:            speedMode === 'balanced' || speedMode === 'quality',
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

        // Auto-save to library + fire post-gen thank-you email (non-blocking)
        void saveRenderToLibrary({
          userId,
          videoUrl:  assembledUrl,
          audioUrl:  voiceoverResult?.audioUrl ?? null,
          template:  "parallel",
          sendEmail: true,
        }).catch(err => console.warn("[parallel-engine] auto-save failed:", err));
        break;
      } catch (err) {
        stitchErr = err;
        console.error(`[STITCH_RETRY_${attempt}] planId=${planId}:`, err);
        if (attempt < 2) await new Promise(r => setTimeout(r, 1_000));
      }
    }
    if (!assembledUrl) {
      console.error("[parallel-engine] stitch failed after retries (non-fatal):", stitchErr);
      emitRaw("PARALLEL_ENGINE_STITCH_FAILED", planId, { error: stitchErr instanceof Error ? stitchErr.message : String(stitchErr) });
    }
  }

  // Fire post-generation intelligence recommendations (non-blocking)
  void generateRecommendations(userId)
    .then(recs => console.info(`[parallel-engine] recommendations=${recs.length} userId=${userId}`))
    .catch(err => console.warn("[parallel-engine] recommendations failed (non-fatal):", err));

  const railwayPayload = {
    planId,
    clipCount:          allClips.length,
    voiceoverUrl:       voiceoverResult?.audioUrl ?? null,
    voiceDurationSecs:  voiceoverResult?.duration ?? null,
    targetDurationSecs,
    assembledUrl:       assembledUrl ?? null,
    clipUrls:           allClips.map(c => ({ n: c.shotNumber, url: c.video_url, secs: c.duration_seconds, provider: c.provider })),
  };
  console.info("[RAILWAY_PAYLOAD]", JSON.stringify(railwayPayload));

  return {
    planId,
    clips:              allClips,
    totalMs,
    hedraCount:         allClips.filter(c => c.provider === "hedra").length,
    klingCount:         allClips.filter(c => c.provider === "kling").length,
    runwayCount:        allClips.filter(c => c.provider === "runway").length,
    failedShots,
    assembledUrl,
    voiceoverUrl:       voiceoverResult?.audioUrl,
    voiceDurationSecs:  voiceoverResult?.duration,
    targetDurationSecs,
  };
}
