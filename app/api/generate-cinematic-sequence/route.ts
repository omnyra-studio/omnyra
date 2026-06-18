import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { fal } from "@fal-ai/client";
import { elevenLabsVoiceover, mergeVideoAudio, generateAmbientSound, pickAmbientDescription } from "@/lib/services/elevenlabs";
import { mergeVideoWithAudio } from "@/lib/utils/merge-video-audio";
import { FORCE_SEEDANCE, getVideoProvider } from "@/lib/video-provider";
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
  saveNewReference,
  saveGeneratedClipAsReference,
  type CharacterMemory,
} from "@/lib/memory/character-memory";
import { batchScoreConsistency, scoreImagePair } from "@/lib/memory/consistency-scorer";
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
import { loadBrandMemory } from "@/lib/memory/brand-memory";
import { saveRenderToLibrary } from "@/lib/renders/save-render";
import {
  applySubjectEthnicityToPrompts,
  resolveSubjectEthnicity,
  type SubjectEthnicityInput,
} from "@/lib/subject-appearance";
import { parseJsonWithEthnicityFix } from "@/middleware/ethnicityFix";
import {
  buildBaseImagePrompt,
  buildSeedanceElevenLabsPrompt,
} from "@/lib/motion-prompt";


export const maxDuration = 300;

const CLIP_SECONDS = 6;   // 6s @ 720p saves credits; 5 clips = 30s total
const CLIP_COUNT   = 5;   // 5 × 6s = 30s
const ROUTE_VERSION = "2026-06-19-v16-seedance-fast-only-180s";

const FLUX_MODEL = "fal-ai/flux/schnell";

// ── SLA budget: Vercel maxDuration=300s; keep 30s for post-processing ─────────
const SLA_TOTAL_MS   = 270_000; // 270s total (30s margin before Vercel 300s kills)
const SLA_GEN_MS     = 240_000; // clip generation allocation — fal.ai needs ~200s/clip parallel
const SLA_POST_MS    =  30_000; // post-processing + continuity reserve
// Absolute deadline for generation to finish (30s reserved for post)
// Computed per-request as: routeT0 + SLA_TOTAL_MS - SLA_POST_MS

// ── Types ─────────────────────────────────────────────────────────────────────

type SceneProvider = "seedance";

/** SCENE_ROUTER — hard-forced ElevenLabs Seedance only. No fal.ai, no Kling, no smart_motion. */
function sceneRouter(_sceneType: string, _motionScore: number): SceneProvider {
  if (FORCE_SEEDANCE) {
    console.log("✅ FORCING SEEDANCE VIA ELEVENLABS ONLY");
  }
  void getVideoProvider();
  return "seedance";
}

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

// ── Image generation for smart_motion without a source image ─────────────────

const COUPLE_RE = /\b(couple|two people|both of them|together|partner|dancing with|walking with|holding hands|hand in hand|each other|lovers|husband|wife|boyfriend|girlfriend|fiancee?|spouse|relationship|romance|romantic)\b/i;

// Detect animated / cartoon / Disney / Pixar style requests from goal, script, or niche.
// When true: inject strong style directives and suppress photorealism negatives.
const ANIMATED_RE = /\b(disney|pixar|dreamworks|cartoon|animated|animation|3d animation|cgi cartoon|anime|storybook|princess peach|mario|luigi|bowser|zelda|kirby|pikachu|yoshi|donkey kong|abraham lincoln as cartoon|fictional character|comic book character|illustrated character|caricature)\b/i;

function detectAnimatedStyle(text: string): boolean {
  return ANIMATED_RE.test(text);
}

