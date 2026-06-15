import { createClient } from "@/lib/supabase/client";

export type UserTier = "free" | "starter" | "creator" | "studio";

export async function getUserTier(): Promise<UserTier> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return "free";

  const { data: profile } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();

  return (profile?.plan || "free") as UserTier;
}

export interface TierVideoConfig {
  canGenerate: boolean;
  maxClips: number;
  clipLength: number;
  model: string;
  watermark: boolean;
  label: string;
  description: string;
  video: string;
  video_seconds: number;
  video_count?: number;
}

export const TIER_VIDEO_LIMITS: Record<UserTier, TierVideoConfig> = {
  free: {
    canGenerate: true,
    maxClips: 1,
    clipLength: 30,
    model: "fast",
    watermark: true,
    label: "Quick Preview",
    description: "30s preview · watermarked · 1/month",
    video: "preview_30s_watermarked",
    video_seconds: 30,
  },
  starter: {
    canGenerate: true,
    maxClips: 1,
    clipLength: 30,
    model: "fast",
    watermark: false,
    label: "Cinematic 30s",
    description: "30s cinematic · 1/month",
    video: "cinematic_30s_clean",
    video_seconds: 30,
  },
  creator: {
    canGenerate: true,
    maxClips: 1,
    clipLength: 30,
    model: "cinematic",
    watermark: false,
    label: "Cinematic Scene",
    description: "30s cinematic · 5/month",
    video: "cinematic_30s_kling_pro",
    video_seconds: 30,
  },
  studio: {
    canGenerate: true,
    maxClips: 4,
    clipLength: 15,
    model: "cinematic",
    watermark: false,
    label: "Full Sequence",
    description: "4 × 15s stitched = 60s · 20/month",
    video: "sequence_60s",
    video_seconds: 60,
    video_count: 4,
  },
};

/**
 * Clamps a video duration to the allowed range for a given tier.
 * Cinematic/avatar always 25–30s. Studio sequences up to 60s.
 * Never defaults to 10s or 15s for paid generation.
 */
export function clampVideoDuration(tier: UserTier, requested: number): number {
  const config = TIER_VIDEO_LIMITS[tier];
  if (config.video_seconds >= 60) {
    // Studio: allow up to 60s but at least 25s
    return Math.min(Math.max(25, requested), 60);
  }
  // All other tiers: clamp to 25–30s
  return Math.min(Math.max(25, requested), 30);
}
