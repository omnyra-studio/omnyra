// Omnyra Usage Control Engine
// Multi-instance safe: state is persisted in Supabase, not process memory.
// In-memory cache used as a fast-path for hot requests within the same instance.
// Supabase is authoritative; the cache is invalidated after each write.

import { supabaseAdmin } from "@/lib/supabase/admin";

// ── Types ─────────────────────────────────────────────────────────────────────

export type FlagLevel = "none" | "soft" | "hard";

export interface AbuseCheckResult {
  allowed: boolean;
  flagLevel: FlagLevel;
  creditMultiplier: number;
  cooldownRemainingMs: number;
  userMessage: string | null;
  queueDelayMs: number;
}

export interface AbuseCheckInput {
  userId: string;
  input: string;
  isVideoGeneration?: boolean;
  userTier?: string;
  monthlyCreditsUsed?: number;
  monthlyCreditsAllocation?: number;
}

// ── Per-instance cache (fast path, not authoritative) ─────────────────────────

interface CachedState {
  cooldownUntil: number;
  videoCooldownUntil: number;
  concurrentVideoJobs: number;
  hardFlagCount: number;
  dailyRequestCount: number;
  dailyWindowStart: number;
  cachedAt: number;
}

const localCache = new Map<string, CachedState>();
const CACHE_TTL_MS = 5_000; // 5s local cache; re-reads from DB after that

// ── Plan daily limits ─────────────────────────────────────────────────────────

const DAILY_LIMIT_BY_TIER: Record<string, number> = {
  free:    10,
  starter: 40,
  creator: 120,
  studio:  400,
};

const VIDEO_MIN_COOLDOWN_MS = 30_000;
const VIDEO_MAX_CONCURRENT  = 2;

// ── Input hash (identical input detection) ────────────────────────────────────

function hashInput(input: string): string {
  return input.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim().substring(0, 120);
}

// ── DB read ───────────────────────────────────────────────────────────────────

async function readState(userId: string): Promise<CachedState> {
  const cached = localCache.get(userId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) return cached;

  const { data } = await supabaseAdmin
    .from("rate_limit_state")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  const now = Date.now();
  const state: CachedState = {
    cooldownUntil:        data?.cooldown_until       ? new Date(data.cooldown_until as string).getTime() : 0,
    videoCooldownUntil:   data?.video_cooldown_until  ? new Date(data.video_cooldown_until as string).getTime() : 0,
    concurrentVideoJobs:  data?.concurrent_video_jobs ?? 0,
    hardFlagCount:        data?.hard_flag_count       ?? 0,
    dailyRequestCount:    data?.daily_request_count   ?? 0,
    dailyWindowStart:     data?.daily_window_start    ? new Date(data.daily_window_start as string).getTime() : now,
    cachedAt: now,
  };

  localCache.set(userId, state);
  return state;
}

// ── DB write (non-blocking) ───────────────────────────────────────────────────

function writeState(userId: string, state: CachedState): void {
  localCache.set(userId, { ...state, cachedAt: Date.now() });

  void supabaseAdmin
    .from("rate_limit_state")
    .upsert({
      user_id:               userId,
      cooldown_until:        state.cooldownUntil        ? new Date(state.cooldownUntil).toISOString() : null,
      video_cooldown_until:  state.videoCooldownUntil   ? new Date(state.videoCooldownUntil).toISOString() : null,
      concurrent_video_jobs: state.concurrentVideoJobs,
      hard_flag_count:       state.hardFlagCount,
      daily_request_count:   state.dailyRequestCount,
      daily_window_start:    new Date(state.dailyWindowStart).toISOString(),
      updated_at:            new Date().toISOString(),
    }, { onConflict: "user_id" })
    .then(({ error }) => {
      if (error) console.error("[abuse-protection] writeState error:", error.message);
    });
}

// ── Daily window reset ────────────────────────────────────────────────────────

function ensureDailyWindow(state: CachedState): CachedState {
  const dayMs = 86_400_000;
  if (Date.now() - state.dailyWindowStart > dayMs) {
    return {
      ...state,
      dailyRequestCount: 0,
      dailyWindowStart:  Date.now(),
      hardFlagCount:     Math.max(0, state.hardFlagCount - 1), // decay one flag per day
    };
  }
  return state;
}

// ── Main check ────────────────────────────────────────────────────────────────

