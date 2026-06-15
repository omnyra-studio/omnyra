/**
 * lib/billing.ts — Unified billing library for Omnyra.studio
 *
 * Single source of truth for:
 * - Plan definitions (Free, Starter, Creator, Studio)
 * - Credit costs per action
 * - Video generation limits and duration enforcement
 * - Top-up pack definitions
 * - Server-side helpers: getUserPlan, canGenerateVideo, getTargetVideoDuration
 *
 * This is a server-only module (uses admin Supabase client).
 */

import { supabaseAdmin } from "@/lib/supabase/admin";

// ── Plan definitions ──────────────────────────────────────────────────────────

export type UserPlan = "free" | "starter" | "creator" | "studio";

export interface PlanConfig {
  name:             string;
  price_aud_month:  number;
  credits_monthly:  number;
  video_limits: {
    cinematic_30s:       number;   // full 30s cinematic videos per month
    avatar_30s:          number;   // avatar videos per month
    full_sequence_60s:   number;   // 60s stitched sequences per month
    preview_watermarked: number;   // watermarked previews per month (free only)
  };
  image_limit_monthly:   number;
  voice_limit_monthly:   number;
  watermark:             boolean;
  max_video_seconds:     number;   // hard cap on video duration
  speedMode:             "ultra-draft" | "draft" | "balanced" | "quality";
}

export const PLANS: Record<UserPlan, PlanConfig> = {
  free: {
    name:             "Free",
    price_aud_month:  0,
    credits_monthly:  30,
    video_limits: {
      cinematic_30s:       0,
      avatar_30s:          0,
      full_sequence_60s:   0,
      preview_watermarked: 1,
    },
    image_limit_monthly: 10,
    voice_limit_monthly:  5,
    watermark:            true,
    max_video_seconds:    30,
    speedMode:            "draft",
  },
  starter: {
    name:             "Starter",
    price_aud_month:  19,
    credits_monthly:  100,
    video_limits: {
      cinematic_30s:       1,
      avatar_30s:          0,
      full_sequence_60s:   0,
      preview_watermarked: 0,
    },
    image_limit_monthly: 33,
    voice_limit_monthly:  20,
    watermark:            false,
    max_video_seconds:    30,
    speedMode:            "balanced",
  },
  creator: {
    name:             "Creator",
    price_aud_month:  49,
    credits_monthly:  350,
    video_limits: {
      cinematic_30s:       5,
      avatar_30s:          5,
      full_sequence_60s:   0,
      preview_watermarked: 0,
    },
    image_limit_monthly: 116,
    voice_limit_monthly:  60,
    watermark:            false,
    max_video_seconds:    30,
    speedMode:            "quality",
  },
  studio: {
    name:             "Studio",
    price_aud_month:  99,
    credits_monthly:  900,
    video_limits: {
      cinematic_30s:       20,
      avatar_30s:          10,
      full_sequence_60s:   5,
      preview_watermarked: 0,
    },
    image_limit_monthly: 300,
    voice_limit_monthly:  150,
    watermark:            false,
    max_video_seconds:    60,
    speedMode:            "quality",
  },
};

// ── Credit costs per action ───────────────────────────────────────────────────

export const CREDITS_PER_ACTION: Record<string, number> = {
  // Text / strategy — free, core product
  script_generation:    0,
  brief_generation:     0,
  truth_card:           0,
  vo_script:            0,
  viral_strategy:       1,
  // Images
  image_standard:       3,
  image_hd:             6,
  scene_images_4x:     12,   // 4 scene images in one pipeline call
  // Voice
  voice_30s:            5,
  voice_60s:           10,
  voice_clone:         15,
  // Video
  video_preview:       10,   // ~15s draft / quick preview
  cinematic_30s:       40,
  avatar_30s:          40,
  avatar_60s:          80,
  full_sequence_60s:   80,
};

// ── Top-up pack definitions ───────────────────────────────────────────────────

export interface TopUpPack {
  id:          string;
  name:        string;
  credits:     number;
  price_aud:   number;
  badge?:      "popular" | "best_value";
  env_key:     string;    // Stripe price ID env var name
}

export const TOP_UP_PACKS: TopUpPack[] = [
  { id: "small",  name: "Small Pack",  credits: 100, price_aud: 19,  env_key: "STRIPE_SMALL_PACK_PRICE_ID" },
  { id: "medium", name: "Medium Pack", credits: 300, price_aud: 49,  badge: "popular",    env_key: "STRIPE_MEDIUM_PACK_PRICE_ID" },
  { id: "large",  name: "Large Pack",  credits: 700, price_aud: 99,  badge: "best_value", env_key: "STRIPE_LARGE_PACK_PRICE_ID" },
];

// ── Video duration enforcement ────────────────────────────────────────────────