async function generateSceneImage(
  prompt:       string,
  isCouple:     boolean,
  sceneIndex?:  number,
  charRefUrl?:  string,  // when set: score after gen and retry once if score < 0.72
  charSuffix?:  string,  // prepended on retry to anchor character description
  ethnicityNegative?: string,
): Promise<string> {
  const isAnimated = detectAnimatedStyle(prompt);
  const label = sceneIndex !== undefined ? `scene=${sceneIndex + 1}` : "scene=?";

  // Anatomy guard — appended to every positive prompt
  const ANATOMY_GUARD =
    `perfect anatomy, correct number of limbs, two arms two legs, anatomically correct hands, ` +
    `five fingers per hand, natural hand pose, no extra limbs, no fused fingers, clean body proportions`;

  // Detect hand/object scenes for extra grip guidance
  const hasHandObject = /\b(coffee|mug|cup|glass|bottle|holding|gripping|handing|drink)\b/i.test(prompt);
  const handObjectGuard = hasHandObject
    ? `natural hand wrapped around object, correct finger count, realistic grip`
    : "";

  const baseNegative =
    `AI render, CGI, hyperrealistic skin, studio lighting, perfect symmetry, ` +
    `fitness model, airbrushed, chiseled, glowing skin, professional athlete, ` +
    `posed portrait, stock photo, fake smile, oversaturated, ` +
    `extra limbs, extra fingers, extra arms, extra hands, mutated hands, deformed hands, ` +
    `fused fingers, too many fingers, missing fingers, ugly hands, distorted limbs, ` +
    `bad anatomy, extra legs, malformed limbs, three hands, two left hands, ` +
    `anatomical errors, wrong body proportions`;

  const ethnicityGuard = ethnicityNegative ? `, ${ethnicityNegative}` : '';
  const coupleNegative = isCouple
    ? `single person, solo, one person, alone, missing person, partial person, cropped person, ` +
      `overlapping limbs, fused bodies, merged torsos, arm going through body, extra arm between people, ` +
      `${baseNegative}${ethnicityGuard}`
    : `${baseNegative}${ethnicityGuard}`;

  const buildPrompt = (corePrompt: string, attempt: number): string => {
    const anatomySuffix = [ANATOMY_GUARD, handObjectGuard].filter(Boolean).join(", ");
    if (isAnimated) {
      // For cartoon/animated characters: PREPEND strong CGI animation prefix so model reads it first
      const animStyle =
        "In vibrant Disney Pixar 3D animated style, colorful cartoon characters with big expressive eyes, " +
        "smooth CGI animation, stylized proportions, highly detailed 3D animated render, " +
        "cinematic studio lighting, animated film still";
      return `${animStyle}, ${corePrompt}, brand-safe, SFW`;
    }
    if (!isCouple) {
      return `${corePrompt}, ${anatomySuffix}, ` +
        `35mm candid photography, natural lighting, authentic unposed moment, ` +
        `real people, documentary style, shot on iPhone or DSLR, imperfect natural beauty, ` +
        `fully clothed subjects, brand-safe, SFW, no nudity`;
    }
    // Attempt 1: strong couple prefix on the original prompt
    if (attempt === 1) {
      return `Two people together, both fully visible in frame, couple side by side, ` +
        `clear separation between bodies, no overlapping limbs, correct arm positions, ` +
        `${corePrompt}, two people in shot, ${anatomySuffix}, ` +
        `35mm candid photography, natural lighting, authentic unposed moment, ` +
        `real people, documentary style, shot on iPhone or DSLR, imperfect natural beauty, ` +
        `fully clothed subjects, brand-safe, SFW, no nudity`;
    }
    // Attempt 2: override with maximum-specificity couple prompt
    return `A couple, two people standing together, both people fully visible from head to toe, ` +
      `clear physical separation between their bodies, each person has exactly two arms, ` +
      `${corePrompt}, couple side by side both in frame, ${anatomySuffix}, ` +
      `35mm candid photography, natural lighting, authentic unposed moment, ` +
      `real people, documentary style, shot on iPhone or DSLR, ` +
      `fully clothed subjects, brand-safe, SFW, no nudity`;
  };

  const callFlux = async (attempt: number): Promise<string> => {
    const safePrompt = buildPrompt(buildBaseImagePrompt(prompt), attempt);
    console.log(`[FLUX_ATTEMPT] ${label} attempt=${attempt} isCouple=${isCouple} prompt="${safePrompt.substring(0, 120)}"`);
    const result = await (fal as any).subscribe(FLUX_MODEL, {
      input: {
        prompt:                safePrompt,
        negative_prompt:       coupleNegative,
        image_size:            { width: 720, height: 1280 },
        num_inference_steps:   4,
        num_images:            1,
        enable_safety_checker: true,
      },
      logs: false,
    });
    const url: string | undefined =
      (result as any)?.images?.[0]?.url ??
      (result as any)?.data?.images?.[0]?.url;
    if (!url) throw new Error("FLUX: no image URL returned");
    console.log(`[FLUX_DONE] ${label} attempt=${attempt} url=${url.substring(0, 60)}`);
    return url;
  };

  let url: string;
  try {
    url = await callFlux(1);
  } catch (err) {
    if (!isCouple) throw err;
    console.warn(`[FLUX_RETRY] ${label} attempt=1 failed — retrying with explicit couple prompt: ${(err as Error).message}`);
    url = await callFlux(2);
  }

  // Character consistency retry.
  // When a character reference URL is provided, score the generated image against it.
  // On score < 0.72: regenerate once with the character description prepended to the prompt.
  if (charRefUrl) {
    try {
      const score = await scoreImagePair(url, charRefUrl);
      if (score !== null) {
        console.log(`[CHAR_CONSISTENCY_GATE] ${label} score=${score.toFixed(2)} retry=${score < 0.72}`);
        if (score < 0.72 && charSuffix) {
          const charAnchoredPrompt = `${charSuffix}, ${prompt}`;
          const retryR = await (fal as any).subscribe(FLUX_MODEL, {
            input: {
              prompt:                isAnimated
                ? `In vibrant Disney Pixar 3D animated style, colorful cartoon character, big expressive eyes, smooth CGI animation, ${charAnchoredPrompt}, highly detailed 3D render, SFW`
                : isCouple
                  ? `Two people together, both fully visible in frame, clear separation between bodies, no overlapping limbs, ${charAnchoredPrompt}, perfect anatomy, correct number of limbs, 35mm candid photography, natural lighting, real people, fully clothed, SFW`
                  : `${charAnchoredPrompt}, perfect anatomy, correct number of limbs, anatomically correct hands, five fingers per hand, 35mm candid photography, natural lighting, authentic unposed moment, real people, fully clothed, SFW`,
              negative_prompt:       isAnimated
                ? "photorealistic, realistic humans, live action, real people, photograph, photo, human skin texture, detailed pores, realistic faces"
                : coupleNegative,
              image_size:            { width: 720, height: 1280 },
              num_inference_steps:   4,
              num_images:            1,
              enable_safety_checker: true,
            },
            logs: false,
          });
          const retryUrl: string | undefined =
            (retryR as any)?.images?.[0]?.url ?? (retryR as any)?.data?.images?.[0]?.url;
          if (retryUrl) {
            const retryScore = await scoreImagePair(retryUrl, charRefUrl).catch(() => null);
            console.log(`[CHAR_CONSISTENCY_RETRY] ${label} retry score=${retryScore?.toFixed(2) ?? "?"} (was ${score.toFixed(2)})`);
            if (retryScore !== null && retryScore > score) return retryUrl;
          }
        }
      }
    } catch {
      // consistency gating is non-fatal
    }
  }

  return url;
}