export async function checkAbuse(params: AbuseCheckInput): Promise<AbuseCheckResult> {
  const {
    userId,
    input,
    isVideoGeneration = false,
    userTier = "starter",
  } = params;

  let state = await readState(userId);
  const now = Date.now();

  state = ensureDailyWindow(state);

  // ── Hard cooldown active ───────────────────────────────────────────────────
  if (state.cooldownUntil > now) {
    return {
      allowed: false,
      flagLevel: "hard",
      creditMultiplier: 1,
      cooldownRemainingMs: state.cooldownUntil - now,
      userMessage: null,
      queueDelayMs: state.cooldownUntil - now,
    };
  }

  // ── Video guards ───────────────────────────────────────────────────────────
  if (isVideoGeneration) {
    if (state.videoCooldownUntil > now) {
      return {
        allowed: false, flagLevel: "soft", creditMultiplier: 1,
        cooldownRemainingMs: state.videoCooldownUntil - now,
        userMessage: null, queueDelayMs: state.videoCooldownUntil - now,
      };
    }
    if (state.concurrentVideoJobs >= VIDEO_MAX_CONCURRENT) {
      // Auto-heal: if the last video started >6 minutes ago, Vercel maxDuration
      // (300s) guarantees it has either completed or been killed. Reset the stuck counter.
      const lastStartAt  = state.videoCooldownUntil - VIDEO_MIN_COOLDOWN_MS;
      const staleSinceMs = now - lastStartAt;
      if (staleSinceMs > 360_000) {
        console.warn(`[abuse-protection] auto-heal stuck concurrent counter userId=${userId} stale=${Math.round(staleSinceMs / 1000)}s — resetting to 0`);
        state = { ...state, concurrentVideoJobs: 0 };
      } else {
        console.warn(`[abuse-protection] concurrent cap hit userId=${userId} jobs=${state.concurrentVideoJobs} stale=${Math.round(staleSinceMs / 1000)}s`);
        return {
          allowed: false, flagLevel: "soft", creditMultiplier: 1,
          cooldownRemainingMs: VIDEO_MIN_COOLDOWN_MS,
          userMessage: null, queueDelayMs: VIDEO_MIN_COOLDOWN_MS,
        };
      }
    }
  }

  // ── Daily limit ────────────────────────────────────────────────────────────
  const dailyLimit = DAILY_LIMIT_BY_TIER[userTier] ?? 40;
  const newCount = state.dailyRequestCount + 1;
  if (newCount > dailyLimit) {
    const cooldown = 120_000;
    const updated: CachedState = {
      ...state,
      dailyRequestCount: newCount,
      cooldownUntil: now + cooldown,
      hardFlagCount: state.hardFlagCount + 1,
    };
    writeState(userId, updated);
    return {
      allowed: false, flagLevel: "hard", creditMultiplier: 1,
      cooldownRemainingMs: cooldown, userMessage: null, queueDelayMs: cooldown,
    };
  }

  // ── Identical input detection (in-memory only — no cross-instance needed) ──
  const inputHash = hashInput(input);
  const inputKey  = `input:${userId}`;
  const recentInputs = (localCache.get(inputKey) as unknown as Array<{ hash: string; at: number }>) ?? [];
  const now2 = Date.now();
  const consecutive = recentInputs.reduceRight((n: number, e: { hash: string; at: number }) =>
    n >= 0 && e.hash === inputHash ? n + 1 : (n >= 0 ? -(n + 1) : n), 0);
  const consecutiveCount = consecutive >= 0 ? consecutive + 1 : -(consecutive) - 1 + 1;
  const recentIdentical  = recentInputs.filter(e => now2 - e.at < 120_000 && e.hash === inputHash).length;

  if (consecutiveCount >= 3 || recentIdentical >= 5) {
    const cooldown = 60_000;
    const updated: CachedState = {
      ...state, dailyRequestCount: newCount,
      cooldownUntil: now + cooldown, hardFlagCount: state.hardFlagCount + 1,
    };
    writeState(userId, updated);
    return {
      allowed: false, flagLevel: "hard", creditMultiplier: 1,
      cooldownRemainingMs: cooldown, userMessage: null, queueDelayMs: cooldown,
    };
  }

  let queueDelayMs = 0;
  let flagLevel: FlagLevel = "none";
  let creditMultiplier = 1.0;

  if (consecutiveCount === 2 || recentIdentical >= 3) {
    flagLevel = "soft";
    creditMultiplier = 1.15;
    queueDelayMs = 2_000;
  }

  // Update state
  const newInputs = [...recentInputs, { hash: inputHash, at: now }].slice(-20);
  localCache.set(inputKey, newInputs as unknown as CachedState);

  const updated: CachedState = {
    ...state,
    dailyRequestCount: newCount,
    ...(isVideoGeneration ? {
      concurrentVideoJobs: Math.min(state.concurrentVideoJobs + 1, VIDEO_MAX_CONCURRENT),
      videoCooldownUntil:  now + VIDEO_MIN_COOLDOWN_MS,
    } : {}),
  };
  writeState(userId, updated);

  return {
    allowed: true, flagLevel, creditMultiplier,
    cooldownRemainingMs: 0, userMessage: null, queueDelayMs,
  };
}

// ── Sync call (non-async) version for backward compatibility ──────────────────
// Wraps the async version. Callers that used the old sync API should await this.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(checkAbuse as any).__sync_compat = true;

export function releaseVideoSlot(userId: string): void {
  // Update local cache if present on this instance
  const state = localCache.get(userId);
  if (state) {
    const updated = { ...state, concurrentVideoJobs: Math.max(0, state.concurrentVideoJobs - 1), cachedAt: Date.now() };
    localCache.set(userId, updated);
    void supabaseAdmin
      .from("rate_limit_state")
      .update({ concurrent_video_jobs: updated.concurrentVideoJobs })
      .eq("user_id", userId)
      .then(({ error }) => {
        if (error) console.error("[abuse-protection] releaseVideoSlot write error:", error.message);
      });
  } else {
    // No local cache — different Vercel instance or post-crash path.
    // Read DB first so we don't underflow, then decrement.
    void supabaseAdmin
      .from("rate_limit_state")
      .select("concurrent_video_jobs")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) { console.error("[abuse-protection] releaseVideoSlot read error:", error.message); return; }
        const current = (data?.concurrent_video_jobs as number | null) ?? 0;
        const next    = Math.max(0, current - 1);
        return supabaseAdmin
          .from("rate_limit_state")
          .update({ concurrent_video_jobs: next })
          .eq("user_id", userId)
          .then(({ error: wErr }) => {
            if (wErr) console.error("[abuse-protection] releaseVideoSlot update error:", wErr.message);
          });
      });
  }
}

export function getUserFlagLevel(userId: string): FlagLevel {
  const state = localCache.get(userId);
  if (!state) return "none";
  if (state.cooldownUntil > Date.now()) return "hard";
  return "none";
}
