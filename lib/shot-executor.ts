/**
 * Shot Executor — dispatches a single ShotPacket to the correct render API.
 *
 * PATH A — avatar + user has HeyGen avatar ID:
 *   → HeyGen talking head, scene_image_url as background
 *
 * PATH B — avatar without HeyGen avatar (or any non-avatar shot):
 *   → fal.ai Kling image-to-video; scene_image_url is the entire frame
 *
 * text_overlay — fal.ai Flux still-image card held for duration
 *
 * All paths retry once on failure before returning null.
 */

import { fal } from "@fal-ai/client";
import type { ShotPacket } from "./types/shot";
import { extractVideoUrl } from "./video-models";

// ── fal.ai config ─────────────────────────────────────────────────────────────

fal.config({ credentials: process.env.FAL_API_KEY });

// ── Public types ──────────────────────────────────────────────────────────────

export interface ShotAssets {
  heygenAvatarId?: string | null;         // HeyGen avatar ID created from the reference video
  avatarReferenceVideoUrl?: string | null; // public URL of the uploaded reference video
  voiceId?: string;
  voiceText?: string;                      // spoken words for this shot
}

export interface ShotExecutionResult {
  videoUrl: string;
  duration: number;
}

// ── HeyGen ────────────────────────────────────────────────────────────────────

const HEYGEN_BASE = "https://api.heygen.com";

/**
 * Maps a shot's attention function to a HeyGen avatar emotion.
 * HeyGen v2 supports: excited, friendly, serious, soothing, broadcaster
 */
function attentionToEmotion(
  fn: ShotPacket["attention_function"],
): string {
  const map: Record<ShotPacket["attention_function"], string> = {
    pattern_interrupt:   "excited",
    curiosity_spike:     "friendly",
    trust_grounding:     "serious",
    tension_escalation:  "broadcaster",
    emotional_release:   "soothing",
    desire_activation:   "friendly",
    urgency_trigger:     "excited",
    pacing_reset:        "soothing",
  };
  return map[fn] ?? "friendly";
}

/**
 * Maps a shot's camera_behavior to a HeyGen zoom_pattern.
 */
function cameraToZoom(behavior: ShotPacket["camera_behavior"]): string {
  const map: Partial<Record<ShotPacket["camera_behavior"], string>> = {
    slow_push_in: "slow_push_in",
    dolly_in:     "zoom_in",
    static:       "static",
    crane_up:     "zoom_in",
    dolly_out:    "zoom_out",
  } as Record<string, string>;
  return (map as Record<string, string>)[behavior] ?? "slow_push_in";
}

async function submitHeyGen(
  shot: ShotPacket,
  assets: ShotAssets,
): Promise<string> {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) throw new Error("HEYGEN_API_KEY not set");

  const text = (assets.voiceText ?? "").slice(0, 1500) || "...";

  const res = await fetch(`${HEYGEN_BASE}/v2/video/generate`, {
    method: "POST",
    headers: {
      "X-Api-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      video_inputs: [
        {
          character: {
            type: "avatar",
            avatar_id: assets.heygenAvatarId!,
            avatar_style: "normal",
            // Motion forcing — maps AVATAR_MOTION constants to HeyGen fields
            motion_config: {
              idle_motion: "micro_movements",
              zoom_pattern: cameraToZoom(shot.camera_behavior),
              gesture_intensity: shot.motion_intensity,
              emotion: attentionToEmotion(shot.attention_function),
              motion_extraction: {
                capture_micro_expressions: true,
                capture_gestures: true,
                motion_variance: 0.7,
              },
            },
          },
          voice: {
            type: "text",
            input_text: text,
            voice_id: assets.voiceId ?? "2d5b0e6cf36f460aa7fc47e3eee4ba54",
            speed: 1.08,
          },
          background: shot.scene_image_url
            ? { type: "image", url: shot.scene_image_url }
            : { type: "color", value: "#0a0a0a" },
        },
      ],
      dimension: { width: 1080, height: 1920 },
      aspect_ratio: "9:16",
    }),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    throw new Error(data.error?.message ?? `HeyGen API error ${res.status}`);
  }

  const videoId: string = data.data?.video_id;
  if (!videoId) throw new Error("HeyGen returned no video_id");
  return videoId;
}

