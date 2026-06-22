import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { elevenLabsVoiceover, mergeVideoAudio, mixVoiceAndAmbient, stitchClipsWithAudio, generateAmbientSound, pickAmbientDescription } from "@/lib/services/elevenlabs";
import { generateKlingClip } from "@/lib/providers/kling-direct";
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
import { loadBrandMemory } from "@/lib/memory/brand-memory";
import { saveRenderToLibrary } from "@/lib/renders/save-render";
import {
  applySubjectEthnicityToPrompts,
  resolveSubjectEthnicity,
  type SubjectEthnicityInput,
} from "@/lib/subject-appearance";
import { parseJsonWithEthnicityFix } from "@/middleware/ethnicityFix";
import { getNicheSettings, detectEra } from "@/lib/config/nicheSettings";
import { beatToKlingDirection, type StoryBeat } from "@/lib/storyboard-planner";


export const maxDuration = 300;

const KLING_CLIP_SECS  = 5;   // Kling v3 std: 5s per scene (faster generation, 3×5s = 15s video)
const ROUTE_VERSION    = "2026-06-22-v29-speed-std-5s";

// ── SLA budget: Vercel maxDuration=300s; keep 30s for post-processing ─────────
const SLA_TOTAL_MS   = 270_000; // 270s total (30s margin before Vercel 300s kills)
const SLA_GEN_MS     = 240_000; // clip generation allocation — fal.ai needs ~200s/clip parallel
const SLA_POST_MS    =  30_000; // post-processing + continuity reserve
// Absolute deadline for generation to finish (30s reserved for post)
// Computed per-request as: routeT0 + SLA_TOTAL_MS - SLA_POST_MS

// ── Types ─────────────────────────────────────────────────────────────────────

void getVideoProvider; // retained for potential future routing

class AllClipsFailedError extends Error {
  readonly payload: Record<string, unknown>;
  constructor(payload: Record<string, unknown>) {
    super("All clips failed to generate");
    this.name = "AllClipsFailedError";
    this.payload = payload;
  }
}

// ── Storage upload helper ─────────────────────────────────────────────────────

// ── Last-frame extraction for clip chaining ───────────────────────────────────

// Resolve ffmpeg binary — mirrors clip-stitcher.ts pattern:
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
  console.error("[cinematic-seq] CRITICAL: no executable ffmpeg — last-frame chaining will fail");
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

    // -sseof is an INPUT option — must come before the input file on the command line.
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

// ── Couple detection ──────────────────────────────────────────────────────────

const COUPLE_RE = /\b(couple|two people|both of them|together|partner|dancing with|walking with|holding hands|hand in hand|each other|lovers|husband|wife|boyfriend|girlfriend|fiancee?|spouse|relationship|romance|romantic)\b/i;

// Detect animated / cartoon / Disney / Pixar style requests from goal, script, or niche.
// When true: inject strong style directives and suppress photorealism negatives.
const ANIMATED_RE = /\b(disney|pixar|dreamworks|cartoon|animated|animation|3d animation|cgi cartoon|anime|storybook|princess peach|mario|luigi|bowser|zelda|kirby|pikachu|yoshi|donkey kong|abraham lincoln as cartoon|fictional character|comic book character|illustrated character|caricature)\b/i;

function detectAnimatedStyle(text: string): boolean {
  return ANIMATED_RE.test(text);
}

// ── Clip generators ───────────────────────────────────────────────────────────

