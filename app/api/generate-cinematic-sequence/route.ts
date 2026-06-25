import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { elevenLabsVoiceover, mergeVideoAudio, mixVoiceAndAmbient, stitchClipsWithAudio, generateAmbientSound, pickAmbientDescription } from "@/lib/services/elevenlabs";
import { generateKlingClip, submitKlingTask } from "@/lib/providers/kling-direct";
import { getVideoProvider } from "@/lib/video-provider";
import { supabaseAdmin } from "@/lib/supabase/admin";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { execSync } from "child_process";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import {
  loadCharacterMemory,
  buildKlingCharacterSuffix,
  findBestReference,
  saveGeneratedClipAsReference,
  type CharacterMemory,
} from "@/lib/memory/character-memory";
import { batchScoreConsistency } from "@/lib/memory/consistency-scorer";
import {
  extractBibles,
  buildCharacterPrefix,
  buildConsistencySuffix,
  validateFrameConsistency,
  computeContinuityScore,
  type ContinuityBibles,
  type ContinuityScore,
} from "@/lib/visual-continuity";
import { applyGenerationGuardrail } from "@/lib/generation-guardrail";
import { checkAbuse, releaseVideoSlot } from "@/lib/abuse-protection";
import { videoCreditCost, CREDIT_COSTS } from "@/lib/rules/creditRules";
import { withCreditState, InsufficientCreditsError, CreditReservationError } from "@/lib/credits/withCreditState";
import { getCreditBalance, deductCreditsAtomic } from "@/lib/db/credits";
import { loadBrandMemory } from "@/lib/memory/brand-memory";
import { saveRenderToLibrary } from "@/lib/renders/save-render";
import {
  applySubjectEthnicityToPrompts,
  resolveSubjectEthnicity,
  type SubjectEthnicityInput,
} from "@/lib/subject-appearance";
import { parseJsonWithEthnicityFix } from "@/middleware/ethnicityFix";
import { getNicheSettings, detectEra, type NicheSettings } from "@/lib/config/nicheSettings";
import { analyzeScriptBeats, buildKlingPrompt, type StoryBeat } from "@/lib/storyboard-planner";
import { findTemplate, buildTemplateVideoPrompt } from "@/lib/templates";
import { initStoryMemory, advanceStoryMemory, buildStoryContextPrefix } from "@/lib/memory/story-memory";
import { buildKlingPromptFromScene, attachLastFrame, getFluxHardNegative } from "@/lib/services/scene-compiler";
import type { SceneCompilerProject } from "@/lib/types/scene-compiler";
import { detectFrameDrift, buildRetryPrompt } from "@/lib/services/drift-detector";
import { isMultiSpeakerScript, generateMultiSpeakerVoiceover } from "@/lib/services/multi-speaker";
import { generateRunwayClip } from "@/lib/services/runway";
import { selectVideoProvider, inferMotionComplexity, assertProviderConfig } from "@/lib/services/model-router";
import { chooseRunwayModel } from "@/lib/ai/runway-router";
import { TIER_LIMITS, type UserTier } from "@/lib/types/tiers";
import {
  createInitialSnapshot,
  buildNextScene,
  attachLastFrameToSnapshot,
  validate as validateContinuity,
  buildPromptFromSnapshot,
  detectDrift,
} from "@/lib/services/continuity-engine";
import type { ContinuitySnapshot, BrandMemoryV2 } from "@/lib/types/continuity";
import { ghostEI } from "@/lib/services/emotional-intelligence";
import { buildTransitionBridge } from "@/lib/services/hard-mode-compiler";
import { saveSnapshot } from "@/lib/services/snapshot-replay";
import { SaaSMetrics } from "@/lib/saas/saas-metrics";
import type { CinemaPipelineResult } from "@/lib/cinema/types";

const saasMetrics = new SaaSMetrics();


export const maxDuration = 300;

const KLING_CLIP_SECS  = 10;  // 3 Ã— 10s = 30s total video
const ROUTE_VERSION    = "2026-06-24-v41-runway-10s";

// Absolute generation constraints â€” injected into storyboard planner system prompt
// and distilled into per-scene Kling prompts for Scene 2+.
// INTERNAL â€” never send to client.
const GENERATION_CONSTRAINTS = `ABSOLUTE GENERATION CONSTRAINTS

1. GLOBAL VISUAL LOCK: Identical character identity across ALL scenes. Face, bone structure, age, proportions MUST NOT drift. Clothing identical unless explicitly changed. Lighting style consistent throughout.

2. FRAME CONTINUITY LOCK: Each scene begins from the exact final frame of the previous scene. Preserve pose exactly for first 2 seconds. Preserve camera position, angle, focal length, depth of field. Do NOT reinterpret the scene start.

3. CAMERA STATE LOCK: Camera carries forward â€” position (x,y,z), movement vector, zoom level, lens type. Scene transitions MUST NOT reset camera unless explicitly instructed. First 2 seconds: camera is STATIC and identical to previous scene endpoint.

4. TEMPORAL BRIDGING: Phase 1 (0â€“2s): freeze continuation of last frame, no new motion. Phase 2 (after 2s): motion resumes smoothly from frozen state, natural physics only.

5. SCENE MEMORY INHERITANCE: Inherit last_frame_description, character emotional state, object positions, lighting vector, camera vector. NEVER reset scene context.

6. EMOTIONAL CONTINUITY: Emotion transitions as a gradient, not a reset. No emotional jumps unless explicitly scripted.

7. MOTION CONSISTENCY: All motion physically continuous. No limb teleportation, no posture resets, no re-staging between scenes.

8. FAILURE CONDITION: If any rule cannot be followed â€” prioritize frame continuity over creativity. Reduce motion complexity rather than break continuity.`;

void GENERATION_CONSTRAINTS; // available for storyboard planner injection

// â”€â”€ SLA budget: Vercel maxDuration=300s; keep 30s for post-processing â”€â”€â”€â”€â”€â”€â”€â”€â”€
const SLA_TOTAL_MS   = 270_000; // 270s total (30s margin before Vercel 300s kills)
const SLA_GEN_MS     = 240_000; // clip generation allocation â€” fal.ai needs ~200s/clip parallel
const SLA_POST_MS    =  30_000; // post-processing + continuity reserve
// Absolute deadline for generation to finish (30s reserved for post)
// Computed per-request as: routeT0 + SLA_TOTAL_MS - SLA_POST_MS

// â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

void getVideoProvider; // retained for potential future routing

class AllClipsFailedError extends Error {
  readonly payload: Record<string, unknown>;
  constructor(payload: Record<string, unknown>) {
    super("All clips failed to generate");
    this.name = "AllClipsFailedError";
    this.payload = payload;
  }
}

// â”€â”€ Storage upload helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// â”€â”€ Last-frame extraction for clip chaining â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Resolve ffmpeg binary â€” mirrors clip-stitcher.ts pattern:
// Vercel's node_modules FS is read-only; copying to /tmp and chmod 755 is the
// only reliable way to get an executable binary in a serverless environment.
function resolveFfmpegBinary(): string | null {
  const tmp = "/tmp/ffmpeg_omnyra_cinematic";
  if (ffmpegStatic && process.platform === "linux") {
    try {
      if (!fs.existsSync(tmp)) {
        fs.copyFileSync(ffmpegStatic, tmp);
        execSync(`chmod 755 "${tmp}"`);
      }
      execSync(`"${tmp}" -version 2>&1`, { timeout: 4000, encoding: "utf8" });
      console.info("[cinematic-seq] ffmpeg resolved via /tmp copy:", tmp);
      return tmp;
    } catch (e1) {
      console.warn("[cinematic-seq] /tmp copy failed:", (e1 as Error).message.substring(0, 80));
    }
  }
  if (ffmpegStatic) {
    try {
      execSync(`"${ffmpegStatic}" -version 2>&1`, { timeout: 4000, encoding: "utf8" });
      console.info("[cinematic-seq] ffmpeg resolved via ffmpeg-static directly:", ffmpegStatic.substring(0, 60));
      return ffmpegStatic;
    } catch (e2) {
      console.warn("[cinematic-seq] ffmpeg-static not executable:", (e2 as Error).message.substring(0, 80));
    }
  }
  console.error("[cinematic-seq] CRITICAL: no executable ffmpeg â€” last-frame chaining will fail");
  return null;
}
const _ffmpegBinary = resolveFfmpegBinary();
if (_ffmpegBinary) ffmpeg.setFfmpegPath(_ffmpegBinary);

async function extractLastFrame(videoUrl: string, userId: string, clipIndex: number): Promise<string | null> {
  const label = `[LAST_FRAME clip=${clipIndex + 1}]`;
  try {
    console.log(`${label} downloading video from ${videoUrl.substring(0, 80)}`);
    const videoRes = await fetch(videoUrl);
    if (!videoRes.ok) { console.warn(`${label} fetch failed status=${videoRes.status}`); return null; }
    const videoBuffer = Buffer.from(await videoRes.arrayBuffer());

    const tmpDir    = os.tmpdir();
    const videoPath = path.join(tmpDir, `omnyra-clip${clipIndex}-${Date.now()}.mp4`);
    const framePath = path.join(tmpDir, `omnyra-frame${clipIndex}-${Date.now()}.jpg`);

    fs.writeFileSync(videoPath, videoBuffer);
    console.log(`${label} wrote ${videoBuffer.byteLength} bytes to ${videoPath}`);

    // -sseof is an INPUT option â€” must come before the input file on the command line.
    // fluent-ffmpeg's .inputOptions() places flags before -i, so this is correct.
    await new Promise<void>((resolve, reject) => {
      ffmpeg()
        .inputOptions(["-sseof", "-1"])
        .input(videoPath)
        .outputOptions(["-frames:v", "1", "-q:v", "2", "-update", "1"])
        .output(framePath)
        .on("end", () => resolve())
        .on("error", (err: Error) => reject(err))
        .run();
    });

    if (!fs.existsSync(framePath)) { console.warn(`${label} ffmpeg produced no frame`); return null; }
    const frameBuffer = fs.readFileSync(framePath);
    console.log(`${label} extracted frame ${frameBuffer.byteLength} bytes`);

    // Clean up temp files
    try { fs.unlinkSync(videoPath); fs.unlinkSync(framePath); } catch { /* ignore */ }

    // Upload frame to Supabase
    const uploadPath = `${userId}/last-frames/${Date.now()}-clip${clipIndex}.jpg`;
    const { error: upErr } = await supabaseAdmin.storage
      .from("renders")
      .upload(uploadPath, frameBuffer, { contentType: "image/jpeg", upsert: true });
    if (upErr) { console.warn(`${label} supabase upload failed: ${upErr.message}`); return null; }

    const { data: { publicUrl } } = supabaseAdmin.storage.from("renders").getPublicUrl(uploadPath);
    console.log(`${label} frame uploaded url=${publicUrl.substring(0, 80)}`);
    return publicUrl;
  } catch (err) {
    console.warn(`${label} failed (non-fatal):`, err instanceof Error ? err.message : err);
    return null;
  }
}

// â”€â”€ Couple detection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const COUPLE_RE = /\b(couple|two people|both of them|together|partner|dancing with|walking with|holding hands|hand in hand|each other|lovers|husband|wife|boyfriend|girlfriend|fiancee?|spouse|relationship|romance|romantic)\b/i;