async function pollHeyGen(
  videoId: string,
  timeoutMs = 180_000,
): Promise<string> {
  const apiKey = process.env.HEYGEN_API_KEY!;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    await sleep(4000);

    const res = await fetch(
      `${HEYGEN_BASE}/v1/video_status.get?video_id=${videoId}`,
      { headers: { "X-Api-Key": apiKey } },
    );
    const data = await res.json();
    const status: string = data.data?.status;

    if (status === "completed") {
      const url = data.data?.video_url as string | undefined;
      if (!url) throw new Error("HeyGen completed but returned no video_url");
      return url;
    }

    if (status === "failed") {
      throw new Error(`HeyGen render failed: ${data.data?.error ?? "unknown"}`);
    }
  }

  throw new Error(`HeyGen timed out after ${timeoutMs / 1000}s (video_id: ${videoId})`);
}

async function executeHeyGenShot(
  shot: ShotPacket,
  assets: ShotAssets,
): Promise<ShotExecutionResult> {
  const videoId = await submitHeyGen(shot, assets);
  const videoUrl = await pollHeyGen(videoId);
  return { videoUrl, duration: shot.duration_seconds };
}

// ── fal.ai ────────────────────────────────────────────────────────────────────

// Seedance 2 — primary model for both text-to-video and image-to-video
export const SEEDANCE_T2V_MODEL = "fal-ai/kling-video/v1.6/standard/text-to-video";
export const SEEDANCE_I2V_MODEL = "fal-ai/kling-video/v1.6/standard/image-to-video";
// Kling v3 Pro — fallback for image-to-video if Seedance 2 fails
export const KLING_I2V_MODEL    = "fal-ai/kling-video/v1.6/standard/image-to-video";

/**
 * Injects camera direction into the visual prompt so fal models follow it.
 */
export function augmentPrompt(shot: ShotPacket): string {
  const cameraDirections: Record<ShotPacket["camera_behavior"], string> = {
    static:         "static locked-off camera",
    slow_push_in:   "slow push-in dolly move toward subject",
    dolly_in:       "dolly-in camera moving forward",
    handheld_drift: "subtle handheld camera drift, organic motion",
    crane_up:       "crane up — camera rising vertically",
    whip_pan:       "fast whip-pan left to right",
    orbital_slow:   "slow orbital 180° camera move around subject",
  };

  const framingNotes: Record<ShotPacket["framing"], string> = {
    extreme_closeup: "extreme close-up, macro",
    closeup:         "close-up",
    medium_closeup:  "medium close-up",
    medium:          "medium shot",
    wide:            "wide shot",
  };

  return [
    shot.visual_prompt,
    `Camera: ${cameraDirections[shot.camera_behavior]}.`,
    `Framing: ${framingNotes[shot.framing]}.`,
    `Motion intensity: ${shot.motion_intensity}.`,
    "Aspect ratio: 9:16. Cinematic quality.",
  ].join(" ");
}

// Seedance 2 accepts integers 5–10 only. Clamp hard — passing 4 or 11+ causes API errors.
export function seedanceDuration(seconds: number): string {
  return String(Math.max(5, Math.min(10, Math.round(seconds || 5))));
}

// Re-exported for callers that imported extractVideoUrl from this module.
export { extractVideoUrl };