// ── Clip generators ───────────────────────────────────────────────────────────

const ETHNICITY_PREFIX_RE = /^\[(?:MANDATORY ETHNICITY OVERRIDE|ETHNICITY DEFAULT RULE)[^\]]*\][\s\S]*?\n\n/i;

function stripEthnicityPrefix(text: string): string {
  return text.replace(ETHNICITY_PREFIX_RE, "").trim();
}

async function generateSeedanceClip(
  prompt: string,
  imageUrl: string | null,
  duration: "5" | "6" | "10",
  label: string,
  clipReports: string[],
): Promise<string | null> {
  const cleanPrompt = stripEthnicityPrefix(prompt);
  const motionPrompt = buildSeedanceElevenLabsPrompt(cleanPrompt);

  try {
    const { falLumaGenerate } = await import("@/lib/providers/luma");
    const result = await falLumaGenerate({
      prompt:   motionPrompt,
      imageUrl: imageUrl?.startsWith("https://") ? imageUrl : null,
      duration: 5,
      resolution: "720p",
      aspectRatio: "9:16",
    });
    clipReports.push(`${label} | luma-ray2 | OK ${result.latencyMs}ms | ${result.videoUrl.substring(0, 80)}`);
    return result.videoUrl;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    clipReports.push(`${label} | luma-ray2 | FAIL | ${detail}`);
    console.error(`${label} Luma Ray 2 FAILED: ${detail}`);
    throw err;
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

type ProviderTier = "seedance";

async function executeClip(
  prompt:         string,
  imageUrl:       string | null,
  duration:       "5" | "6" | "10",
  provider:       ProviderTier,
  sceneType:      string,
  index:          number,
  userId:         string,
  rawSeconds:     number,
  sourceImages:   Array<string | null>,
  clipReports:    string[],
  budgetMs:       number,
  label:          string,
  isCouple:       boolean,
  negativePrompt?: string,
  charRefUrl?:    string,
  charSuffix?:    string,
  ethnicityNegative?: string,
): Promise<string> {
  const render = async (): Promise<string | null> =>
    generateSeedanceClip(prompt, imageUrl, duration, label, clipReports);

  // Seedance only — no Kling / smart_motion fallback
  const queue: ProviderTier[] = ["seedance", "seedance"];

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

    const url = await withSlaDeadline(render(), remainingMs, label);
    if (url) return url;

    if (i === 0) console.warn(`${label} attempt-1 null — retrying Seedance`);
    if (i === 1) console.warn(`${label} attempt-2 null — final Seedance retry`);
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

  console.log(`[PLAN_GATE] user=${user.id} provider=seedance-fal-fast FORCE_SEEDANCE=${FORCE_SEEDANCE}`);

  const falKey = process.env.FAL_API_KEY ?? process.env.FAL_KEY ?? process.env.FALAI_API_KEY;
  if (!falKey) {
    return Response.json({ error: "FAL_API_KEY not configured — required for Seedance Fast video" }, { status: 500 });
  }
  fal.config({ credentials: falKey });

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
  try {
    const body = await parseJsonWithEthnicityFix<{
      prompts?: string[];
      imageUrl?: string | null;
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
    }>(req);
    subjectEthnicity = body.subjectEthnicity ?? 'caucasian';
    const rawVoiceover = body.voiceoverText?.trim() || body.script?.trim() || "";
    // Strip stage directions, scene headers, and action lines before TTS
    voiceoverText = rawVoiceover
      .replace(/\[SCENE:[^\]]*\]/gi, "")
      .replace(/\[CUT TO[^\]]*\]/gi, "")
      .replace(/\[.*?\]/g, "")
      .replace(/\(.*?\)/g, "")
      .replace(/^\s*#.*$/gm, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim() || undefined;
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
    console.log(`[BRIEF_CONTEXT] goal="${(goal ?? "").substring(0, 120)}" characterId=${characterId ?? "none"} niche=${niche ?? "none"} ethnicity=${subjectEthnicity}`)
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
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
  // Estimate conservatively (all Seedance); credit_commit_atomic refunds the difference.
  const estimatedCost = videoCreditCost(prompts.length, 0);

  try {
    const responsePayload = await withCreditState<Record<string, unknown>>({
      userId: user.id,
      cost:   estimatedCost,
      run:    async () => {
        // ── Guardrail (throw on rejection → auto-rollback) ────────────────────
        {
          const guardrail = applyGenerationGuardrail({ sceneCount: prompts.length, modelTier: "seedance_elevenlabs", validationPasses: 1 });
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
        // ElevenLabs Seedance: 6s @ 720p is the credit-optimal sweet spot.
        // Snap to 5 only if caller explicitly requested ≤5s; otherwise use 6.
        const duration   = rawSeconds <= 5 ? "5" : "6";
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

        const resolvedSceneTypes: string[] = prompts.map((prompt, i) =>
          sceneTypes?.[i] ?? inferSceneType(prompt),
        );
        const resolvedMotionScores: number[] = prompts.map((prompt, i) =>
          computeMotionIntensity(prompt, resolvedSceneTypes[i]),
        );

        console.log(" FORCING SEEDANCE VIA ELEVENLABS");
        const finalProviders: SceneProvider[] = prompts.map((prompt, i) =>
          sceneRouter(resolvedSceneTypes[i], resolvedMotionScores[i]),
        );
        const seedanceCount = finalProviders.length;
        const smCount = 0;

        // SLA escalation
        const estimatedGenMs   = 45_000 + seedanceCount * 12_000;
        const elapsedBeforeGen = Date.now() - routeT0;
        const genBudgetMs      = SLA_TOTAL_MS - elapsedBeforeGen - SLA_POST_MS;
        if (estimatedGenMs > genBudgetMs * 0.8 && seedanceCount > 2) {
          console.warn(`[SLA_ESCALATION] estimatedGen=${estimatedGenMs}ms genBudget=${genBudgetMs}ms — all ${seedanceCount} clips still use Seedance (no fallback)`);
        }

        if (isQuickMode) {
          console.log(`[QUICK_MODE] using Seedance (default provider) clips=${finalProviders.length}`);
        }
        console.log(`[SCENE_ROUTER] scenes=${prompts.length} seedance=${seedanceCount} smart_motion=${smCount} FORCE_SEEDANCE=${FORCE_SEEDANCE} estimatedGen=${estimatedGenMs}ms`);
        console.log(`[PROVIDER_USAGE] { seedanceScenes: ${seedanceCount}, smartMotionScenes: ${smCount} }`);

        // ── Visual Continuity: extract bibles + inject enforcement suffixes ────
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

        try {
          bibles = await extractBibles(enforcedPrompts, script);
          if (bibles.hasCharacter || bibles.environment) {
            const charPrefix = buildCharacterPrefix(bibles);
            const envSuffix  = buildConsistencySuffix(bibles);
            if (charPrefix || envSuffix) {
              enforcedPrompts = enforcedPrompts.map(p => charPrefix + p + envSuffix);
              console.log(`[CONTINUITY] bible_extracted hasCharacter=${bibles.hasCharacter} prefix_len=${charPrefix.length} suffix_len=${envSuffix.length}`);
            }
          }
        } catch (err) {
          console.warn("[CONTINUITY] bible extraction failed (non-fatal):", err instanceof Error ? err.message : err);
        }

        // Character memory injection — stacks on top of continuity bibles
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

        // ── Animated / cartoon style enforcement ──────────────────────────────
        // Include niche in detection so "Animation" niche always triggers animated style
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

        if (!_isAnimated) {
          // Live-action: add front-facing camera rule + emotional arc
          enforcedPrompts = enforcedPrompts.map((p, i) => {
            const pLow    = p.toLowerCase();
            const isBeach = /\b(beach|shore|ocean|sand|wave|water|sea)\b/.test(pLow);
            const isSad   = /\b(sad|cry|tear|lonely|ache|pain|grief)\b/.test(pLow);
            const isDance = /\b(danc|sway|spin|twirl|embrac|hold|pull)\b/.test(pLow);

            const cameraRule = "subjects facing camera, front-facing, faces clearly visible";
            const facingNote = _isCoupleCtx ? ", man facing toward woman, correct orientation, proper eye line, both faces visible" : `, ${cameraRule}`;

            if (!_isEmotional) {
              console.log(`[PROMPT_ARC] scene=${i + 1} no emotional arc detected — camera rule only`);
              return `${p}${facingNote}`;
            }

            const lighting = isBeach
              ? "golden hour lighting, warm backlighting, soft rim light on hair and shoulders, wet sand reflections, atmospheric ocean haze, warm sky gradient, cinematic anamorphic lens"
              : "soft cinematic lighting, warm key light, gentle fill light, emotional mood lighting, shallow depth of field";

            const pos = _total > 1 ? i / (_total - 1) : 0;
            let arcBeat: string;
            if (pos <= 0.33) {
              arcBeat = isSad
                ? "visible tear on cheek, head slightly down, quiet sadness and vulnerability, no smiling yet"
                : "opening beat, character settling into scene, subdued expression, quiet introspective moment";
            } else if (pos <= 0.66) {
              // Only introduce a second person / relationship beat when the brief explicitly has a couple.
              // Injecting "man approaching" for a solo scene creates a completely fabricated narrative.
              arcBeat = _isCoupleCtx
                ? "man gently approaching from the side, turning to face her, opening arms, beginning to pull her close, transition moment"
                : isSad
                  ? "posture shifting slightly, jaw unclenching, eyes lifting, quiet internal change, still alone in the same setting"
                  : "middle beat, subtle posture adjustment, gaze moving across scene, micro-expression shift, same setting";
            } else {
              // Resolution beat — again, lean-in / dance only fires for couple context
              arcBeat = _isCoupleCtx
                ? (isDance
                    ? "tender slow dance in shallow water, woman softening, gentle smile through remaining tears, intimate comfort and connection"
                    : "resolution moment, woman leaning into him, soft smile through tears, warmth and relief replacing sadness")
                : isSad
                  ? "quiet resolution, shoulders releasing tension, faint upward curve of lip corners, still alone, internal stillness returning"
                  : "closing beat, expression softening, settled into the scene, moment of quiet stillness, same setting unchanged";
            }

            console.log(`[PROMPT_ARC] scene=${i + 1}/${_total} pos=${pos.toFixed(2)} beach=${isBeach} arc="${arcBeat.substring(0, 60)}"`);
            return `${p}, ${lighting}, ${arcBeat}${facingNote}`;
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

        // Extend with brand-specific negative style terms
        if (brandMemory?.negativeStyleSuffix) {
          for (let i = 0; i < sceneNegativePrompts.length; i++) {
            sceneNegativePrompts[i] = [sceneNegativePrompts[i], brandMemory.negativeStyleSuffix].filter(Boolean).join(", ");
          }
          console.log(`[BRAND_NEG] extended ${sceneNegativePrompts.length} scene neg prompts with brand negative terms`);
        }

        const sourceImages: Array<string | null> = new Array(prompts.length).fill(null);
        const clipReports: string[] = [];

        console.log(`[MOTION_PROMPT] seedance motion=maximum scenes=${enforcedPrompts.length}`);

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
              return { audioUrl: undefined as string | undefined, duration: prompts.length * Number(duration) };
            })
          : null;

        // Ambient sound — pick description from first scene prompt, generate in parallel
        const ambientDesc = pickAmbientDescription(prompts[0] ?? "");
        const ambientPromise: Promise<Buffer | null> = ambientDesc
          ? generateAmbientSound(ambientDesc, prompts.length * Number(duration))
              .catch(err => {
                console.warn("[cinematic-seq] ambient sound failed (non-fatal):", err instanceof Error ? err.message : err);
                return null;
              })
          : Promise.resolve(null);

        // ── Parallel clip generation ───────────────────────────────────────────
        // All clips fire simultaneously — cuts wall time from 3× to 1× clip latency.
        // For animated style, no source image is needed. For live-action, all clips
        // use the same base imageUrl (no sequential last-frame chaining).
        console.log(`[TIMING] CLIP_GENERATION start clips=${prompts.length} mode=parallel`);
        const genT0 = Date.now();
        const genDeadlineAt = routeT0 + SLA_TOTAL_MS - SLA_POST_MS;

        const extractedUrls: Array<string | null> = new Array(prompts.length).fill(null);
        const slaFallbackIndices: number[] = [];

        const baseImageUrl: string | null = _isAnimated ? null : (imageUrl ?? null);
        const charCharRefUrl = charMemory ? (imageUrl ?? charMemory.ref_frame_url ?? undefined) : undefined;
        const charSuffix     = charMemory ? buildKlingCharacterSuffix(charMemory) : undefined;

        await Promise.all(enforcedPrompts.map(async (prompt, i) => {
          const clipT0      = Date.now();
          const provider    = finalProviders[i] as ProviderTier;
          const sceneType   = resolvedSceneTypes[i];
          const motionScore = resolvedMotionScores[i];
          const label       = `[clip ${i + 1}/${prompts.length}][${provider}]`;
          const clipBudget  = genDeadlineAt - clipT0;

          console.log(`${label} sceneType=${sceneType} motion=${motionScore.toFixed(2)} slaMs=${clipBudget} prompt="${prompts[i].substring(0, 80)}"`);
          console.log(`[SCENE_ROUTER] scene=${i + 1} provider=${provider} sceneType=${sceneType} motion=${motionScore.toFixed(2)}`);

          const isCouple = !_isAnimated && (COUPLE_RE.test(goal ?? "") || COUPLE_RE.test(script ?? "") || COUPLE_RE.test(prompt));

          try {
            const url = await executeClip(
              prompt, baseImageUrl, duration, provider,
              sceneType, i, user.id, rawSeconds, sourceImages, clipReports,
              clipBudget, label, isCouple, sceneNegativePrompts[i],
              _isAnimated ? undefined : charCharRefUrl,
              _isAnimated ? undefined : charSuffix,
              subjectEthnicityNegative || undefined,
            );

            const elapsed = Date.now() - clipT0;
            console.log(`${label} DONE elapsed=${elapsed}ms url=${url.substring(0, 60)}`);
            extractedUrls[i] = url;
          } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            if (reason === "skipped_due_to_latency" || reason === "SCENE_BUDGET_EXCEEDED") {
              console.warn(`[SLA] scene ${i + 1} ${reason} — will pad (no smart_motion fallback)`);
              slaFallbackIndices.push(i);
            } else {
              console.error(`[cinematic-sequence] clip ${i + 1} failed:`, reason);
            }
          }
        }));

        const genElapsed = Date.now() - genT0;
        console.log(`[TIMING] CLIP_GENERATION complete ${genElapsed}ms`);

        // ── Pass 2: pad remaining nulls with nearest successful clip ──────────
        let lastGoodUrl: string | null = null;
        let lastGoodIdx = -1;
        for (let pi = 0; pi < extractedUrls.length; pi++) {
          if (extractedUrls[pi]) { lastGoodUrl = extractedUrls[pi]; lastGoodIdx = pi; }
          else if (lastGoodUrl)  { console.warn(`[PAD_CLIP] scene=${pi + 1} padded from scene=${lastGoodIdx + 1} url=${lastGoodUrl.substring(0, 60)}`); extractedUrls[pi] = lastGoodUrl; }
        }
        const firstGoodIdx  = extractedUrls.findIndex(u => u !== null);
        const firstGoodUrl  = firstGoodIdx >= 0 ? extractedUrls[firstGoodIdx] : null;
        if (firstGoodUrl) {
          for (let pi = 0; pi < extractedUrls.length; pi++) {
            if (!extractedUrls[pi]) { console.warn(`[PAD_CLIP] scene=${pi + 1} padded from scene=${firstGoodIdx + 1} (leading failure) url=${firstGoodUrl.substring(0, 60)}`); extractedUrls[pi] = firstGoodUrl; }
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
        console.log(`[RENDER_BREAKDOWN] { seedanceScenes: ${seedanceCount}, smartMotionScenes: ${smCount}, genMs: ${genElapsed} }`);
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

        // Score + save first good Flux source image as character reference (fire-and-forget)
        if (characterId && charMemory) {
          const firstSourceImage = sourceImages.find(u => u !== null);
          if (firstSourceImage) {
            void batchScoreConsistency([firstSourceImage], characterId, user.id)
              .then(async result => {
                const score = result?.score ?? 0.75;
                console.log(`[CONSISTENCY] charId=${characterId} score=${score.toFixed(2)} shouldRetry=${result?.shouldRetry ?? false}`);
                const ref = await saveGeneratedClipAsReference(characterId, user.id, firstSourceImage, score);
                if (ref) console.log(`[CHAR_REF_SAVE] saved id=${ref.id} score=${score.toFixed(2)}`);
              })
              .catch(e => console.warn("[CONSISTENCY/SAVE] failed (non-fatal):", e instanceof Error ? e.message : e));
          }
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

        const actualCost   = videoCreditCost(seedanceCount, smCount);
        let stitched_url = clip_urls[0];
        let audio_url: string | undefined;

        // Await voiceover + ambient (both launched in parallel with clip gen)
        const ambientBuffer = await ambientPromise;
        if (ambientDesc && ambientBuffer) {
          console.log(`[AMBIENT] ready — "${ambientDesc.substring(0, 50)}" ${ambientBuffer.length}b`);
        }

        if (voiceoverPromise) {
          const voResult = await voiceoverPromise;
          audio_url = voResult.audioUrl;
        }

        // ── Stitch clips + voiceover via Railway Composer ───────────────────────
        // Railway handles FFmpeg concat + audio mix so Vercel's serverless isn't
        // doing heavy media processing within the 300s timeout.
        const composerUrl = process.env.COMPOSER_SERVICE_URL;
        const composerKey = process.env.COMPOSER_API_KEY ?? "";
        if (composerUrl && audio_url && clip_urls.length > 0) {
          console.log(`[RAILWAY_STITCH] clips=${clip_urls.length} hasVoice=${!!audio_url} hasAmbient=${!!ambientBuffer}`);
          try {
            // Download clips + voiceover in parallel
            const fetchBuf = async (url: string, label: string) => {
              const r = await fetch(url, { cache: "no-store" });
              if (!r.ok) throw new Error(`${label} HTTP ${r.status}`);
              return Buffer.from(await r.arrayBuffer());
            };
            const [clipBuffers, voiceBuffer] = await Promise.all([
              Promise.all(clip_urls.map((url, i) => fetchBuf(url, `clip${i + 1}`))),
              fetchBuf(audio_url, "voiceover"),
            ]);

            const form = new FormData();
            for (let i = 0; i < clipBuffers.length; i++) {
              form.append("clips", new Blob([clipBuffers[i]], { type: "video/mp4" }), `clip_${i}.mp4`);
            }
            form.append("voiceover", new Blob([voiceBuffer], { type: "audio/mpeg" }), "voiceover.mp3");
            form.append("shot_plan", JSON.stringify({
              shots: clip_urls.map(() => ({
                duration:            Number(duration),
                energy_curve:        "sustain",
                transition_in:       "hard_cut",
                transition_after:    null,
                transition_duration: 0,
                zoom_effect:         false,
              })),
            }));

            const railwayRes = await fetch(composerUrl, {
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
                // Download Railway output, upload to renders bucket
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
              const errText = await railwayRes.text().catch(() => "");
              console.warn(`[RAILWAY_STITCH] composer HTTP ${railwayRes.status}: ${errText.substring(0, 200)}`);
            }
          } catch (railwayErr) {
            console.warn("[RAILWAY_STITCH] failed (non-fatal — returning first clip):", railwayErr instanceof Error ? railwayErr.message : railwayErr);
          }
        } else {
          console.log(`[RAILWAY_STITCH] skipped — composerUrl=${!!composerUrl} hasVoice=${!!audio_url} clips=${clip_urls.length}`);
        }

        const totalMs      = Date.now() - routeT0;
        const postMs       = Date.now() - postT0;

        const bottleneckStage = genElapsed > SLA_GEN_MS * 0.85   ? "generation"
          : postMs > (SLA_POST_MS * 0.85)                         ? "post_processing"
          : "nominal";

        const skippedScenes = slaFallbackIndices;
        const slaCompliant = skippedScenes.length === 0 && totalMs <= SLA_TOTAL_MS;

        console.log(`[TIMING] SEQUENCE TOTAL ${totalMs}ms clips=${clip_urls.length} seedance=${seedanceCount} smart_motion=${smCount} sla=${slaCompliant ? "OK" : "BREACH"} bottleneck=${bottleneckStage}`);

        return {
          data: {
            success:             true,
            videoUrl:            stitched_url,
            modelUsed:           "seedance-elevenlabs",
            model:               "seedance-elevenlabs",
            hasMotion:           true,
            hasAudio:            !!voiceoverText && !!audio_url,
            duration:            prompts.length * Number(duration),
            stitched_url,
            audio_url:           audio_url ?? null,
            clip_urls,
            source_images:       sourceImages.filter((u): u is string => u !== null),
            clips_generated:     clip_urls.length,
            clip_duration:       Number(duration),
            total_duration:      clip_urls.length * Number(duration),
            providers:           finalProviders,
            motion_coverage:     motionCoverage,
            seedance_scenes:     seedanceCount,
            model_used:          "seedance-elevenlabs",
            kling_scenes:        0,
            smart_motion_scenes: smCount,
            continuity_score:    continuityScore,
            skipped_scenes:      skippedScenes,
            sla_compliant:       slaCompliant,
            timing_breakdown: {
              total_ms:           totalMs,
              generation_ms:      genElapsed,
              post_processing_ms: postMs,
              scene_count:        prompts.length,
              provider_mix:       { seedance: seedanceCount, smart_motion: smCount },
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
        userId:   user.id,
        videoUrl: saveUrl,
        template: "cinematic-sequence",
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
    console.error("[CINEMATIC_ERROR]", msg);
    return Response.json({
      success: false,
      error:   "Video generation failed",
      message: msg,
      SEQUENCE_ROUTE_VERSION: ROUTE_VERSION,
    }, { status: 500 });

  } finally {
    releaseVideoSlot(user.id);
  }
}