// Detect animated / cartoon / Disney / Pixar style requests from goal, script, or niche.
// When true: inject strong style directives and suppress photorealism negatives.
const ANIMATED_RE = /\b(disney|pixar|dreamworks|cartoon|animated|animation|3d animation|cgi cartoon|anime|storybook|princess peach|mario|luigi|bowser|zelda|kirby|pikachu|yoshi|donkey kong|abraham lincoln as cartoon|fictional character|comic book character|illustrated character|caricature)\b/i;

function detectAnimatedStyle(text: string): boolean {
  return ANIMATED_RE.test(text);
}

// â”€â”€ Clip generators â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const ETHNICITY_PREFIX_RE =
  /\[(?:MANDATORY ETHNICITY OVERRIDE|ETHNICITY DEFAULT RULE)[^\]]*\][\s\S]*?(?=\[|$)/gi;

function stripEthnicityPrefix(text: string): string {
  return text
    .replace(ETHNICITY_PREFIX_RE, "")
    .replace(/\[[^\]]{2,}\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// â”€â”€ Scene type inference (keyword-based, used for logging) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

// â”€â”€ Emotional arc detection â€” extracts motion tone from script thirds â”€â”€â”€â”€â”€â”€â”€â”€â”€

function detectTone(text: string): string {
  if (/trembl|grip|clench|rigid|jaw|stiff|fear/i.test(text))
    return 'hands tremble as they move forward, jaw tightens, body holds rigid with barely controlled tension';
  if (/pause|stare|still|silent|breath/i.test(text))
    return 'movement stills, breath deepens and steadies visibly, eyes drift and slowly unfocus';
  if (/fold|press|close|final|peace|resolv/i.test(text))
    return 'hands fold slowly and deliberately, shoulders drop and release, chin lifts';
  return 'subtle natural movement, weight shifts forward, slow deliberate measured gesture';
}

function detectEmotionalArc(text: string): { opening: string; middle: string; close: string } {
  const third = Math.floor(text.length / 3);
  return {
    opening: detectTone(text.slice(0, third)),
    middle:  detectTone(text.slice(third, third * 2)),
    close:   detectTone(text.slice(third * 2)),
  };
}

// Per-scene camera moves â€” each scene gets a different camera direction
// Close-up and push-in focused â€” no pull-backs for emotional intimate content
const SCENE_CAMERA_MOVES = [
  'Extreme close-up, camera holds still then slow push toward subject.',
  'Tight close-up on hands or face, shallow depth of field, slow push in.',
  'Camera stays tight on hands then rises gently to face.',
  'Close-up tilts down to hands then drifts upward to eyes.',
  'Camera pushes toward face in a slow deliberate drift.',
];

// Motion-intent scoring â€” logging only. Provider is always Seedance (sceneRouter).

const MOTION_VERB_RE = /\b(walk|run|mov|turn|sway|breath|gestur|spin|danc|flow|driv|fall|rise|lift|reach|step|leap|jump|throw|pour|apply|embrac|laugh|cry|react)\w*\b/i;

const SCENE_BASE_SCORES: Record<string, number> = {
  talking_head:    0.55,
  lifestyle_broll: 0.85,
  product_demo:    0.70,
  emotional:       0.80,
  educational:     0.55,
  background:      0.50,
  quote:           0.25,
  transition:      0.20,
  cta:             0.20,
};

function computeMotionIntensity(prompt: string, sceneType: string): number {
  let score = SCENE_BASE_SCORES[sceneType] ?? 0.60;

  // Motion verb boost (capped at +0.20 so CTA+lots-of-verbs still stays cheap)
  const verbs = prompt.match(MOTION_VERB_RE) ?? [];
  score += Math.min(0.20, verbs.length * 0.06);

  // Static/text-only penalties
  if (/\b(text|words|typography|overlay|static|still|posed|frozen)\b/i.test(prompt))
    score -= 0.15;

  return Math.max(0, Math.min(1, score));
}

// â”€â”€ 60s async submit handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function handle60sAsync(params: {
  user:                 { id: string };
  prompts:              string[];
  passedStoryBeats?:    StoryBeat[];
  passedCreativeScenes?: Array<{ time: string; description: string; motion: string }>;
  voiceoverText?:       string;
  voiceId?:             string;
  niche?:               string;
  nicheSettings:        NicheSettings;
  detectedEra:          string | null;
  bodySceneImages:      string[];
  imageUrl?:            string | null;
}): Promise<Response> {
  const SCENE_COUNT    = 6;  // 6 Ã— 10s = 60s
  const CREDIT_COST    = CREDIT_COSTS.video_full_sequence;  // 80 credits
  const { user, nicheSettings, detectedEra, bodySceneImages, imageUrl } = params;

  // Reserve credits upfront
  const creditInfo = await getCreditBalance(user.id);
  const creditBalance = creditInfo?.balance ?? 0;
  if (creditBalance < CREDIT_COST) {
    return Response.json({ error: "INSUFFICIENT_CREDITS", balance: creditBalance, required: CREDIT_COST }, { status: 402 });
  }

  const eraAnchor    = detectedEra ? `${detectedEra}.` : '';
  const mainImageUrl = bodySceneImages[0] ?? (imageUrl?.startsWith("https://") ? imageUrl : undefined) ?? undefined;
  const baseSeed     = Date.now() % 999_999_999;

  // Generate beats for 6 scenes
  const scriptText = params.voiceoverText || params.prompts.join(" ");
  let beats: StoryBeat[] = params.passedStoryBeats ?? [];
  if (beats.length < SCENE_COUNT && scriptText) {
    try {
      beats = await analyzeScriptBeats(scriptText, SCENE_COUNT, nicheSettings);
    } catch { beats = []; }
  }

  // Build prompts for all 6 scenes
  const FALLBACK_60 = [
    'Wide, static camera.\nSubject stands still, breathing visible.',
    'Medium close-up, slow push in.\nSubject raises their head.',
    'Close-up, static camera.\nSubject reaches forward deliberately.',
    'Wide, slow pull back.\nSubject turns toward the horizon.',
    'Medium close-up, slow pan right.\nSubject pauses, composing themselves.',
    'Close-up, static camera.\nSubject meets the camera with resolve.',
  ];
  const klingPrompts = Array.from({ length: SCENE_COUNT }, (_, i) => {
    if (beats[i]) return buildKlingPrompt(beats[i], eraAnchor);
    if (params.passedCreativeScenes?.[i]?.motion) {
      return [eraAnchor, params.passedCreativeScenes[i].motion].filter(Boolean).join('\n').slice(0, 500);
    }
    return FALLBACK_60[i % FALLBACK_60.length];
  });

  // Submit all 6 Kling tasks with 2s stagger (avoid 429)
  const taskIds: string[]    = [];
  const taskEndpoints: string[] = [];
  for (let i = 0; i < SCENE_COUNT; i++) {
    if (i > 0) await new Promise(r => setTimeout(r, 2_000));
    try {
      const { taskId, endpoint } = await submitKlingTask({
        prompt:         klingPrompts[i],
        imageUrl:       mainImageUrl,
        duration:       10,
        aspectRatio:    "9:16",
        mode:           "pro",
        motionStrength: 0.80,
        seed:           baseSeed + i,
      });
      taskIds.push(taskId);
      taskEndpoints.push(endpoint);
      console.log(`[60S_SUBMIT] scene=${i + 1}/${SCENE_COUNT} task_id=${taskId}`);
    } catch (err) {
      console.error(`[60S_SUBMIT_FAIL] scene=${i + 1}:`, err instanceof Error ? err.message : err);
      return Response.json({ error: `Failed to submit scene ${i + 1}: ${err instanceof Error ? err.message : "unknown"}` }, { status: 502 });
    }
  }

  // Deduct credits + save async job
  try { await deductCreditsAtomic(user.id, CREDIT_COST); } catch { /* best-effort */ }

  const { data: job, error: jobErr } = await supabaseAdmin
    .from("kling_async_jobs")
    .insert({
      user_id:        user.id,
      status:         "generating",
      scene_count:    SCENE_COUNT,
      target_duration: 60,
      task_ids:       taskIds,
      task_endpoints: taskEndpoints,
      main_image_url: mainImageUrl ?? null,
      prompts:        klingPrompts,
      audio_url:      null,
      niche:          params.niche ?? null,
      credit_cost:    CREDIT_COST,
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    console.error("[60S_JOB_SAVE] failed:", jobErr?.message);
    return Response.json({ error: "Failed to save async job" }, { status: 500 });
  }

  console.log(`[60S_ASYNC] jobId=${job.id} tasks=${taskIds.length} submitted`);
  return Response.json({
    jobId:            job.id,
    status:           "generating",
    sceneCount:       SCENE_COUNT,
    estimatedSeconds: 240,
  });
}

// â”€â”€ POST handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  // ── Tier gate ────────────────────────────────────────────────────────────────
  let userTier: UserTier = 'free';
  try {
    const { data: profile } = await supabase
      .from('profiles').select('plan').eq('id', user.id).single();
    if (profile?.plan) userTier = profile.plan as UserTier;
  } catch { /* non-fatal — defaults to free (most restrictive) */ }
  console.log(`[TIER_GATE] user=${user.id} tier=${userTier}`);
  console.info('[ENV_CHECK] RUNWAY_KEY_PRESENT=', !!process.env.RUNWAYML_API_SECRET);

  // Video generation uses Kling direct API â€” no fal.ai needed for video.
  // (fal.ai is still used by generate-scene-images for Flux image generation.)
  if (!process.env.KLING_API_KEY && !(process.env.KLING_ACCESS_KEY && process.env.KLING_SECRET_KEY)) {
    return Response.json({ error: "KLING_API_KEY not configured â€” required for Kling direct video generation" }, { status: 500 });
  }

  let prompts: string[];
  let imageUrl: string | null | undefined;
  let clipDuration: number | undefined;
  let sceneTypes: (string | null)[] | undefined;
  let script: string | undefined;
  let goal: string | undefined;
  let characterId: string | undefined;
  let niche: string | undefined;
  let isQuickMode = false;
  let subjectEthnicity: SubjectEthnicityInput = 'caucasian';
  let voiceoverText: string | undefined;
  let voiceId: string | undefined;
  let bodySceneImages: string[] = [];
  let passedStoryBeats: StoryBeat[] | undefined;
  let passedCreativeScenes: Array<{ time: string; description: string; motion: string }> | undefined;
  let passedSceneGraph: SceneCompilerProject | undefined;
  let targetDuration = 30;
  let templateId: string | undefined;
  let speedMode: 'fast' | 'quality' = 'fast';
  try {
    const body = await parseJsonWithEthnicityFix<{
      prompts?: string[];
      scenePrompts?: string[];  // 3 Runway-ready prompts from script picker â€” takes priority over prompts
      imageUrl?: string | null;
      sceneImages?: string[];
      clipDuration?: number;
      sceneTypes?: (string | null)[];
      script?: string;
      goal?: string;
      characterId?: string;
      niche?: string;
      videoType?: 'quick' | 'cinematic' | 'avatar';
      subjectEthnicity?: SubjectEthnicityInput;
      voiceoverText?: string;  // narration only (spoken words) â€” do NOT strip or reparse
      voiceId?: string;
      storyBeats?: StoryBeat[];
      creativeScenes?: Array<{ time: string; description: string; motion: string }>;
      targetDuration?: number;
      templateId?: string;
      sceneGraph?: SceneCompilerProject;
      speedMode?: 'fast' | 'quality';
    }>(req);
    subjectEthnicity = body.subjectEthnicity ?? 'caucasian';
    bodySceneImages = (body.sceneImages ?? []).filter((u): u is string => typeof u === "string" && u.startsWith("https://"));

    // When scenePrompts are passed (from script picker), use them directly â€” no stripping needed.
    // voiceoverText in this case is already the clean narration (spoken words only).
    const hasScenePrompts = Array.isArray(body.scenePrompts) && body.scenePrompts.length >= 3;
    if (hasScenePrompts) {
      voiceoverText = body.voiceoverText?.trim() || undefined;
      console.log(`[SCRIPT_PICKER] scenePrompts=${body.scenePrompts!.length} narration_len=${voiceoverText?.length ?? 0}`);
    } else {
      const rawVoiceover = body.voiceoverText?.trim() || body.script?.trim() || "";
      // Extract narration: prefer quoted strings (actual VO lines); fall back to stripping
      // ALL CAPS scene headers, action lines, and bracket/paren stage directions.
      const _quotedLines = (rawVoiceover.match(/"([^"]{10,})"/g) ?? [])
        .map((s: string) => s.replace(/^"|"$/g, "").trim()).filter(Boolean);
      voiceoverText = (_quotedLines.length > 0
        ? _quotedLines.join(" ")
        : rawVoiceover
            .replace(/\[SCENE:[^\]]*\]/gi, "")
            .replace(/\[CUT TO[^\]]*\]/gi, "")
            .replace(/\[.*?\]/g, "")
            .replace(/\(.*?\)/g, "")
            .replace(/^\s*#.*$/gm, "")
            .replace(/^[A-Z][A-Z\s.,!?:â€”]{8,}$/gm, "")
            .replace(/\n{3,}/g, "\n\n")
      ).trim() || undefined;
    }

    voiceId = body.voiceId;
    // scenePrompts from picker override generic prompts â€” each maps to one Runway clip
    prompts      = hasScenePrompts ? body.scenePrompts!.slice(0, 3) : (body.prompts ?? []);
    imageUrl     = body.imageUrl;
    clipDuration = body.clipDuration;
    sceneTypes   = body.sceneTypes;
    script       = body.script;
    goal         = body.goal ?? (hasScenePrompts ? undefined : body.prompts?.[0]);
    characterId  = body.characterId;
    niche        = body.niche;
    isQuickMode = body.videoType === 'quick';
    passedStoryBeats = Array.isArray(body.storyBeats) && body.storyBeats.length > 0 ? body.storyBeats : undefined;
    passedCreativeScenes = Array.isArray(body.creativeScenes) && body.creativeScenes.length > 0 ? body.creativeScenes : undefined;
    passedSceneGraph = body.sceneGraph ?? undefined;
    if (body.targetDuration === 60) {
      const limits = TIER_LIMITS[userTier];
      if (limits.maxDurationSeconds < 60) {
        console.warn(`[TIER_GATE] 60s blocked tier=${userTier}`);
        return Response.json({
          error: 'Duration not available on your plan',
          requiredTier: 'creator',
          message: 'Upgrade to Creator or Studio to generate 60-second videos',
        }, { status: 403 });
      }
      targetDuration = 60;
    }
    templateId = body.templateId;
    speedMode  = body.speedMode ?? 'fast';
    console.log(`[BRIEF_CONTEXT] goal="${(goal ?? "").substring(0, 120)}" scenePrompts=${hasScenePrompts} characterId=${characterId ?? "none"} niche=${niche ?? "none"} ethnicity=${subjectEthnicity} storyBeats=${passedStoryBeats?.length ?? 0} creativeScenes=${passedCreativeScenes?.length ?? 0} templateId=${templateId ?? "none"}`)
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // â”€â”€ Niche settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const nicheSettings = getNicheSettings(niche);
  console.log(`[NICHE_RECEIVED] niche="${niche ?? "default"}" videoPrefix="${nicheSettings.videoPromptPrefix.substring(0, 60)}"`);
  console.log(`[NICHE_DEFAULTS] lightningMode=${nicheSettings.lightningModeDefault} duration=${nicheSettings.defaultDuration}`);

  // Use niche's default duration if caller didn't supply one
  if (!clipDuration) clipDuration = nicheSettings.defaultDuration;

  let detectedEra: string | null = null;
  if (nicheSettings.eraDetection) {
    const eraSearchText = `${script ?? ""} ${goal ?? ""} ${prompts.join(" ")}`;
    detectedEra = detectEra(eraSearchText);
    if (detectedEra) {
      console.log(`[ERA_DETECTED] era="${detectedEra}" niche="${niche ?? "default"}"`);
    }
  }

  // Load brand + character memory in parallel (non-blocking â€” generation continues without either)
  const brandMemory = await loadBrandMemory(user.id).catch(err => {
    console.warn("[BRAND_MEMORY] load failed (non-fatal):", err instanceof Error ? err.message : err);
    return null;
  });
  if (brandMemory?.brandName) console.log(`[BRAND_MEMORY] loaded brand="${brandMemory.brandName}" fluxSuffix="${brandMemory.fluxStyleSuffix.substring(0, 60)}"`);

  let charMemory: CharacterMemory | null = null;
  if (characterId) {
    try {
      charMemory = await loadCharacterMemory(characterId, user.id);
      if (charMemory) {
        console.log(`[CHAR_MEMORY] loaded charId=${characterId} name="${charMemory.name}" hasImage=${charMemory.hasImage}`);
        // Use best reference as imageUrl if the caller didn't supply one
        if (!imageUrl) {
          const bestRef = await findBestReference(characterId, user.id);
          if (bestRef) {
            imageUrl = bestRef;
            console.log(`[CHAR_MEMORY] using best reference as imageUrl: ${bestRef.substring(0, 80)}`);
          } else if (charMemory.ref_frame_url) {
            imageUrl = charMemory.ref_frame_url;
            console.log(`[CHAR_MEMORY] using ref_frame_url as imageUrl: ${charMemory.ref_frame_url.substring(0, 80)}`);
          }
        }
      } else {
        console.warn(`[CHAR_MEMORY] characterId=${characterId} not found for userId=${user.id}`);
      }
    } catch (charErr) {
      console.warn("[CHAR_MEMORY] load failed (non-fatal):", charErr instanceof Error ? charErr.message : charErr);
    }
  }

  if (!prompts?.length) {
    return Response.json({ error: "prompts required" }, { status: 400 });
  }

  // Inject creative brief into scene 1 â€” skip when scenePrompts came from script picker
  // (those prompts are already complete Runway descriptions, goal text would corrupt them)
  const _hasScenePrompts = prompts.length >= 3 && !goal;
  if (!_hasScenePrompts && goal?.trim() && prompts.length > 0) {
    let goalText = goal.trim();
    const ethnicityPrefixRe = /^\[(?:MANDATORY ETHNICITY OVERRIDE|ETHNICITY DEFAULT RULE)[^\]]*\][\s\S]*?\n\n/i;
    goalText = goalText.replace(ethnicityPrefixRe, "").trim();
    if (goalText) {
      prompts[0] = `${goalText.slice(0, 200)}, ${prompts[0]}`;
      console.log(`[BRIEF_INJECT] scene=1 prompt="${prompts[0].substring(0, 120)}"`);
    }
  } else if (_hasScenePrompts) {
    console.log(`[BRIEF_INJECT] skipped â€” scenePrompts from script picker used as-is`);
  }

  // â”€â”€ Abuse protection (video-specific: cooldown + concurrent job limit) â”€â”€â”€â”€
  console.log(`[STAGE_1_ABUSE] start user=${user.id}`);
  const videoAbuse = await Promise.race([
    checkAbuse({ userId: user.id, input: prompts[0] ?? "", isVideoGeneration: true }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('ABUSE_CHECK_TIMEOUT_10s')), 10_000)),
  ]).catch(err => {
    console.warn(`[STAGE_1_ABUSE] timeout/error: ${err instanceof Error ? err.message : err} â€” failing open`);
    return { allowed: true, flagLevel: "none" as const, creditMultiplier: 1, cooldownRemainingMs: 0, userMessage: null, queueDelayMs: 0 };
  });
  console.log(`[STAGE_1_ABUSE] done allowed=${videoAbuse.allowed}`);
  if (!videoAbuse.allowed) {
    const retryAfterSec = Math.ceil(videoAbuse.cooldownRemainingMs / 1000);
    console.warn(`[429_REASON] flagLevel=${videoAbuse.flagLevel} cooldownRemainingMs=${videoAbuse.cooldownRemainingMs} retryAfterSec=${retryAfterSec}`);
    return Response.json(
      { error: "Video generation is temporarily queued. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
    );
  }

  // â”€â”€ 60s async submit path â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (targetDuration === 60 && !isQuickMode) {
    return handle60sAsync({ user, prompts, passedStoryBeats, passedCreativeScenes, voiceoverText, voiceId, niche, nicheSettings, detectedEra, bodySceneImages, imageUrl });
  }

  // â”€â”€ Credit-protected generation pipeline (30s inline) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const estimatedCost = videoCreditCost(prompts.length, 0);

  let capturedThumbnailUrl: string | null = null;
  let lastStageLogged = 'BRIEF_INJECT';

  try {
    lastStageLogged = 'CREDIT_RESERVE_start';
    console.log(`[STAGE_2_CREDIT] start cost=${estimatedCost}`);
    const responsePayload = await withCreditState<Record<string, unknown>>({
      userId: user.id,
      cost:   estimatedCost,
      run:    async () => {
        lastStageLogged = 'inside_run';
        console.log(`[STAGE_2_CREDIT] done â€” inside run`);

        // â”€â”€ Guardrail (throw on rejection â†’ auto-rollback) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        console.log(`[STAGE_3_GUARDRAIL] start`);
        {
          const guardrail = applyGenerationGuardrail({ sceneCount: prompts.length, modelTier: "kling_elevenlabs", validationPasses: 1 });
          if (!guardrail.approved) {
            throw new Error(guardrail.reason ?? "Generation blocked by guardrail");
          }
          if (guardrail.finalSceneCount < prompts.length) {
            prompts = prompts.slice(0, guardrail.finalSceneCount);
            if (sceneTypes) sceneTypes = sceneTypes.slice(0, guardrail.finalSceneCount);
          }
          console.log(`[GUARDRAIL] scenes=${guardrail.finalSceneCount} tier=${guardrail.finalModelTier} est=${guardrail.estimatedRuntimeSeconds}s opts=[${guardrail.appliedOptimizations.join(",")}]`);
        }
        lastStageLogged = 'GUARDRAIL_done';
        console.log(`[STAGE_3_GUARDRAIL] done`);

        const clipDurationSecs = KLING_CLIP_SECS;
        const plannedTotalSec  = prompts.length * KLING_CLIP_SECS;
        const plannedProvider  = process.env.RUNWAYML_API_SECRET ? 'runway-gen4-turbo' : 'kling-v2.6-pro';
        console.info("[DURATION_PLAN]", {
          provider:       plannedProvider,
          scene_count:    prompts.length,
          clip_duration:  KLING_CLIP_SECS,
          planned_total:  plannedTotalSec,
        });

        const resolvedSceneTypes: string[] = prompts.map((prompt, i) =>
          sceneTypes?.[i] ?? inferSceneType(prompt),
        );
        const resolvedMotionScores: number[] = prompts.map((prompt, i) =>
          computeMotionIntensity(prompt, resolvedSceneTypes[i]),
        );

        const klingScenesTotal = prompts.length;
        console.log(`[PLAN] provider=${plannedProvider} scenes=${klingScenesTotal} mode=${isQuickMode ? "quick" : "cinematic"}`);
        console.log(`[PROVIDER_USAGE] { provider: "${plannedProvider}", scenes: ${klingScenesTotal} }`);

        // â”€â”€ Visual Continuity: extract bibles + inject enforcement suffixes â”€â”€â”€â”€
        console.log(`[STAGE_4_ETHNICITY] start`);
        let bibles: ContinuityBibles | null = null;
        let enforcedPrompts = [...prompts];
        let subjectEthnicityNegative = '';

        {
          const resolvedEth = resolveSubjectEthnicity(subjectEthnicity, `${goal ?? ''} ${script ?? ''} ${prompts.join(' ')}`);
          const locked = applySubjectEthnicityToPrompts(enforcedPrompts, resolvedEth);
          enforcedPrompts = locked.prompts;
          subjectEthnicityNegative = locked.negativeAddon;
          console.log(`[SUBJECT_ETHNICITY] resolved=${resolvedEth} scenes=${enforcedPrompts.length}`);
        }
        lastStageLogged = 'ETHNICITY_done';
        console.log(`[STAGE_4_ETHNICITY] done`);

        // Skip extractBibles when no characterId â€” saves 5-15s sequential blocking before Kling.
        // Character continuity bibles only matter when a saved character is loaded.
        console.log(`[STAGE_5_CONTINUITY] start hasCharacter=${!!characterId}`);
        if (characterId) {
          try {
            bibles = await Promise.race([
              extractBibles(enforcedPrompts, script),
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error('[STAGE_5_CONTINUITY] TIMEOUT after 5s')), 5_000)),
            ]);
            if (bibles.hasCharacter || bibles.environment) {
              const charPrefix = buildCharacterPrefix(bibles);
              const envSuffix  = buildConsistencySuffix(bibles);
              if (charPrefix || envSuffix) {
                enforcedPrompts = enforcedPrompts.map(p => charPrefix + p + envSuffix);
                console.log(`[CONTINUITY] bible_extracted hasCharacter=${bibles.hasCharacter} prefix_len=${charPrefix.length} suffix_len=${envSuffix.length}`);
              }
            }
          } catch (err) {
            console.warn("[CONTINUITY] bible extraction failed or timed out (non-fatal):", err instanceof Error ? err.message : err);
          }
        } else {
          console.log(`[STAGE_5_CONTINUITY] skipped â€” no characterId, saving ~10s`);
        }
        lastStageLogged = 'CONTINUITY_done';
        console.log(`[STAGE_5_CONTINUITY] done`);

        // Character memory injection â€” stacks on top of continuity bibles
        console.log(`[STAGE_6_CHAR_BRAND] start`);
        if (charMemory) {
          const charSuffix = buildKlingCharacterSuffix(charMemory);
          if (charSuffix.trim()) {
            enforcedPrompts = enforcedPrompts.map(p => `${p}, ${charSuffix}`);
            console.log(`[CHAR_INJECT] suffix="${charSuffix.substring(0, 80)}" injected into ${enforcedPrompts.length} prompts`);
          }
        }

        // Brand memory injection â€” appends visual style to Flux image prompts
        if (brandMemory?.fluxStyleSuffix) {
          enforcedPrompts = enforcedPrompts.map(p => `${p}, ${brandMemory.fluxStyleSuffix}`);
          console.log(`[BRAND_INJECT] fluxSuffix="${brandMemory.fluxStyleSuffix.substring(0, 80)}" injected into ${enforcedPrompts.length} prompts`);
        }
        lastStageLogged = 'CHAR_BRAND_done';
        console.log(`[STAGE_6_CHAR_BRAND] done`);

        // â”€â”€ Animated / cartoon style enforcement â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // Include niche in detection so "Animation" niche always triggers animated style
        console.log(`[STAGE_7_PROMPT_ARC] start`);
        const _combinedCtx  = `${goal ?? ""} ${script ?? ""} ${niche ?? ""}`.toLowerCase();
        const _isAnimated   = detectAnimatedStyle(_combinedCtx) || /\banimation\b/i.test(niche ?? "");
        const ANIM_PREFIX   = "In vibrant Disney Pixar 3D animated style, colorful cartoon characters with big expressive eyes, smooth CGI animation, stylized proportions, highly detailed 3D animated render, cinematic lighting, ";
        if (_isAnimated) {
          // Always prepend â€” unconditional so every scene is style-locked regardless of prompt wording
          enforcedPrompts = enforcedPrompts.map(p => `${ANIM_PREFIX}${p}`);
          console.log(`[STYLE_ENFORCED] animation=true niche="${niche ?? ""}" prefix="${ANIM_PREFIX.substring(0, 60)}" scenes=${enforcedPrompts.length}`);
        }

        // â”€â”€ Cinematic lighting + emotional arc injection (SKIP for animated) â”€â”€
        // Animated content uses CGI-style prompts â€” camera/arc direction is for live-action only.
        const _isEmotional  = !_isAnimated && (
          /\b(beach|sunset|golden|tear|sad|cri|cry|weep|sob|emotion|danc|shore|ocean|wave|romantic|intimate|dusk|twilight|hug|embrac|comfort|vulnerab|loneli|ach|grief|coffee|mug)\b/.test(_combinedCtx)
          || /tears|crying|emotional|dancing|hugging|embracing|comforting/.test(_combinedCtx)
        );
        const _isCoupleCtx  = !_isAnimated && (COUPLE_RE.test(goal ?? "") || COUPLE_RE.test(script ?? ""));
        const _total        = enforcedPrompts.length;

        // Extract emotional arc from script text â€” runs for ALL live-action content
        // Falls back to niche.emotionalArc label (logged only), then neutral
        const _scriptForArc = (script ?? goal ?? enforcedPrompts.join(' ')).trim();
        const _arc = !_isAnimated && _scriptForArc ? detectEmotionalArc(_scriptForArc) : null;
        if (_arc) {
          console.log(`[EMOTIONAL_ARC] detected: opening="${_arc.opening.substring(0, 60)}" | middle="${_arc.middle.substring(0, 60)}" | close="${_arc.close.substring(0, 60)}"`);
        } else if (nicheSettings.emotionalArc) {
          console.log(`[EMOTIONAL_ARC] not detected from script â€” niche arc="${nicheSettings.emotionalArc}" (narrative label for niche="${nicheSettings.key}")`);
        } else {
          console.log(`[EMOTIONAL_ARC] not detected â€” using neutral movement for all scenes`);
        }

        if (!_isAnimated) {
          // Live-action: add front-facing camera rule + motion arc for every scene
          enforcedPrompts = enforcedPrompts.map((p, i) => {
            const pLow    = p.toLowerCase();
            const isBeach = /\b(beach|shore|ocean|sand|wave|water|sea)\b/.test(pLow);
            const isSad   = /\b(sad|cry|tear|lonely|ache|pain|grief)\b/.test(pLow);
            const isDance = /\b(danc|sway|spin|twirl|embrac|hold|pull)\b/.test(pLow);

            const cameraRule = "subjects facing camera, front-facing, faces clearly visible";
            const facingNote = _isCoupleCtx ? ", man facing toward woman, correct orientation, proper eye line, both faces visible" : `, ${cameraRule}`;

            const pos = _total > 1 ? i / (_total - 1) : 0;

            if (!_isEmotional) {
              // Use arc detected from script for motion â€” fixes slideshow output
              let arcBeat = 'neutral, measured movement';
              if (_arc) {
                arcBeat = pos <= 0.33 ? _arc.opening : pos <= 0.66 ? _arc.middle : _arc.close;
              }
              const cameraMove = SCENE_CAMERA_MOVES[i % SCENE_CAMERA_MOVES.length];
              console.log(`[PROMPT_ARC] scene=${i + 1} arc="${arcBeat}" camera="${cameraMove}"`);
              return `${p}, ${arcBeat}, ${cameraMove}${facingNote}`;
            }

            const lighting = isBeach
              ? "golden hour lighting, warm backlighting, soft rim light on hair and shoulders, wet sand reflections, atmospheric ocean haze, warm sky gradient, cinematic anamorphic lens"
              : "soft cinematic lighting, warm key light, gentle fill light, emotional mood lighting, shallow depth of field";

            let arcBeat: string;
            if (pos <= 0.33) {
              arcBeat = _arc
                ? _arc.opening
                : isSad
                  ? "visible tear on cheek, head slightly down, quiet sadness and vulnerability, no smiling yet"
                  : "opening beat, character settling into scene, subdued expression, quiet introspective moment";
            } else if (pos <= 0.66) {
              arcBeat = _arc
                ? _arc.middle
                : _isCoupleCtx
                  ? "man gently approaching from the side, turning to face her, opening arms, beginning to pull her close, transition moment"
                  : isSad
                    ? "posture shifting slightly, jaw unclenching, eyes lifting, quiet internal change, still alone in the same setting"
                    : "middle beat, subtle posture adjustment, gaze moving across scene, micro-expression shift, same setting";
            } else {
              arcBeat = _arc
                ? _arc.close
                : _isCoupleCtx
                  ? (isDance
                      ? "tender slow dance in shallow water, woman softening, gentle smile through remaining tears, intimate comfort and connection"
                      : "resolution moment, woman leaning into him, soft smile through tears, warmth and relief replacing sadness")
                  : isSad
                    ? "quiet resolution, shoulders releasing tension, faint upward curve of lip corners, still alone, internal stillness returning"
                    : "closing beat, expression softening, settled into the scene, moment of quiet stillness, same setting unchanged";
            }

            const cameraMove = SCENE_CAMERA_MOVES[i % SCENE_CAMERA_MOVES.length];
            console.log(`[PROMPT_ARC] scene=${i + 1}/${_total} pos=${pos.toFixed(2)} beach=${isBeach} arc="${arcBeat.substring(0, 60)}"`);
            return `${p}, ${lighting}, ${arcBeat}, ${cameraMove}${facingNote}`;
          });
          console.log(`[PROMPT_ARC] enhanced ${_total} scene(s) emotional=${_isEmotional} couple=${_isCoupleCtx}`);
        } else {
          console.log(`[PROMPT_ARC] SKIPPED for animated content â€” ${_total} scene(s) use CGI style prompts only`);
        }

        // Per-scene negative prompts â€” suppress wrong tone + anatomy artifacts
        const _negBase =
          "stock photo pose, studio lighting, CGI, airbrushed, oversaturated, " +
          "man facing backward, subject facing away from camera, back to camera, " +
          "extra limbs, extra fingers, extra arms, extra hands, mutated hands, deformed hands, " +
          "fused fingers, too many fingers, missing fingers, ugly hands, distorted limbs, " +
          "bad anatomy, extra legs, malformed limbs, three hands, two left hands, " +
          "overlapping limbs, fused bodies, merged torsos, anatomical errors, " +
          "backwards knees, knees bending wrong direction, reversed joints, impossible joint angle, " +
          "head facing backward, neck twisted 180 degrees, inverted feet, " +
          "wrong grip, object held incorrectly, deformed object, incorrect prop shape, " +
          "phone shaped like remote, distorted device, wrong object in hand, floating object, " +
          "object clipping through body, arm coming from wrong position, " +
          // Particle / material artifacts â€” Kling animates sand/water/smoke from face when mentioned in prompt
          "sand falling from face, sand from mouth, particles from mouth, liquid from mouth, " +
          "water dripping from face, smoke from mouth, material pouring from face, " +
          "sand pouring from lips, debris falling from chin, particles emanating from face";
        const _negEmotional = _isEmotional
          ? "premature smiling, overly joyful expression too early, laughing out loud, wrong orientation, generic romance without sadness"
          : "";
        const sceneNegativePrompts: string[] = enforcedPrompts.map((_, i) => {
          const pos     = _total > 1 ? i / (_total - 1) : 0;
          const sadGuard = (_isEmotional && pos <= 0.33) ? "smiling, happy expression, teeth showing, joyful face, laughing" : "";
          return [_negBase, _negEmotional, sadGuard, subjectEthnicityNegative].filter(Boolean).join(", ");
        });

        // Scene Compiler per-scene negative prompts — injected first so story-specific exclusions
        // (e.g. "adult woman" for a child character story) take effect before niche/brand layers
        if (passedSceneGraph?.scene_graph?.length) {
          for (let i = 0; i < sceneNegativePrompts.length; i++) {
            const compilerNeg = passedSceneGraph.scene_graph[i]?.negative_prompt?.trim();
            if (compilerNeg) {
              sceneNegativePrompts[i] = [compilerNeg, sceneNegativePrompts[i]].filter(Boolean).join(", ");
            }
          }
          console.log(`[COMPILER_NEG] injected scene-compiler negative_prompt into ${sceneNegativePrompts.length} scenes`);
        }

        // Animated style: suppress photorealism + live-action with stronger terms
        if (_isAnimated) {
          const negAnim = "photorealistic, realistic humans, live action, real people, photograph, photo, human skin texture, detailed pores, realistic faces, 35mm film, documentary style, human actors, candid photography, stock photo, blurry, deformed, extra limbs, text, watermark, low quality, ugly, bad anatomy, 3d render artifacts";
          for (let i = 0; i < sceneNegativePrompts.length; i++) {
            sceneNegativePrompts[i] = negAnim; // replace entirely â€” animated negative is its own set
          }
          console.log(`[ANIMATED_NEG] replaced all ${sceneNegativePrompts.length} scene neg prompts with animated-safe set`);
        }

        // Extend with character-specific negative prompts
        if (charMemory?.neg_prompt?.trim()) {
          for (let i = 0; i < sceneNegativePrompts.length; i++) {
            sceneNegativePrompts[i] = [sceneNegativePrompts[i], charMemory.neg_prompt].filter(Boolean).join(", ");
          }
          console.log(`[CHAR_NEG] extended ${sceneNegativePrompts.length} scene neg prompts with charMemory.neg_prompt`);
        }

        // Extend with niche-specific negative prompts (prevents cross-contamination)
        if (nicheSettings.negativePrompt?.trim() && !_isAnimated) {
          for (let i = 0; i < sceneNegativePrompts.length; i++) {
            sceneNegativePrompts[i] = [sceneNegativePrompts[i], nicheSettings.negativePrompt].filter(Boolean).join(", ");
          }
          console.log(`[NICHE_NEG] extended ${sceneNegativePrompts.length} scene neg prompts with niche="${nicheSettings.key}" negatives`);
        }

        // Extend with brand-specific negative style terms
        if (brandMemory?.negativeStyleSuffix) {
          for (let i = 0; i < sceneNegativePrompts.length; i++) {
            sceneNegativePrompts[i] = [sceneNegativePrompts[i], brandMemory.negativeStyleSuffix].filter(Boolean).join(", ");
          }
          console.log(`[BRAND_NEG] extended ${sceneNegativePrompts.length} scene neg prompts with brand negative terms`);
        }

        lastStageLogged = 'PROMPT_ARC_done';
        console.log(`[STAGE_7_PROMPT_ARC] done`);

        // â”€â”€ Cinema Director Pipeline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // Replaces paragraph-splitting with structured narrative beat planning.
        // Beat Director â†’ Shot Planner â†’ Story Validator â†’ Repetition Detector
        //   â†’ Scene Graph â†’ Prompt Compiler â†’ RenderContracts
        // Falls back to legacy prompts if pipeline errors.
        console.log(`[STAGE_7B_CINEMA] start scenes=${prompts.length}`);
        let cinemaPipeline: CinemaPipelineResult | null = null;
        try {
          const { runCinemaPipeline } = await import("@/lib/cinema/pipeline");
          cinemaPipeline = await runCinemaPipeline({
            idea:         (goal ?? voiceoverText ?? enforcedPrompts.join(" ")).slice(0, 800),
            script:       voiceoverText ?? script ?? undefined,
            niche:        niche ?? nicheSettings.key,
            sceneCount:   prompts.length,
            nicheSettings,
          });
          if (cinemaPipeline.renderContracts.length !== prompts.length) {
            console.warn(`[CINEMA_PIPELINE] scene count mismatch expected=${prompts.length} got=${cinemaPipeline.renderContracts.length} â€” falling back`);
            cinemaPipeline = null;
          }
        } catch (pipeErr) {
          console.warn(`[CINEMA_PIPELINE] failed â€” falling back to legacy prompts:`, pipeErr instanceof Error ? pipeErr.message : pipeErr);
        }
        lastStageLogged = 'CINEMA_PIPELINE_done';
        console.log(`[STAGE_7B_CINEMA] done pipeline=${cinemaPipeline ? 'OK' : 'fallback'}`);

        // Per-beat narration replaces full screenplay text for ElevenLabs (more impactful)
        const resolvedVoiceover = cinemaPipeline?.compositeNarration?.trim() || voiceoverText;

        const sourceImages: Array<string | null> = new Array(prompts.length).fill(null);
        const clipReports: string[] = [];

        console.log(`[MOTION_PROMPT] provider=kling-2.6-pro-multishot scenes=${enforcedPrompts.length}`);

        // Fire voiceover + ambient in parallel when narration text is provided
        // Multi-speaker path: detect [Speaker: Name] labels and generate separate voice tracks
        const seqId = `seq-${user.id}-${Date.now()}`;
        const isMultiSpeaker = resolvedVoiceover ? isMultiSpeakerScript(resolvedVoiceover) : false;
        const voiceoverPromise: Promise<{ audioUrl?: string; duration: number }> | null = resolvedVoiceover
          ? (isMultiSpeaker
              ? generateMultiSpeakerVoiceover({
                  script:  resolvedVoiceover,
                  userId:  user.id,
                  jobId:   seqId,
                }).then(r => r ? { audioUrl: r.audioUrl, duration: r.duration } : { audioUrl: undefined, duration: plannedTotalSec })
                  .catch(err => {
                    console.warn("[cinematic-seq] multi-speaker failed (non-fatal):", err instanceof Error ? err.message : err);
                    return { audioUrl: undefined, duration: plannedTotalSec };
                  })
              : elevenLabsVoiceover({
                  text:    resolvedVoiceover,
                  voiceId,
                  userId:  user.id,
                  jobId:   seqId,
                }).catch(err => {
                  console.warn("[cinematic-seq] voiceover failed (non-fatal):", err instanceof Error ? err.message : err);
                  return { audioUrl: undefined as string | undefined, duration: plannedTotalSec };
                }))
          : null;

        if (isMultiSpeaker) console.log(`[MULTI_SPEAK] detected multi-speaker script â€” using per-character voice tracks`);

        // Ambient sound â€” search all prompts + full script so keywords like "rain" are found
        // even when they appear in scene 2+ or only in the script description.
        // Include voiceoverText â€” frontend doesn't send body.script, so rain/war keywords
        // only exist in voiceoverText (the full script text passed for TTS).
        const _ambientSearchText = [...prompts, script ?? "", goal ?? "", voiceoverText ?? ""].filter(Boolean).join(" ");
        const ambientDesc = pickAmbientDescription(_ambientSearchText);
        const ambientPromise: Promise<Buffer | null> = ambientDesc
          ? generateAmbientSound(ambientDesc, plannedTotalSec)
              .catch(err => {
                console.warn("[cinematic-seq] ambient sound failed (non-fatal):", err instanceof Error ? err.message : err);
                return null;
              })
          : Promise.resolve(null);

        // ── Per-scene image assignment ────────────────────────────────────────────────────────────
        // Priority: body.sceneImages[0] (user-selected) → cinema-pipeline Flux → imageUrl fallback
        const fallbackImageUrl: string | null = _isAnimated ? null : (imageUrl ?? null);
        let sceneImageUrls: Array<string | null> = new Array(prompts.length).fill(null);

        let mainImage: string | null = null;

        // 1. User-selected image is always primary for Runway i2v.
        if (!_isAnimated && bodySceneImages.length > 0) {
          mainImage = bodySceneImages[0] ?? null;
          if (mainImage) console.log(`[SCENE_IMAGES] using user-selected image as primary ref url=${mainImage.substring(0, 80)}`);
        }

        // 2. No user image — generate from cinema-pipeline beat[0] so Runway gets a
        //    narrative-accurate reference instead of no image at all.
        if (!mainImage && !_isAnimated && cinemaPipeline) {
          const falKey = process.env.FAL_API_KEY ?? process.env.FALAI_API_KEY;
          if (falKey) {
            try {
              const rc0 = cinemaPipeline.renderContracts[0];
              const imagePrompt = [rc0.environment, rc0.lighting, rc0.cameraState, rc0.characterState, 'photorealistic, cinematic still frame, 9:16 vertical'].filter(Boolean).join('. ');
              console.info('[IMAGE_PROMPT_USED]', imagePrompt);
              const fluxRes = await fetch('https://fal.run/fal-ai/flux/dev', {
                method: 'POST',
                headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: imagePrompt + ', no visible text or writing, family friendly', negative_prompt: [getFluxHardNegative(), passedSceneGraph?.scene_graph?.[0]?.negative_prompt, 'text, words, writing, signs, letters, numbers, captions, watermarks, gibberish text, banners, placards, marijuana, drugs, weed, cannabis, alcohol, cigarettes, weapons, violence, drug paraphernalia, nudity, nsfw'].filter(Boolean).join(', '), num_images: 1, image_size: { width: 1080, height: 1920 }, num_inference_steps: 28, guidance_scale: 3.5, enable_safety_checker: true }),
                signal: AbortSignal.timeout(45_000),
              });
              if (fluxRes.ok) {
                const fluxData = await fluxRes.json() as { images?: { url: string }[] };
                mainImage = fluxData.images?.[0]?.url ?? null;
                if (mainImage) console.log(`[SCENE_IMAGES] cinema-pipeline fallback image generated url=${mainImage.substring(0, 80)}`);
              } else {
                console.warn(`[SCENE_IMAGES] flux generation failed HTTP ${fluxRes.status} — will use imageUrl fallback`);
              }
            } catch (fluxErr) {
              console.warn(`[SCENE_IMAGES] flux generation error (non-fatal): ${fluxErr instanceof Error ? fluxErr.message : String(fluxErr)} — will use imageUrl fallback`);
            }
          }
        }

        if (!_isAnimated && mainImage) {
          // Mirror fal.media image to Supabase before sending to Kling/Runway.
          if (mainImage.includes("fal.media") || mainImage.includes("fal.run")) {
            try {
              const imgRes = await fetch(mainImage, { signal: AbortSignal.timeout(15_000) });
              if (imgRes.ok) {
                const imgBuf = Buffer.from(await imgRes.arrayBuffer());
                const ext = mainImage.endsWith(".png") ? "png" : "jpg";
                const mirrorPath = `${user.id}/kling-mirrors/${Date.now()}.${ext}`;
                const { error: upErr } = await supabaseAdmin.storage
                  .from("renders")
                  .upload(mirrorPath, imgBuf, { contentType: `image/${ext}`, upsert: true });
                if (!upErr) {
                  const { data: { publicUrl } } = supabaseAdmin.storage.from("renders").getPublicUrl(mirrorPath);
                  console.log(`[IMAGE_MIRROR] fal→supabase ok: ${publicUrl.substring(0, 80)}`);
                  mainImage = publicUrl;
                } else {
                  console.warn(`[IMAGE_MIRROR] supabase upload failed: ${upErr.message} — using original fal URL`);
                }
              }
            } catch (mirrorErr) {
              console.warn(`[IMAGE_MIRROR] fetch failed (non-fatal): ${mirrorErr instanceof Error ? mirrorErr.message : mirrorErr} — using original fal URL`);
            }
          }
          for (let i = 0; i < prompts.length; i++) {
            sceneImageUrls[i] = mainImage;
          }
          console.log(`[SCENE_IMAGES] pinning all ${prompts.length} scenes to ${cinemaPipeline ? 'cinema-pipeline' : 'concept'} image (i2v consistency)`);
        } else if (fallbackImageUrl) {
          for (let i = 0; i < prompts.length; i++) {
            sceneImageUrls[i] = fallbackImageUrl;
          }
          console.log(`[SCENE_IMAGES] no sceneImages body — using fallbackImageUrl for all ${prompts.length} scenes (i2v)`);
        } else {
          console.warn(`[SCENE_IMAGES] WARNING: no imageUrl and no sceneImages — Kling i2v will fail all scenes`);
        }

        // Throw if any scene has no image (i2v requires image)
        const missingImages = sceneImageUrls.map((u, i) => u ? null : i).filter((i): i is number => i !== null);
        if (missingImages.length > 0 && bodySceneImages.length > 0) {
          console.warn(`[SCENE_IMAGES] missing images for scenes: ${missingImages.map(i => i + 1).join(", ")} â€” will run t2v for those scenes`);
        }

        // Capture first scene image as thumbnail for My Videos
        capturedThumbnailUrl = sceneImageUrls[0] ?? fallbackImageUrl;

        // â”€â”€ 3 parallel Kling 2.6 Pro single-shot calls â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // Each scene gets its own image + unique prompt + unique seed.
        lastStageLogged = 'KLING_start';
        console.log(`[STAGE_8_KLING] start scenes=${prompts.length}`);
        console.log(`[TIMING] KLING_GENERATION start scenes=${prompts.length} mode=parallel`);
        const genT0   = Date.now();
        const baseSeed = Date.now() % 999_999_999;

        // â”€â”€ Build clean 3-line Kling prompts from storyboard beats â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        // Format: [era]\n[cameraShot].\n[ONE keyAction].
        // No niche prefix â€” beats contain all direction Kling needs.
        const MAX_KLING_PROMPT = 500;
        const eraAnchor = detectedEra ? `${detectedEra}.` : '';

        const FALLBACK_DIRECTIONS = [
          'Wide, static camera.\nSubject stands still, breathing visible, eyes forward.',
          'Medium close-up, slow push in.\nSubject raises their head, eyes meeting camera.',
          'Close-up, static camera.\nSubject reaches forward with one hand, deliberate and slow.',
        ];

        // Use passed beats; otherwise generate inline (~3s) â€” worth it vs ignoring the script.
        // Skip beat generation when Runway is the primary provider: Runway follows prompts
        // directly and the Kling beat format (generic camera directions) degrades quality on Runway.
        // Runway is gated to creator+ tiers. Free/starter fall back to Kling.
        const tierAllowsRunway = TIER_LIMITS[userTier].runwayAccess;
        const useRunwayDirect  = !!process.env.RUNWAYML_API_SECRET && tierAllowsRunway;
        if (!tierAllowsRunway) console.log(`[TIER_GATE] Runway blocked for tier=${userTier} — using Kling`);
        // Cinema Pipeline beats take priority over legacy storyboard analysis.
        // If cinema pipeline ran successfully, skip analyzeScriptBeats entirely.
        let storyBeats: StoryBeat[] | null = passedStoryBeats ?? null;
        if (storyBeats) {
          console.log(`[STORYBOARD] using ${storyBeats.length} beats passed from scene-images`);
        } else if (cinemaPipeline) {
          const { toStoryBeats } = await import("@/lib/cinema/pipeline");
          storyBeats = toStoryBeats(cinemaPipeline.beats);
          console.log(`[STORYBOARD] using ${storyBeats.length} cinema-pipeline beats`);
        } else if (useRunwayDirect) {
          console.log(`[STORYBOARD] skipped â€” Runway provider uses prompts directly for better fidelity`);
        } else {
          const beatScriptText = voiceoverText || goal || prompts.join(" ");
          if (beatScriptText) {
            try {
              storyBeats = await analyzeScriptBeats(beatScriptText, prompts.length, nicheSettings);
              console.log(`[STORYBOARD] inline beat generation OK â€” ${storyBeats.length} beats`);
            } catch (beatErr) {
              console.warn(`[STORYBOARD] inline beat generation failed (non-fatal):`, beatErr instanceof Error ? beatErr.message : beatErr);
            }
          }
        }

        // Resolve template (server-side only â€” internal prompts never reach client)
        const activeTemplate = findTemplate(templateId);
        if (activeTemplate) {
          console.log(`[TEMPLATE] id=${activeTemplate.id} name="${activeTemplate.name}"`);
        }
        const templateNegative = activeTemplate?.negative_prompt ?? '';

        // Story Memory â€” initialise narrative continuity state from beat 0
        let storyMem = initStoryMemory(
          user.id,
          storyBeats?.[0] ?? null,
          nicheSettings.emotionalArc ?? "challenge â†’ effort â†’ resolution",
        );

        // Continuity Engine v2 â€” snapshot-driven state machine
        // Brand memory is cast to v2 format; falls back gracefully if absent
        const brandMemoryV2: BrandMemoryV2 = {
          characters: brandMemory?.characters?.map((c: { character_id: string; name?: string; referenceImages?: string[]; appearance_lock?: string; wardrobeLock?: string }) => ({
            id:              c.character_id ?? "char_001",
            name:            c.name ?? "Protagonist",
            referenceImages: c.referenceImages ?? [],
            appearanceLock:  { face: c.appearance_lock ?? goal ?? "", body: "", hair: "" },
            wardrobeLock:    { default: c.wardrobeLock ?? "" },
            voiceId:         "",
            styleProfile:    { lighting: nicheSettings.cinemaStyle ?? "Roger Deakins golden hour", colorGrade: "teal orange cinematic", cinematicStyle: "cinematic realism" },
          })) ?? [{
            id: "char_001", name: "Protagonist", referenceImages: [],
            appearanceLock: { face: goal ?? "Caucasian person, natural-looking", body: "", hair: "" },
            wardrobeLock:   { default: "" },
            voiceId:        "",
            styleProfile:   { lighting: "Roger Deakins golden hour", colorGrade: "teal orange cinematic", cinematicStyle: "cinematic realism" },
          }],
          globalStyle: { fps: 24, lighting: nicheSettings.cinemaStyle ?? "golden hour", colorGrade: "teal orange cinematic" },
        };
        let continuitySnapshot: ContinuitySnapshot = createInitialSnapshot(
          user.id,
          brandMemoryV2,
          nicheSettings.environmentInclude?.split(",")[0] ?? "appropriate setting",
          storyBeats?.[0]?.emotion ?? "authentic",
        );
        const snapValidation = validateContinuity(continuitySnapshot);
        if (!snapValidation.passed) {
          console.warn(`[CONTINUITY_ENGINE] initial snapshot invalid: ${snapValidation.errors.join(", ")}`);
        } else {
          console.log("[CONTINUITY_ENGINE] initial snapshot validated â€” state machine active");
        }
        console.log(`[STORY_MEM] init arc="${storyMem.story_arc}" emotion="${storyMem.current_state.emotion}"`);

        // Build per-scene Kling prompts.
        // Priority order:
        //   1. Cinema Pipeline RenderContracts (new â€” structured, never raw screenplay)
        //   2. Scene Compiler (passedSceneGraph â€” structured)
        //   3. Template prompt (activeTemplate)
        //   4. Cinema pipeline beats via buildKlingPrompt
        //   5. Creative Director scenes
        //   6. Legacy user prompt fallback
        const builtKlingPrompts: string[] = [];
        const klingScenePrompts = enforcedPrompts.map((_p, i) => {
          let final: string;
          let dirSource: string;

          if (cinemaPipeline?.renderContracts?.[i]) {
            // Cinema Pipeline: structured render contract â€” never contains raw screenplay
            const rc = cinemaPipeline.renderContracts[i];
            const charSuffix = charMemory ? `, ${buildKlingCharacterSuffix(charMemory)}` : '';
            final = `${rc.prompt}${charSuffix}`.slice(0, MAX_KLING_PROMPT);
            dirSource = `cinema-pipeline role=${rc.narrativeRole} shot=${cinemaPipeline.shots[i]?.shotType ?? 'unknown'} emotion="${rc.emotion}"`;
          } else if (passedSceneGraph?.scene_graph?.[i]) {
            // Scene Compiler â€” deterministic structured prompts with continuity metadata
            final = buildKlingPromptFromScene(passedSceneGraph.scene_graph[i], passedSceneGraph).slice(0, MAX_KLING_PROMPT);
            dirSource = `scene-compiler role=${passedSceneGraph.scene_graph[i].narrative_role} shot=${passedSceneGraph.scene_graph[i].camera?.shot_type}`;
          } else if (i === 0 && activeTemplate?.video_prompt) {
            // Template scene 1: use the unified story prompt so Kling has the full arc context
            final = buildTemplateVideoPrompt(activeTemplate).slice(0, MAX_KLING_PROMPT);
            dirSource = `template id=${activeTemplate.id}`;
          } else if (storyBeats?.[i]) {
            final = buildKlingPrompt(storyBeats[i], eraAnchor);
            dirSource = `beat purpose="${storyBeats[i].purpose}" camera="${storyBeats[i].cameraShot ?? 'none'}"`;
          } else if (passedCreativeScenes?.[i]?.motion) {
            final = [eraAnchor, passedCreativeScenes[i].motion].filter(Boolean).join('\n').slice(0, MAX_KLING_PROMPT);
            dirSource = `creative-director scene=${i + 1}`;
          } else {
            final = _p.slice(0, MAX_KLING_PROMPT);
            dirSource = "user-prompt";
          }

          builtKlingPrompts.push(final);
          console.log(`[KLING_PROMPT_UNIQUE] scene=${i + 1} src=${dirSource}: ${final.substring(0, 200)}`);
          if (i > 0) {
            console.log(`[PROMPT_DIFF] scene=${i + 1} differs from scene 1: ${final !== builtKlingPrompts[0]}`);
          }
          return final;
        });

        // Inject template negative prompt into all scenes (in addition to base negatives)
        if (templateNegative) {
          for (let i = 0; i < sceneNegativePrompts.length; i++) {
            sceneNegativePrompts[i] = [sceneNegativePrompts[i], templateNegative].filter(Boolean).join(", ");
          }
          console.log(`[TEMPLATE_NEG] injected "${templateNegative.substring(0, 80)}" into ${sceneNegativePrompts.length} scenes`);
        }

        const extractedUrls: Array<string | null> = new Array(prompts.length).fill(null);
        const sceneProviders: string[]             = new Array(prompts.length).fill('kling');
        const slaFallbackIndices: number[] = [];

        // Absolute continuity constraint (distilled for Kling 500-char prompt limit)
        // Full constraint system is in the GENERATION_CONSTRAINTS block below.
        const CONTINUITY_PREFIX =
          "CONTINUITY LOCK: Begin from exact final frame of previous scene. " +
          "Preserve pose, camera position, focal length for first 2 seconds â€” no new motion. " +
          "Same character, identical clothing, same lighting vector. " +
          "Resume motion naturally after 2-second freeze. " +
          "Continuity overrides creativity.\n";

        // Provider pre-flight — throws if RUNWAYML_API_SECRET is absent
        // and VIDEO_PROVIDER_FALLBACK=true is not set. Runs once before clip loop.
        assertProviderConfig();

        let driftMotionStrength = 0.80;
        let driftPromptPrefix   = '';

        for (let i = 0; i < klingScenePrompts.length; i++) {
          if (i > 0) await new Promise(r => setTimeout(r, 1200));

          // For Scene 2+, extract last frame of the previous successful clip
          let sceneImg = sceneImageUrls[i];
          const originalRefImg = sceneImageUrls[0] ?? null;

          if (i > 0) {
            const prevUrl = extractedUrls[i - 1];
            if (prevUrl) {
              const lastFrame = await extractLastFrame(prevUrl, user.id, i - 1);
              if (lastFrame) {
                sceneImg = lastFrame;
                if (passedSceneGraph) attachLastFrame(passedSceneGraph, i, lastFrame);
                // Continuity Engine: attach frame to current snapshot, then advance to next scene
                continuitySnapshot = attachLastFrameToSnapshot(continuitySnapshot, lastFrame);
                console.log(`[CHAIN] scene=${i + 1} chained from scene ${i} url=${lastFrame.substring(0, 80)}`);

                // Drift detection: compare last frame vs original reference (non-blocking within stagger)
                if (originalRefImg?.startsWith("https://")) {
                  const drift = await detectFrameDrift(lastFrame, originalRefImg, i, driftMotionStrength);
                  if (drift) {
                    driftMotionStrength = drift.adjustment.newMotionStrength;
                    driftPromptPrefix   = drift.adjustment.prefixOverride ?? '';
                  }
                }
              } else {
                console.warn(`[CHAIN] scene=${i + 1} last-frame failed â€” using original ref`);
              }
            } else {
              console.warn(`[CHAIN] scene=${i + 1} prev clip failed â€” using original ref`);
            }
          }

          // Prepend drift correction + story context + continuity for scenes 2+
          const storyCtx = i > 0 ? buildStoryContextPrefix(storyMem) : '';
          const transitionBridge = (i > 0 && continuitySnapshot.story.activeBeat)
            ? buildTransitionBridge(continuitySnapshot.story.activeBeat)
            : '';
          const klingPrompt = i === 0
            ? klingScenePrompts[i]
            : (driftPromptPrefix + storyCtx + CONTINUITY_PREFIX + klingScenePrompts[i] + transitionBridge).slice(0, 500);

          const mode = sceneImg?.startsWith("https://") ? "i2v" : "t2v";

          // Model router: narrative role now comes from cinema pipeline when available
          // Cinema pipeline uses 7-value set; map to router's 4-value set.
          const cinemaRole = cinemaPipeline?.renderContracts?.[i]?.narrativeRole;
          const sceneNarrativeRole: "hook" | "development" | "climax" | "resolution" =
            cinemaRole === 'establish' || cinemaRole === 'introduce' ? 'hook'
            : cinemaRole === 'conflict' || cinemaRole === 'reaction'  ? 'development'
            : cinemaRole === 'climax'                                  ? 'climax'
            : cinemaRole === 'resolution'                              ? 'resolution'
            : (passedSceneGraph?.scene_graph?.[i]?.narrative_role as "hook" | "development" | "climax" | "resolution" | undefined)
              ?? (i === 0 ? "hook" : i === klingScenePrompts.length - 1 ? "resolution" : "development");
          const routerDecision = selectVideoProvider({
            narrativeRole:    sceneNarrativeRole,
            motionComplexity: inferMotionComplexity(klingScenePrompts[i]),
            durationSeconds:  KLING_CLIP_SECS,
            budgetMode:       !tierAllowsRunway,  // forces Kling for free/starter
            hasReferenceImage: mode === "i2v",
          });
          const imgSource = bodySceneImages.length > 0 ? 'user-selected' : (cinemaPipeline ? 'flux-fallback' : 'imageUrl-fallback');
          console.info('[RUNWAY_IMAGE_SOURCE]', imgSource, sceneImg?.substring(0, 80) ?? 'NONE');
          console.log(`[CLIP_FIRE] scene=${i + 1} mode=${mode} provider=${routerDecision.provider} role=${sceneNarrativeRole} motion=${driftMotionStrength.toFixed(2)} imageUrl=${sceneImg?.substring(0, 80) ?? "NONE"}`);

          // Merge cinema pipeline negative prompt with base negatives
          const cinemaNeg = cinemaPipeline?.renderContracts?.[i]?.negativePrompt ?? '';
          const finalNegativePrompt = [sceneNegativePrompts[i], cinemaNeg].filter(Boolean).join(', ') || undefined;

          const klingParams = {
            negativePrompt:  finalNegativePrompt,
            imageUrl:        mode === "i2v" ? sceneImg : undefined,
            duration:        KLING_CLIP_SECS,
            aspectRatio:     "9:16" as const,
            mode:            (routerDecision.klingMode === "standard" ? "std" : "pro") as "pro" | "std",
            motionStrength:  driftMotionStrength,
            seed:            baseSeed + i,
            sceneNumber:     i + 1,
          };

          try {
            const runwayRouting = chooseRunwayModel(voiceoverText ?? klingPrompt, userTier, speedMode);
            const result = routerDecision.provider === "runway"
              ? await generateRunwayClip({
                  prompt:      klingPrompt,
                  imageUrl:    mode === "i2v" ? sceneImg : undefined,
                  duration:    KLING_CLIP_SECS as 5 | 10,
                  aspectRatio: "9:16",
                  model:       runwayRouting.model,
                })
              : await generateKlingClip({ prompt: klingPrompt, ...klingParams });

            extractedUrls[i]  = result.videoUrl;
            sceneProviders[i] = routerDecision.provider;
            storyMem = advanceStoryMemory(storyMem, storyBeats?.[i] ?? null, result.videoUrl);
            // Continuity Engine: persist snapshot then advance to next scene state
            void saveSnapshot(user.id, i, i, continuitySnapshot);
            if (i < klingScenePrompts.length - 1) {
              const nextBeat    = storyBeats?.[i + 1]?.emotion;
              continuitySnapshot = buildNextScene(continuitySnapshot, undefined, nextBeat ?? undefined, undefined);
              const snapCheck    = validateContinuity(continuitySnapshot);
              if (!snapCheck.passed) {
                console.warn(`[CONTINUITY_ENGINE] snapshot scene=${i + 2} invalid: ${snapCheck.errors.join(", ")}`);
              }
            }
            // Reset drift prefix after a successful clip â€” let the detector re-evaluate next frame
            driftPromptPrefix = '';
            console.log(`[CLIP_OK] scene=${i + 1} ${result.generationMs}ms provider=${routerDecision.provider} emotion="${storyMem.current_state.emotion}" url=${result.videoUrl.substring(0, 80)}`);
            clipReports.push(`scene=${i + 1} | ${routerDecision.provider} | OK ${result.generationMs}ms`);
          } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            console.warn(`[CLIP_FAIL] scene=${i + 1} provider=${routerDecision.provider} attempt=1 reason="${reason.substring(0, 120)}" â€” retrying with kling`);

            // Auto-regen: single retry always on Kling (reliable fallback)
            try {
              const retryResult = await generateKlingClip({
                prompt:         buildRetryPrompt(klingPrompt, 1),
                ...klingParams,
                mode:           "pro",
                motionStrength: Math.max(0.40, driftMotionStrength - 0.20),
              });
              extractedUrls[i]  = retryResult.videoUrl;
              sceneProviders[i] = 'kling'; // retry always falls back to kling
              storyMem = advanceStoryMemory(storyMem, storyBeats?.[i] ?? null, retryResult.videoUrl);
              void saveSnapshot(user.id, i, i, continuitySnapshot);
              console.log(`[CLIP_RETRY_OK] scene=${i + 1} kling-retry ${retryResult.generationMs}ms url=${retryResult.videoUrl.substring(0, 80)}`);
              clipReports.push(`scene=${i + 1} | kling-retry | RETRY_OK ${retryResult.generationMs}ms`);
            } catch (retryErr) {
              const retryReason = retryErr instanceof Error ? retryErr.message : String(retryErr);
              console.error(`[CLIP_FAIL_FINAL] scene=${i + 1} both attempts failed: ${retryReason.substring(0, 120)}`);
              clipReports.push(`scene=${i + 1} | kling-retry | FAIL_FINAL | ${retryReason}`);
            }
          }
        }

        console.log(`[CLIPS_TOTAL] success=${extractedUrls.filter(Boolean).length}/${prompts.length} breakdown=${extractedUrls.map((u, i) => `scene${i + 1}:${u ? "OK" : "FAIL"}`).join(" ")}`);

        const genElapsed      = Date.now() - genT0;
        console.log(`[TIMING] KLING_GENERATION complete ${genElapsed}ms`);

        const failedSceneIndices = extractedUrls
          .map((url, idx) => (url ? -1 : idx))
          .filter(idx => idx >= 0);
        const clip_urls       = extractedUrls.filter((u): u is string => u !== null);
        const successfulClips = clip_urls.length;
        const failedClips     = prompts.length - successfulClips;
        const motionCoverage  = successfulClips > 0 ? Math.round((successfulClips / prompts.length) * 100) : 0;
        const continuityScore = null;

        console.log(`[QUALITY_GUARDRAIL] { motionScenes: ${successfulClips}, totalScenes: ${prompts.length}, coverage: ${motionCoverage}% }`);

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

        const postT0 = Date.now();
        const actualCost = successfulClips === prompts.length
          ? CREDIT_COSTS.video_cinematic
          : Math.ceil(CREDIT_COSTS.video_cinematic * (successfulClips / prompts.length));
        if (successfulClips < prompts.length) {
          console.log(`[CREDIT_REFUND] partial success: ${successfulClips}/${prompts.length} clips — charging ${actualCost} of ${CREDIT_COSTS.video_cinematic} credits`);
        }
        let stitched_url = clip_urls[0];
        let audio_url: string | undefined;

        // Await voiceover + ambient (both launched in parallel with clip generation)
        const ambientBuffer = await ambientPromise;
        if (ambientDesc && ambientBuffer) {
          console.log(`[AMBIENT] ready â€” "${ambientDesc.substring(0, 50)}" ${ambientBuffer.length}b`);
        }

        if (voiceoverPromise) {
          const voResult = await voiceoverPromise;
          audio_url = voResult.audioUrl;
          console.log(`[VOICE_RESULT] audio_url=${audio_url ? audio_url.substring(0, 80) : "MISSING â€” voiceover failed or text was empty"}`);
        } else {
          console.log(`[VOICE_RESULT] skipped â€” no voiceoverText provided`);
        }

        // Mix voiceover + ambient into one audio track (ambient ducked to 20% under voice)
        let finalAudioUrl: string | undefined = audio_url;
        if (audio_url && ambientBuffer) {
          try {
            finalAudioUrl = await mixVoiceAndAmbient({ voiceUrl: audio_url, ambientBuffer, userId: user.id });
            console.log(`[AUDIO_MIX] voice+ambient mixed url=${finalAudioUrl.substring(0, 80)}`);
          } catch (mixErr) {
            console.warn("[AUDIO_MIX] mix failed, falling back to voice only:", mixErr instanceof Error ? mixErr.message : mixErr);
          }
        } else if (audio_url) {
          console.log(`[AUDIO_MIX] skipped â€” no ambient sound matched for this scene`);
        }

        // â”€â”€ Stitch clips + audio via Railway Composer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
        const composerUrl = process.env.COMPOSER_SERVICE_URL;
        const composerKey = process.env.COMPOSER_API_KEY ?? "";
        console.log(`[MERGE_START] clips=${clip_urls.length} voice=${!!audio_url} ambient=${!!ambientBuffer} mixed=${finalAudioUrl !== audio_url} composer=${!!composerUrl}`);
        if (composerUrl && clip_urls.length > 0) {
          console.log(`[RAILWAY_STITCH] clips=${clip_urls.length} hasAudio=${!!finalAudioUrl}`);
          try {
            const fetchBuf = async (url: string, label: string) => {
              const r = await fetch(url, { cache: "no-store" });
              if (!r.ok) throw new Error(`${label} HTTP ${r.status}`);
              return Buffer.from(await r.arrayBuffer());
            };
            const clipBuffers = await Promise.all(clip_urls.map((url, i) => fetchBuf(url, `clip${i + 1}`)));
            const audioBuffer = finalAudioUrl ? await fetchBuf(finalAudioUrl, "audio") : null;

            const form = new FormData();
            for (let i = 0; i < clipBuffers.length; i++) {
              form.append("clips", new Blob([clipBuffers[i]], { type: "video/mp4" }), `clip_${i}.mp4`);
            }
            if (audioBuffer) {
              form.append("voiceover", new Blob([audioBuffer], { type: "audio/mpeg" }), "voiceover.mp3");
            }
            form.append("shot_plan", JSON.stringify({
              shots: clip_urls.map(() => ({
                duration:            clipDurationSecs,
                energy_curve:        "sustain",
                transition_in:       "hard_cut",
                transition_after:    null,
                transition_duration: 0,
                zoom_effect:         false,
              })),
            }));

            const railwayRes = await fetch(`${composerUrl}/compose`, {
              method:  "POST",
              headers: composerKey ? { "x-api-key": composerKey } : {},
              body:    form,
              signal:  AbortSignal.timeout(20_000), // Railway always SIGKILL â€” fail fast, fall through to FFmpeg
            });

            if (railwayRes.ok) {
              const result = await railwayRes.json() as { success?: boolean; video_url?: string };
              const rawUrl = result.video_url;
              if (rawUrl) {
                const resolvedUrl = rawUrl.startsWith("http") ? rawUrl : `${composerUrl}${rawUrl}`;
                const composedBuf = await fetchBuf(resolvedUrl, "railway-output");
                const storePath   = `renders/${user.id}/${Date.now()}/cinematic.mp4`;
                const { error: upErr } = await supabaseAdmin.storage
                  .from("renders")
                  .upload(storePath, composedBuf, { contentType: "video/mp4", upsert: true });
                if (!upErr) {
                  const { data: { publicUrl } } = supabaseAdmin.storage.from("renders").getPublicUrl(storePath);
                  stitched_url = publicUrl;
                  console.log(`[RAILWAY_STITCH_OK] ${clip_urls.length} clips â†’ ${stitched_url.substring(0, 80)}`);
                } else {
                  console.warn("[RAILWAY_STITCH] upload failed:", upErr.message);
                }
              }
            } else {
              // Railway returned HTTP error â€” fall back to FFmpeg stitch (all clips)
              const errText = await railwayRes.text().catch(() => "");
              console.warn(`[RAILWAY_STITCH] composer HTTP ${railwayRes.status}: ${errText.substring(0, 200)} â€” falling back to FFmpeg stitch`);
              try {
                stitched_url = await stitchClipsWithAudio({ clipUrls: clip_urls, audioUrl: finalAudioUrl, userId: user.id, editingPlan: cinemaPipeline?.editingPlan });
                console.log(`[FFMPEG_FALLBACK_OK] railway_error clips=${clip_urls.length} url=${stitched_url.substring(0, 80)}`);
              } catch (ffmpegErr) {
                console.error("[FFMPEG_FALLBACK] stitchClipsWithAudio failed:", ffmpegErr instanceof Error ? ffmpegErr.message : ffmpegErr);
              }
            }
          } catch (railwayErr) {
            // Network-level Railway failure â€” fall back to FFmpeg stitch (all clips)
            console.warn("[RAILWAY_STITCH] network error:", railwayErr instanceof Error ? railwayErr.message : railwayErr);
            try {
              stitched_url = await stitchClipsWithAudio({ clipUrls: clip_urls, audioUrl: finalAudioUrl, userId: user.id, editingPlan: cinemaPipeline?.editingPlan });
              console.log(`[FFMPEG_FALLBACK_OK] railway_network_err clips=${clip_urls.length} url=${stitched_url.substring(0, 80)}`);
            } catch (ffmpegErr) {
              console.error("[FFMPEG_FALLBACK] stitchClipsWithAudio failed:", ffmpegErr instanceof Error ? ffmpegErr.message : ffmpegErr);
            }
          }
        } else {
          console.log(`[RAILWAY_STITCH] skipped â€” composerUrl=${!!composerUrl} clips=${clip_urls.length}`);
          // FFmpeg fallback: concatenate ALL clips then merge audio (no looping)
          if (clip_urls.length > 0) {
            try {
              stitched_url = await stitchClipsWithAudio({
                clipUrls:    clip_urls,
                audioUrl:    finalAudioUrl,
                userId:      user.id,
                editingPlan: cinemaPipeline?.editingPlan,
              });
              console.log(`[FFMPEG_FALLBACK_OK] clips=${clip_urls.length} url=${stitched_url.substring(0, 80)}`);
            } catch (ffmpegErr) {
              console.error("[FFMPEG_FALLBACK] stitchClipsWithAudio failed:", ffmpegErr instanceof Error ? ffmpegErr.message : ffmpegErr);
              // Last resort: return first clip
              stitched_url = clip_urls[0];
            }
          }
        }

        console.log(`[MERGE_DONE] final_url=${stitched_url.substring(0, 80)} has_audio=${!!audio_url} has_ambient=${!!ambientBuffer} mixed=${finalAudioUrl !== audio_url}`);

        const totalMs      = Date.now() - routeT0;
        const postMs       = Date.now() - postT0;

        const bottleneckStage = genElapsed > SLA_GEN_MS * 0.85   ? "generation"
          : postMs > (SLA_POST_MS * 0.85)                         ? "post_processing"
          : "nominal";

        const skippedScenes = slaFallbackIndices;
        const slaCompliant = skippedScenes.length === 0 && totalMs <= SLA_TOTAL_MS;

        console.log(`[TIMING] SEQUENCE TOTAL ${totalMs}ms clips=${clip_urls.length} kling=${successfulClips} sla=${slaCompliant ? "OK" : "BREACH"} bottleneck=${bottleneckStage}`);

        console.log("[PIPELINE_SUMMARY]", JSON.stringify({
          version:          ROUTE_VERSION,
          niche:            nicheSettings.key,
          clips_attempted:  prompts.length,
          clips_succeeded:  successfulClips,
          clip_status:      extractedUrls.map((u, i) => `scene${i + 1}:${u ? "OK" : "FAIL"}`),
          voice_url:        audio_url ? "YES" : "NO",
          ambient_url:      ambientDesc ? "YES" : "NO",
          audio_mixed:      (finalAudioUrl !== audio_url && !!finalAudioUrl) ? "YES" : "NO",
          composer_used:    !!(composerUrl),
          final_url:        stitched_url ? "YES" : "NO",
          has_audio:        !!finalAudioUrl,
          final_is_kling:   stitched_url === clip_urls[0],
          total_ms:         totalMs,
        }));

        return {
          data: {
            success:             failedClips === 0,
            partial:             failedClips > 0 && successfulClips > 0,
            videoUrl:            stitched_url,
            modelUsed:           "kling-2.6-pro",
            model:               "kling-2.6-pro",
            hasMotion:           successfulClips > 0,
            hasAudio:            !!voiceoverText && !!finalAudioUrl,
            duration:            successfulClips * clipDurationSecs,
            stitched_url,
            audio_url:           finalAudioUrl ?? null,
            clip_urls,
            failed_scenes:       failedSceneIndices.map((i: number) => i + 1),
            clips_failed:        failedClips,
            clips_succeeded:     successfulClips,
            source_images:       sourceImages.filter((u): u is string => u !== null),
            clips_generated:     successfulClips,
            clip_duration:       clipDurationSecs,
            total_duration:      successfulClips * clipDurationSecs,
            providers:           clip_urls.map((_, idx) => sceneProviders[idx] ?? 'kling'),
            motion_coverage:     motionCoverage,
            model_used:          "kling-2.6-pro",
            kling_scenes:        sceneProviders.filter(p => p === 'kling').length,
            runway_scenes:       sceneProviders.filter(p => p === 'runway').length,
            continuity_score:    continuityScore,
            skipped_scenes:      skippedScenes,
            sla_compliant:       slaCompliant,
            timing_breakdown: {
              total_ms:           totalMs,
              generation_ms:      genElapsed,
              post_processing_ms: postMs,
              scene_count:        prompts.length,
              provider_mix: {
                kling:  sceneProviders.filter(p => p === 'kling').length,
                runway: sceneProviders.filter(p => p === 'runway').length,
              },
              bottleneck_stage:   bottleneckStage,
            },
            timing_ms: { generation: genElapsed, total: totalMs },
          },
          actualCost,
        };
      },
    });

    // Auto-save to My Videos (fire-and-forget; failure is non-fatal)
    const payload = responsePayload as {
      clip_urls?: string[]; stitched_url?: string;
      clips_succeeded?: number; total_duration?: number;
      runway_scenes?: number;
    };
    const saveUrl = payload.stitched_url ?? payload.clip_urls?.[0];
    if (saveUrl) {
      void saveRenderToLibrary({
        userId:        user.id,
        videoUrl:      saveUrl,
        template:      "cinematic-sequence",
        niche:         niche ?? null,
        script:        voiceoverText ?? script ?? null,
        thumbnail_url: capturedThumbnailUrl,
      }).catch(err => console.warn("[cinematic-sequence] auto-save failed:", err));
    }

    // Record generation metrics (fire-and-forget)
    void saasMetrics.record({
      userId:       user.id,
      type:         'cinematic',
      provider:     (payload.runway_scenes ?? 0) > 0 ? 'runway+kling' : 'kling',
      niche:        niche ?? undefined,
      durationSecs: payload.total_duration ?? 30,
      creditsUsed:  estimatedCost,
      generationMs: Date.now() - routeT0,
      success:      !!(payload.clip_urls?.length),
    }).catch(() => {});

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
    console.error("[CINEMATIC_ERROR]", JSON.stringify({
      message:         msg,
      lastStageLogged,
      stack:           err instanceof Error ? err.stack?.substring(0, 600) : undefined,
    }));
    return Response.json({
      success: false,
      error:   "Video generation failed",
      message: msg,
      lastStageLogged,
      SEQUENCE_ROUTE_VERSION: ROUTE_VERSION,
    }, { status: 500 });

  } finally {
    // Fire-and-forget local cache update
    releaseVideoSlot(user.id);
    // Awaited DB safety net â€” ensures slot is cleared even if process is about to exit
    try {
      const { error: slotErr } = await supabaseAdmin
        .from("rate_limit_state")
        .update({ concurrent_video_jobs: 0 })
        .eq("user_id", user.id);
      if (slotErr) console.warn("[SLOT_RELEASE_DB] update failed (non-fatal):", slotErr.message);
      else console.log("[SLOT_RELEASED] concurrent_video_jobs=0 user=" + user.id);
    } catch (e) {
      console.warn("[SLOT_RELEASE_DB] threw:", e instanceof Error ? e.message : e);
    }
  }
}
