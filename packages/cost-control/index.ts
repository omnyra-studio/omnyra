// Cost Control Engine — hard limits per job and per user.
// Applied before any model call. Non-negotiable.

export interface CostLimits {
  maxTokensPerJob: number;
  maxGpuSecondsPerUser: number;
  maxParallelJobsPerUser: number;
  maxScenesPerJob: number;
  maxClipDurationSeconds: number;
  maxTotalDurationSeconds: number;
}

export const DEFAULT_LIMITS: CostLimits = {
  maxTokensPerJob:          4_000,
  maxGpuSecondsPerUser:     600,   // 10 min cumulative GPU time per user per hour
  maxParallelJobsPerUser:   3,
  maxScenesPerJob:          10,
  maxClipDurationSeconds:   10,
  maxTotalDurationSeconds:  60,
};

export type ModelTier = "pro" | "turbo" | "fast" | "smart_motion";

export interface JobSpec {
  sceneCount: number;
  clipDurationSeconds: number;
  modelTier: ModelTier;
  parallelJobs: number;
}

export interface CostValidationResult {
  approved: boolean;
  estimatedGpuSeconds: number;
  appliedOptimizations: string[];
  reason?: string;
}

// GPU-second estimates per tier per 10s clip
const GPU_SECONDS_PER_CLIP: Record<ModelTier, number> = {
  pro:          45,
  turbo:        20,
  fast:         10,
  smart_motion: 2,
};

export function validateJobCost(
  spec: JobSpec,
  limits: CostLimits = DEFAULT_LIMITS,
): CostValidationResult {
  const optimizations: string[] = [];
  let { sceneCount, clipDurationSeconds, modelTier } = spec;

  // Enforce scene cap
  if (sceneCount > limits.maxScenesPerJob) {
    sceneCount = limits.maxScenesPerJob;
    optimizations.push(`scene_count_reduced_to_${sceneCount}`);
  }

  // Enforce clip duration cap
  if (clipDurationSeconds > limits.maxClipDurationSeconds) {
    clipDurationSeconds = limits.maxClipDurationSeconds;
    optimizations.push(`clip_duration_capped_to_${clipDurationSeconds}s`);
  }

  // Enforce total duration cap
  const totalDuration = sceneCount * clipDurationSeconds;
  if (totalDuration > limits.maxTotalDurationSeconds) {
    const newCount = Math.floor(limits.maxTotalDurationSeconds / clipDurationSeconds);
    sceneCount = newCount;
    optimizations.push(`scene_count_reduced_to_${sceneCount}_for_duration_cap`);
  }

  const gpuPerClip = GPU_SECONDS_PER_CLIP[modelTier];
  let estimatedGpuSeconds = sceneCount * gpuPerClip;

  // If over GPU budget, downgrade model tier
  if (estimatedGpuSeconds > limits.maxGpuSecondsPerUser) {
    if (modelTier === "pro") { modelTier = "turbo"; optimizations.push("model_downgraded_pro→turbo"); }
    else if (modelTier === "turbo") { modelTier = "fast"; optimizations.push("model_downgraded_turbo→fast"); }
    else if (modelTier === "fast") { modelTier = "smart_motion"; optimizations.push("model_downgraded_fast→smart_motion"); }
    estimatedGpuSeconds = sceneCount * GPU_SECONDS_PER_CLIP[modelTier];
  }

  if (estimatedGpuSeconds > limits.maxGpuSecondsPerUser) {
    return {
      approved: false,
      estimatedGpuSeconds,
      appliedOptimizations: optimizations,
      reason: `Estimated GPU time (${estimatedGpuSeconds}s) exceeds limit (${limits.maxGpuSecondsPerUser}s) even after downgrade`,
    };
  }

  return { approved: true, estimatedGpuSeconds, appliedOptimizations: optimizations };
}

// In-memory per-user usage tracker (replace with Redis in production)
const usageMap = new Map<string, { gpuSeconds: number; resetAt: number }>();

export function checkUserQuota(userId: string, gpuSecondsNeeded: number, limits: CostLimits = DEFAULT_LIMITS): boolean {
  const now = Date.now();
  const hourAgo = now - 3_600_000;
  const entry = usageMap.get(userId);

  if (!entry || entry.resetAt < hourAgo) {
    usageMap.set(userId, { gpuSeconds: gpuSecondsNeeded, resetAt: now });
    return true;
  }

  if (entry.gpuSeconds + gpuSecondsNeeded > limits.maxGpuSecondsPerUser) return false;

  entry.gpuSeconds += gpuSecondsNeeded;
  return true;
}

export function recordUsage(userId: string, gpuSecondsUsed: number): void {
  const entry = usageMap.get(userId);
  if (entry) entry.gpuSeconds += gpuSecondsUsed;
}
