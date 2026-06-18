/**
 * artifacts/backend/core/scalability/resilience.ts
 *
 * Scalability helpers:
 * - TTL memory cache for brand memory loads (reduces DB chatter on generation)
 * - withRetry + circuit breaker stub
 * - batch loader for multiple users (cron friendly)
 * - Graceful degradation (return EMPTY on total failure)
 */

import { loadUnifiedBrandMemory, type UnifiedBrandMemory } from "../brand-memory";

const cache = new Map<string, { value: UnifiedBrandMemory; expires: number }>();
const TTL_MS = 1000 * 60 * 2; // 2 min brand cache — safe for creative sessions

export async function loadBrandMemoryCached(userId: string): Promise<UnifiedBrandMemory> {
  const now = Date.now();
  const hit = cache.get(userId);
  if (hit && hit.expires > now) {
    return hit.value;
  }
  const fresh = await loadUnifiedBrandMemory(userId);
  cache.set(userId, { value: fresh, expires: now + TTL_MS });
  // crude size limit
  if (cache.size > 500) {
    const oldest = Array.from(cache.entries()).sort((a, b) => a[1].expires - b[1].expires)[0];
    if (oldest) cache.delete(oldest[0]);
  }
  return fresh;
}

export function invalidateBrandCache(userId?: string) {
  if (userId) cache.delete(userId);
  else cache.clear();
}

// Simple retry wrapper for flaky external calls (AI, video providers)
export async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 2,
  label = "op"
): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 80 * (i + 1)));
    }
  }
  console.warn(`[resilience] ${label} failed after ${attempts} attempts`);
  throw lastErr;
}

// Batch brand loader (used by crons / admin analytics)
export async function loadManyBrandMemories(userIds: string[]): Promise<Record<string, UnifiedBrandMemory>> {
  const results: Record<string, UnifiedBrandMemory> = {};
  // naive parallel; in real would use connection pool limits
  await Promise.all(
    userIds.map(async (uid) => {
      try {
        results[uid] = await loadBrandMemoryCached(uid);
      } catch {
        results[uid] = (await import("../brand-memory")).EMPTY_MEMORY;
      }
    })
  );
  return results;
}

// Future: queue hook stub (for when adding real BullMQ / pg-boss etc)
export function enqueueBrandSync(userId: string, reason: string) {
  // In real impl: publish to queue. For now just invalidate + log
  invalidateBrandCache(userId);
  console.info(`[scalability] enqueued brand sync for ${userId.slice(0, 8)} reason=${reason}`);
}