async function executeFalShot(shot: ShotPacket): Promise<ShotExecutionResult> {
  const prompt = augmentPrompt(shot);
  const duration = seedanceDuration(shot.duration_seconds);

  if (!shot.scene_image_url) {
    // PATH: text-to-video — no scene image, use Seedance 2
    const input = { prompt, duration, aspect_ratio: "9:16", generate_audio: false };
    console.log(`[Shot ${shot.shot_number}] model=${SEEDANCE_T2V_MODEL}`, JSON.stringify(input));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await (fal as any).subscribe(SEEDANCE_T2V_MODEL, {
      input,
      logs: false,
      pollInterval: 5000,
    });

    const videoUrl = extractVideoUrl(result);
    if (!videoUrl) throw new Error(`${SEEDANCE_T2V_MODEL} returned no video URL`);
    return { videoUrl, duration: shot.duration_seconds };
  }

  // PATH: image-to-video — try Seedance 2 first, fall back to Kling v3
  const i2vInput = {
    prompt,
    image_url: shot.scene_image_url,
    duration,
    aspect_ratio: "9:16",
    generate_audio: false,
  };
  console.log(
    `[Shot ${shot.shot_number}] model=${SEEDANCE_I2V_MODEL}`,
    JSON.stringify({ ...i2vInput, image_url: i2vInput.image_url.substring(0, 80) }),
  );

  let result: unknown;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result = await (fal as any).subscribe(SEEDANCE_I2V_MODEL, {
      input: i2vInput,
      logs: false,
      pollInterval: 5000,
    });
  } catch (seedanceErr) {
    console.warn(`[Shot ${shot.shot_number}] Seedance i2v failed, falling back to Kling:`, seedanceErr);
    // Kling v3 accepts numeric duration
    const klingInput = { prompt, image_url: shot.scene_image_url, duration: Number(duration), aspect_ratio: "9:16" };
    console.log(`[Shot ${shot.shot_number}] model=${KLING_I2V_MODEL} (fallback)`, JSON.stringify({ ...klingInput, image_url: klingInput.image_url.substring(0, 80) }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result = await (fal as any).subscribe(KLING_I2V_MODEL, {
      input: klingInput,
      logs: false,
      pollInterval: 5000,
    });
  }

  const videoUrl = extractVideoUrl(result);
  if (!videoUrl) throw new Error(`image-to-video returned no video URL for shot ${shot.shot_number}`);
  return { videoUrl, duration: shot.duration_seconds };
}

// ── Text overlay ──────────────────────────────────────────────────────────────

async function executeTextOverlay(shot: ShotPacket): Promise<ShotExecutionResult> {
  // Generate a stylised text card via fal.ai image generation
  const prompt = [
    `Bold text overlay card: "${shot.visual_prompt}"`,
    "Dark cinematic background, white bold typography, luxury brand aesthetic,",
    "9:16 portrait format, high contrast, clean minimalist design",
  ].join(" ");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (fal as any).subscribe("fal-ai/flux/schnell", {
    input: {
      prompt,
      image_size: "portrait_16_9",
      num_inference_steps: 4,
      num_images: 1,
    },
    logs: false,
  });

  const imageUrl: string =
    result?.images?.[0]?.url ??
    result?.data?.images?.[0]?.url;

  if (!imageUrl) throw new Error("fal.ai text overlay returned no image URL");

  // Return image URL — composer treats it as a static frame held for duration
  return { videoUrl: imageUrl, duration: shot.duration_seconds };
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

/**
 * Executes a single shot packet by routing to the correct render API.
 *
 * Retries once on failure (after 5 seconds).
 * Returns null if both attempts fail — the composition engine extends adjacent shots.
 */
export async function executeShot(
  shot: ShotPacket,
  assets: ShotAssets = {},
): Promise<ShotExecutionResult | null> {
  const attempt = async (): Promise<ShotExecutionResult> => {
    if (shot.content_type === "text_overlay") {
      return executeTextOverlay(shot);
    }

    if (shot.content_type !== "avatar") {
      // broll, transition — animate the scene image
      return executeFalShot(shot);
    }

    // Avatar shot: route on whether the user has a personal HeyGen avatar
    if (assets.avatarReferenceVideoUrl && assets.heygenAvatarId) {
      // PATH A — personal avatar: HeyGen talking head, scene image as background
      console.log(`[Shot ${shot.shot_number}] Routing to HeyGen — user has personal avatar`);
      return executeHeyGenShot(shot, assets);
    }

    // PATH B — no personal avatar: scene image IS the persona, animate it directly
    console.log(`[Shot ${shot.shot_number}] No personal avatar — animating scene image via fal.ai`);
    return executeFalShot(shot);
  };

  try {
    return await attempt();
  } catch (err) {
    console.error(
      `[shot-executor] shot ${shot.shot_id} (${shot.render_assignment}) failed:`,
      err instanceof Error ? err.message : err,
      "— retrying in 5s",
    );
    await sleep(5000);
    try {
      return await attempt();
    } catch (retryErr) {
      console.error(
        `[shot-executor] shot ${shot.shot_id} retry failed:`,
        retryErr instanceof Error ? retryErr.message : retryErr,
      );
      // Re-throw so callers (generate-cinematic, generate-shot) surface the real error
      throw retryErr;
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