const ETHNICITY_PREFIX_RE =
  /\[(?:MANDATORY ETHNICITY OVERRIDE|ETHNICITY DEFAULT RULE)[^\]]*\][\s\S]*?(?=\[|$)/gi;

function stripEthnicityPrefix(text: string): string {
  return text
    .replace(ETHNICITY_PREFIX_RE, "")
    .replace(/\[[^\]]{2,}\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Scene type inference (keyword-based, used for logging) ───────────────────

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

// ── Emotional arc detection — extracts motion tone from script thirds ─────────

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

// Per-scene camera moves — each scene gets a different camera direction
// Close-up and push-in focused — no pull-backs for emotional intimate content
const SCENE_CAMERA_MOVES = [
  'Extreme close-up, camera holds still then slow push toward subject.',
  'Tight close-up on hands or face, shallow depth of field, slow push in.',
  'Camera stays tight on hands then rises gently to face.',
  'Close-up tilts down to hands then drifts upward to eyes.',
  'Camera pushes toward face in a slow deliberate drift.',
];

// Motion-intent scoring — logging only. Provider is always Seedance (sceneRouter).

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

  console.log(`[PLAN_GATE] user=${user.id} provider=kling-direct-v2.6`);

  // Video generation uses Kling direct API — no fal.ai needed for video.
  // (fal.ai is still used by generate-scene-images for Flux image generation.)
  if (!process.env.KLING_API_KEY && !(process.env.KLING_ACCESS_KEY && process.env.KLING_SECRET_KEY)) {
    return Response.json({ error: "KLING_API_KEY not configured — required for Kling direct video generation" }, { status: 500 });
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
  try {
    const body = await parseJsonWithEthnicityFix<{
      prompts?: string[];
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
      voiceoverText?: string;
      voiceId?: string;
      storyBeats?: StoryBeat[];
    }>(req);
    subjectEthnicity = body.subjectEthnicity ?? 'caucasian';
    bodySceneImages = (body.sceneImages ?? []).filter((u): u is string => typeof u === "string" && u.startsWith("https://"));
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
          // Strip ALL CAPS scene direction lines (e.g. "BARRACKS. RAIN. LAMPLIGHT.")
          .replace(/^[A-Z][A-Z\s.,!?:—]{8,}$/gm, "")
          .replace(/\n{3,}/g, "\n\n")
    ).trim() || undefined;
    voiceId = body.voiceId;
    prompts      = body.prompts ?? [];
    imageUrl     = body.imageUrl;
    clipDuration = body.clipDuration;
    sceneTypes   = body.sceneTypes;
    script       = body.script;
    goal         = body.goal;
    characterId  = body.characterId;
    niche        = body.niche;
    isQuickMode = body.videoType === 'quick';
    passedStoryBeats = Array.isArray(body.storyBeats) && body.storyBeats.length > 0 ? body.storyBeats : undefined;
    console.log(`[BRIEF_CONTEXT] goal="${(goal ?? "").substring(0, 120)}" characterId=${characterId ?? "none"} niche=${niche ?? "none"} ethnicity=${subjectEthnicity} storyBeats=${passedStoryBeats?.length ?? 0}`)
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // ── Niche settings ────────────────────────────────────────────────────────────
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

  // Load brand + character memory in parallel (non-blocking — generation continues without either)
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

  // Inject creative brief into scene 1 — strip any ethnicity middleware prefix first
  if (goal?.trim() && prompts.length > 0) {
    let goalText = goal.trim();
    // Strip ethnicity middleware prefix if it leaked through
    const ethnicityPrefixRe = /^\[(?:MANDATORY ETHNICITY OVERRIDE|ETHNICITY DEFAULT RULE)[^\]]*\][\s\S]*?\n\n/i;
    goalText = goalText.replace(ethnicityPrefixRe, "").trim();
    if (goalText) {
      prompts[0] = `${goalText.slice(0, 200)}, ${prompts[0]}`;
      console.log(`[BRIEF_INJECT] scene=1 prompt="${prompts[0].substring(0, 120)}"`);
    }
  }

  // ── Abuse protection (video-specific: cooldown + concurrent job limit) ────
  console.log(`[STAGE_1_ABUSE] start user=${user.id}`);
  const videoAbuse = await Promise.race([
    checkAbuse({ userId: user.id, input: prompts[0] ?? "", isVideoGeneration: true }),
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('ABUSE_CHECK_TIMEOUT_10s')), 10_000)),
  ]).catch(err => {
    console.warn(`[STAGE_1_ABUSE] timeout/error: ${err instanceof Error ? err.message : err} — failing open`);
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

  // ── Credit-protected generation pipeline ─────────────────────────────────────
  // Estimate conservatively (all Seedance); credit_commit_atomic refunds the difference.
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
        console.log(`[STAGE_2_CREDIT] done — inside run`);

        // ── Guardrail (throw on rejection → auto-rollback) ────────────────────
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
        console.info("[DURATION_PLAN]", {
          provider:       "kling-2.6-pro",
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
        console.log(`[PLAN] provider=kling-v3 scenes=${klingScenesTotal} mode=${isQuickMode ? "quick" : "cinematic"}`);
        console.log(`[PROVIDER_USAGE] { klingScenes: ${klingScenesTotal} }`);

        // ── Visual Continuity: extract bibles + inject enforcement suffixes ────
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

        console.log(`[STAGE_5_CONTINUITY] start`);
        try {
          bibles = await Promise.race([
            extractBibles(enforcedPrompts, script),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('[STAGE_5_CONTINUITY] TIMEOUT after 15s')), 15_000)),
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
        lastStageLogged = 'CONTINUITY_done';
        console.log(`[STAGE_5_CONTINUITY] done`);

        // Character memory injection — stacks on top of continuity bibles
        console.log(`[STAGE_6_CHAR_BRAND] start`);
        if (charMemory) {
          const charSuffix = buildKlingCharacterSuffix(charMemory);
          if (charSuffix.trim()) {
            enforcedPrompts = enforcedPrompts.map(p => `${p}, ${charSuffix}`);
            console.log(`[CHAR_INJECT] suffix="${charSuffix.substring(0, 80)}" injected into ${enforcedPrompts.length} prompts`);
          }
        }

        // Brand memory injection — appends visual style to Flux image prompts
        if (brandMemory?.fluxStyleSuffix) {
          enforcedPrompts = enforcedPrompts.map(p => `${p}, ${brandMemory.fluxStyleSuffix}`);
          console.log(`[BRAND_INJECT] fluxSuffix="${brandMemory.fluxStyleSuffix.substring(0, 80)}" injected into ${enforcedPrompts.length} prompts`);
        }
        lastStageLogged = 'CHAR_BRAND_done';
        console.log(`[STAGE_6_CHAR_BRAND] done`);

        // ── Animated / cartoon style enforcement ──────────────────────────────
        // Include niche in detection so "Animation" niche always triggers animated style
        console.log(`[STAGE_7_PROMPT_ARC] start`);
        const _combinedCtx  = `${goal ?? ""} ${script ?? ""} ${niche ?? ""}`.toLowerCase();
        const _isAnimated   = detectAnimatedStyle(_combinedCtx) || /\banimation\b/i.test(niche ?? "");
        const ANIM_PREFIX   = "In vibrant Disney Pixar 3D animated style, colorful cartoon characters with big expressive eyes, smooth CGI animation, stylized proportions, highly detailed 3D animated render, cinematic lighting, ";
        if (_isAnimated) {
          // Always prepend — unconditional so every scene is style-locked regardless of prompt wording
          enforcedPrompts = enforcedPrompts.map(p => `${ANIM_PREFIX}${p}`);
          console.log(`[STYLE_ENFORCED] animation=true niche="${niche ?? ""}" prefix="${ANIM_PREFIX.substring(0, 60)}" scenes=${enforcedPrompts.length}`);
        }

        // ── Cinematic lighting + emotional arc injection (SKIP for animated) ──
        // Animated content uses CGI-style prompts — camera/arc direction is for live-action only.
        const _isEmotional  = !_isAnimated && (
          /\b(beach|sunset|golden|tear|sad|cri|cry|weep|sob|emotion|danc|shore|ocean|wave|romantic|intimate|dusk|twilight|hug|embrac|comfort|vulnerab|loneli|ach|grief|coffee|mug)\b/.test(_combinedCtx)
          || /tears|crying|emotional|dancing|hugging|embracing|comforting/.test(_combinedCtx)
        );
        const _isCoupleCtx  = !_isAnimated && (COUPLE_RE.test(goal ?? "") || COUPLE_RE.test(script ?? ""));
        const _total        = enforcedPrompts.length;

        // Extract emotional arc from script text — runs for ALL live-action content
        // Falls back to niche.emotionalArc label (logged only), then neutral
        const _scriptForArc = (script ?? goal ?? enforcedPrompts.join(' ')).trim();
        const _arc = !_isAnimated && _scriptForArc ? detectEmotionalArc(_scriptForArc) : null;
        if (_arc) {
          console.log(`[EMOTIONAL_ARC] detected: opening="${_arc.opening.substring(0, 60)}" | middle="${_arc.middle.substring(0, 60)}" | close="${_arc.close.substring(0, 60)}"`);
        } else if (nicheSettings.emotionalArc) {
          console.log(`[EMOTIONAL_ARC] not detected from script — niche arc="${nicheSettings.emotionalArc}" (narrative label for niche="${nicheSettings.key}")`);
        } else {
          console.log(`[EMOTIONAL_ARC] not detected — using neutral movement for all scenes`);
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
              // Use arc detected from script for motion — fixes slideshow output
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
          console.log(`[PROMPT_ARC] SKIPPED for animated content — ${_total} scene(s) use CGI style prompts only`);
        }

        // Per-scene negative prompts — suppress wrong tone + anatomy artifacts
        const _negBase =
          "stock photo pose, studio lighting, CGI, airbrushed, oversaturated, " +
          "man facing backward, subject facing away from camera, back to camera, " +
          "extra limbs, extra fingers, extra arms, extra hands, mutated hands, deformed hands, " +
          "fused fingers, too many fingers, missing fingers, ugly hands, distorted limbs, " +
          "bad anatomy, extra legs, malformed limbs, three hands, two left hands, " +
          "overlapping limbs, fused bodies, merged torsos, anatomical errors";
        const _negEmotional = _isEmotional
          ? "premature smiling, overly joyful expression too early, laughing out loud, wrong orientation, generic romance without sadness"
          : "";
        const sceneNegativePrompts: string[] = enforcedPrompts.map((_, i) => {
          const pos     = _total > 1 ? i / (_total - 1) : 0;
          const sadGuard = (_isEmotional && pos <= 0.33) ? "smiling, happy expression, teeth showing, joyful face, laughing" : "";
          return [_negBase, _negEmotional, sadGuard, subjectEthnicityNegative].filter(Boolean).join(", ");
        });

        // Animated style: suppress photorealism + live-action with stronger terms
        if (_isAnimated) {
          const negAnim = "photorealistic, realistic humans, live action, real people, photograph, photo, human skin texture, detailed pores, realistic faces, 35mm film, documentary style, human actors, candid photography, stock photo, blurry, deformed, extra limbs, text, watermark, low quality, ugly, bad anatomy, 3d render artifacts";
          for (let i = 0; i < sceneNegativePrompts.length; i++) {
            sceneNegativePrompts[i] = negAnim; // replace entirely — animated negative is its own set
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

        const sourceImages: Array<string | null> = new Array(prompts.length).fill(null);
        const clipReports: string[] = [];

        console.log(`[MOTION_PROMPT] provider=kling-2.6-pro-multishot scenes=${enforcedPrompts.length}`);

        // Fire voiceover + ambient in parallel when narration text is provided
        const seqId = `seq-${user.id}-${Date.now()}`;
        const voiceoverPromise = voiceoverText
          ? elevenLabsVoiceover({
              text:    voiceoverText,
              voiceId,
              userId:  user.id,
              jobId:   seqId,
            }).catch(err => {
              console.warn("[cinematic-seq] voiceover failed (non-fatal):", err instanceof Error ? err.message : err);
              return { audioUrl: undefined as string | undefined, duration: plannedTotalSec };
            })
          : null;

        // Ambient sound — search all prompts + full script so keywords like "rain" are found
        // even when they appear in scene 2+ or only in the script description.
        const _ambientSearchText = [...prompts, script ?? "", goal ?? ""].filter(Boolean).join(" ");
        const ambientDesc = pickAmbientDescription(_ambientSearchText);
        const ambientPromise: Promise<Buffer | null> = ambientDesc
          ? generateAmbientSound(ambientDesc, plannedTotalSec)
              .catch(err => {
                console.warn("[cinematic-seq] ambient sound failed (non-fatal):", err instanceof Error ? err.message : err);
                return null;
              })
          : Promise.resolve(null);

        // ── Per-scene image assignment ────────────────────────────────────────────
        // Priority: body.sceneImages[] (all concept images from frontend) → imageUrl fallback
        const fallbackImageUrl: string | null = _isAnimated ? null : (imageUrl ?? null);
        let sceneImageUrls: Array<string | null> = new Array(prompts.length).fill(null);

        if (!_isAnimated && bodySceneImages.length > 0) {
          // Use images passed directly from the frontend (one per scene angle)
          for (let i = 0; i < prompts.length; i++) {
            sceneImageUrls[i] = bodySceneImages[i] ?? bodySceneImages[0] ?? null;
          }
          console.log(`[SCENE_IMAGES] using ${bodySceneImages.length} images from request body for ${prompts.length} scenes`);
        } else if (fallbackImageUrl) {
          // No per-scene images — use the single reference image for ALL scenes.
          // Kling 2.6 Pro runs i2v (image-to-video); without an image every scene fails with 422.
          for (let i = 0; i < prompts.length; i++) {
            sceneImageUrls[i] = fallbackImageUrl;
          }
          console.log(`[SCENE_IMAGES] no sceneImages body — using fallbackImageUrl for all ${prompts.length} scenes (i2v)`);
        } else {
          // No image at all — t2v mode (will fail with Kling i2v model; logged for visibility)
          console.warn(`[SCENE_IMAGES] WARNING: no imageUrl and no sceneImages — Kling i2v will fail all scenes`);
        }

        // Throw if any scene has no image (i2v requires image)
        const missingImages = sceneImageUrls.map((u, i) => u ? null : i).filter((i): i is number => i !== null);
        if (missingImages.length > 0 && bodySceneImages.length > 0) {
          console.warn(`[SCENE_IMAGES] missing images for scenes: ${missingImages.map(i => i + 1).join(", ")} — will run t2v for those scenes`);
        }

        // Capture first scene image as thumbnail for My Videos
        capturedThumbnailUrl = sceneImageUrls[0] ?? fallbackImageUrl;

        // ── 3 parallel Kling 2.6 Pro single-shot calls ───────────────────────────
        // Each scene gets its own image + unique prompt + unique seed.
        lastStageLogged = 'KLING_start';
        console.log(`[STAGE_8_KLING] start scenes=${prompts.length}`);
        console.log(`[TIMING] KLING_GENERATION start scenes=${prompts.length} mode=parallel`);
        const genT0   = Date.now();
        const baseSeed = Date.now() % 999_999_999;

        // Strip block-style ethnicity overrides — ethnicity is already inline via applySubjectEthnicityToPrompts
        // Prepend niche video prefix + detected era for period accuracy
        const MAX_KLING_PROMPT = 400;

        // Compact anchor: era + first 3 niche terms only (not a keyword dump)
        const nicheAnchor = nicheSettings.videoPromptPrefix
          ? nicheSettings.videoPromptPrefix.split(',').slice(0, 3).map((s: string) => s.trim()).join(', ')
          : '';
        const eraAnchor = detectedEra ? `${detectedEra}.` : '';
        const klingAnchor = [eraAnchor, nicheAnchor].filter(Boolean).join(' ');

        // ── Storyboard beats → script-specific Kling motion directions ────────
        // If beats were passed from scene-images response, use them.
        // Otherwise generate fresh beats from the script (graceful fallback to static directions).
        const FALLBACK_DIRECTIONS = [
          'Subject is rigid and absolutely still. Micro-movements only: shallow visible breathing, slight hand tremor, jaw locked tight. Camera holds low and steady, drifting slowly left.',
          'Subject lifts their head for the first time. Eyes move upward, throat visibly swallows, fingers slowly uncurl from their grip. One deliberate gesture breaking the stillness. Camera pushes steadily in from medium to tight on face.',
          'Subject stands with clear purpose. Reaches for an object deliberately, shoulders squaring. One decisive physical movement. Camera pulls back slowly to reveal the full surrounding environment.',
        ];

        // Use passed beats from scene-images when available; otherwise skip the Claude call
        // (analyzeScriptBeats is ~3s sequential before Kling fires — use FALLBACK_DIRECTIONS instead)
        const storyBeats: StoryBeat[] | null = passedStoryBeats ?? null;
        if (storyBeats) {
          console.log(`[STORYBOARD] using ${storyBeats.length} beats passed from scene-images`);
        } else {
          console.log(`[STORYBOARD] no beats passed — using FALLBACK_DIRECTIONS for Kling motion`);
        }

        const builtKlingPrompts: string[] = [];
        const klingScenePrompts = enforcedPrompts.map((_p, i) => {
          const beat = storyBeats?.[i];
          const direction = beat
            ? beatToKlingDirection(beat)
            : FALLBACK_DIRECTIONS[i % FALLBACK_DIRECTIONS.length];
          const final = [klingAnchor, direction].filter(Boolean).join(' ').slice(0, MAX_KLING_PROMPT);
          builtKlingPrompts.push(final);
          console.log(`[KLING_PROMPT_UNIQUE] scene=${i + 1}${beat ? ` beat="${beat.purpose}"` : ' (fallback)'}: ${final.substring(0, 200)}`);
          if (i > 0) {
            console.log(`[PROMPT_DIFF] scene=${i + 1} differs from scene 1: ${final !== builtKlingPrompts[0]}`);
          }
          return final;
        });

        const extractedUrls: Array<string | null> = new Array(prompts.length).fill(null);
        const slaFallbackIndices: number[] = [];

        await Promise.all(klingScenePrompts.map(async (klingPrompt, i) => {
          const sceneImg = sceneImageUrls[i];
          const mode = (sceneImg?.startsWith("https://")) ? "i2v" : "t2v";
          console.log(`[CLIP_FIRE] scene=${i + 1} mode=${mode} imageUrl=${sceneImg?.substring(0, 80) ?? "NONE"}`);

          try {
            const result = await generateKlingClip({
              prompt:          klingPrompt,
              negativePrompt:  sceneNegativePrompts[i] || undefined,
              imageUrl:        sceneImg?.startsWith("https://") ? sceneImg : undefined,
              duration:        KLING_CLIP_SECS,
              aspectRatio:     "9:16",
              mode:            "std",
              seed:            baseSeed + i,
              sceneNumber:     i + 1,
            });
            extractedUrls[i] = result.videoUrl;
            console.log(`[CLIP_RESULT] scene=${i + 1} success=true elapsed=${result.generationMs}ms url=${result.videoUrl.substring(0, 80)}`);
            clipReports.push(`scene=${i + 1} | kling-direct-v3-pro | OK ${result.generationMs}ms | ${result.videoUrl.substring(0, 80)}`);
          } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            const detail = JSON.stringify(err, Object.getOwnPropertyNames(err instanceof Error ? err : {})).substring(0, 300);
            console.error(`[CLIP_FAIL] scene=${i + 1} mode=${mode} reason="${reason}" detail=${detail}`);
            clipReports.push(`scene=${i + 1} | kling-2.6-pro | FAIL | ${reason}`);
          }
        }));

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

        const postT0     = Date.now();
        const actualCost = CREDIT_COSTS.video_cinematic;
        let stitched_url = clip_urls[0];
        let audio_url: string | undefined;

        // Await voiceover + ambient (both launched in parallel with clip generation)
        const ambientBuffer = await ambientPromise;
        if (ambientDesc && ambientBuffer) {
          console.log(`[AMBIENT] ready — "${ambientDesc.substring(0, 50)}" ${ambientBuffer.length}b`);
        }

        if (voiceoverPromise) {
          const voResult = await voiceoverPromise;
          audio_url = voResult.audioUrl;
          console.log(`[VOICE_RESULT] audio_url=${audio_url ? audio_url.substring(0, 80) : "MISSING — voiceover failed or text was empty"}`);
        } else {
          console.log(`[VOICE_RESULT] skipped — no voiceoverText provided`);
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
          console.log(`[AUDIO_MIX] skipped — no ambient sound matched for this scene`);
        }

        // ── Stitch clips + audio via Railway Composer ────────────────────────────
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
              signal:  AbortSignal.timeout(90_000),
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
                  console.log(`[RAILWAY_STITCH_OK] ${clip_urls.length} clips → ${stitched_url.substring(0, 80)}`);
                } else {
                  console.warn("[RAILWAY_STITCH] upload failed:", upErr.message);
                }
              }
            } else {
              // Railway returned HTTP error — fall back to FFmpeg stitch (all clips)
              const errText = await railwayRes.text().catch(() => "");
              console.warn(`[RAILWAY_STITCH] composer HTTP ${railwayRes.status}: ${errText.substring(0, 200)} — falling back to FFmpeg stitch`);
              try {
                stitched_url = await stitchClipsWithAudio({ clipUrls: clip_urls, audioUrl: finalAudioUrl, userId: user.id });
                console.log(`[FFMPEG_FALLBACK_OK] railway_error clips=${clip_urls.length} url=${stitched_url.substring(0, 80)}`);
              } catch (ffmpegErr) {
                console.error("[FFMPEG_FALLBACK] stitchClipsWithAudio failed:", ffmpegErr instanceof Error ? ffmpegErr.message : ffmpegErr);
              }
            }
          } catch (railwayErr) {
            // Network-level Railway failure — fall back to FFmpeg stitch (all clips)
            console.warn("[RAILWAY_STITCH] network error:", railwayErr instanceof Error ? railwayErr.message : railwayErr);
            try {
              stitched_url = await stitchClipsWithAudio({ clipUrls: clip_urls, audioUrl: finalAudioUrl, userId: user.id });
              console.log(`[FFMPEG_FALLBACK_OK] railway_network_err clips=${clip_urls.length} url=${stitched_url.substring(0, 80)}`);
            } catch (ffmpegErr) {
              console.error("[FFMPEG_FALLBACK] stitchClipsWithAudio failed:", ffmpegErr instanceof Error ? ffmpegErr.message : ffmpegErr);
            }
          }
        } else {
          console.log(`[RAILWAY_STITCH] skipped — composerUrl=${!!composerUrl} clips=${clip_urls.length}`);
          // FFmpeg fallback: concatenate ALL clips then merge audio (no looping)
          if (clip_urls.length > 0) {
            try {
              stitched_url = await stitchClipsWithAudio({
                clipUrls: clip_urls,
                audioUrl: finalAudioUrl,
                userId:   user.id,
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
            providers:           ["kling-v3"],
            motion_coverage:     motionCoverage,
            model_used:          "kling-2.6-pro",
            kling_scenes:        successfulClips,
            continuity_score:    continuityScore,
            skipped_scenes:      skippedScenes,
            sla_compliant:       slaCompliant,
            timing_breakdown: {
              total_ms:           totalMs,
              generation_ms:      genElapsed,
              post_processing_ms: postMs,
              scene_count:        prompts.length,
              provider_mix:       { kling: successfulClips },
              bottleneck_stage:   bottleneckStage,
            },
            timing_ms: { generation: genElapsed, total: totalMs },
          },
          actualCost,
        };
      },
    });

    // Auto-save to My Videos (fire-and-forget; failure is non-fatal)
    const payload = responsePayload as { clip_urls?: string[]; stitched_url?: string };
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
    // Awaited DB safety net — ensures slot is cleared even if process is about to exit
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