export type VideoType = "cinematic_30s" | "avatar_30s" | "full_sequence_60s" | "preview";

/**
 * Returns the clamped target duration for a given plan + video type.
 * Cinematic and avatar videos are always clamped to 25–30s.
 * Studio sequences may go up to 60s.
 * Never returns <25s for paid generation (previews excluded).
 */
export function getTargetVideoDuration(plan: UserPlan, videoType: VideoType): number {
  if (videoType === "preview") return 30; // Free tier gets 30s watermarked preview
  if (videoType === "full_sequence_60s") return PLANS[plan].max_video_seconds;
  // cinematic_30s and avatar_30s → clamp 25–30s regardless of plan
  return 30;
}

/**
 * Speed optimization config for video generation API calls.
 * Cinematic and avatar jobs always get speed-optimized parameters.
 */
export function getSpeedOptimizations(videoType: VideoType, plan: UserPlan) {
  const isCinematicOrAvatar = videoType === "cinematic_30s" || videoType === "avatar_30s";
  return {
    motionComplexity: isCinematicOrAvatar ? "medium" : "high",
    useCache:         true,
    fastMode:         isCinematicOrAvatar || plan === "free" || plan === "starter",
    maxPromptTokens:  350,   // keep prompts short for faster inference
    preferI2V:        true,  // image-to-video is faster and more consistent
  };
}

/**
 * Trims a video prompt to the recommended max token length for fast inference.
 * Keeps the first ~350 characters and appends speed flags.
 */
export function buildSpeedOptimizedPrompt(prompt: string, _videoType: VideoType): string {
  const trimmed = prompt.length > 1200 ? prompt.slice(0, 1200).replace(/\s+\S*$/, "") : prompt;
  return `${trimmed}, cinematic photorealistic, consistent character, medium motion, natural lighting`;
}

// ── Server-side helpers ───────────────────────────────────────────────────────

/** Resolve the user's current plan from the database. */
export async function getUserPlan(userId: string): Promise<UserPlan> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("plan")
    .eq("id", userId)
    .single();
  const raw = data?.plan as string | null;
  if (raw && raw in PLANS) return raw as UserPlan;
  return "free";
}

/** Get current credit balance (subscription monthly + top-up pool combined). */
export async function getCreditBalance(userId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("credits")
    .select("balance")
    .eq("user_id", userId)
    .single();
  return data?.balance ?? 0;
}

export interface VideoGenerationCheck {
  allowed:      boolean;
  reason?:      string;
  watermark:    boolean;
  duration:     number;
  creditsNeeded: number;
  balance:      number;
  plan:         UserPlan;
}

/**
 * Full pre-flight check before any video generation:
 * - Verifies plan allows the video type
 * - Checks monthly video count hasn't been exceeded
 * - Checks credit balance covers the cost
 * Returns a complete decision object — caller decides whether to proceed.
 */
export async function canGenerateVideo(
  userId:    string,
  videoType: VideoType,
  isAvatar?: boolean,
): Promise<VideoGenerationCheck> {
  const plan    = await getUserPlan(userId);
  const config  = PLANS[plan];
  const balance = await getCreditBalance(userId);
  const action  = isAvatar ? "avatar_30s" : videoType === "preview" ? "video_preview" : videoType;
  const credits = CREDITS_PER_ACTION[action] ?? 40;

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  // Count this user's video generations this month
  const { count } = await supabaseAdmin
    .from("usage_logs")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .in("action_type", ["cinematic_30s", "avatar_30s", "full_sequence_60s", "video_preview"])
    .gte("created_at", monthStart.toISOString());

  const videosThisMonth = count ?? 0;

  // Determine the monthly limit for the requested video type
  const limitKey = videoType === "preview"
    ? "preview_watermarked"
    : isAvatar
      ? "avatar_30s"
      : videoType === "full_sequence_60s"
        ? "full_sequence_60s"
        : "cinematic_30s";

  const monthlyLimit = config.video_limits[limitKey as keyof typeof config.video_limits];

  if (videosThisMonth >= monthlyLimit) {
    return {
      allowed: false,
      reason:  `Monthly ${videoType} limit reached (${monthlyLimit}/${monthlyLimit} used on ${config.name} plan)`,
      watermark: config.watermark,
      duration:  getTargetVideoDuration(plan, videoType),
      creditsNeeded: credits,
      balance,
      plan,
    };
  }

  if (balance < credits) {
    return {
      allowed: false,
      reason:  `Insufficient credits (need ${credits}, have ${balance})`,
      watermark: config.watermark,
      duration:  getTargetVideoDuration(plan, videoType),
      creditsNeeded: credits,
      balance,
      plan,
    };
  }

  return {
    allowed:      true,
    watermark:    config.watermark,
    duration:     getTargetVideoDuration(plan, videoType),
    creditsNeeded: credits,
    balance,
    plan,
  };
}
