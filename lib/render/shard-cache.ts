/**
 * Shard cache — two-level cache (memory + Supabase) for rendered shard outputs.
 *
 * Cache key = deterministic FNV-1a of (contractHash + shardIndex + clipHashes).
 * A cache hit means the exact same clip set in the exact same order was already
 * composed — the worker skips the composer API call entirely.
 *
 * Memory layer (L1): process-scoped Map — survives within a Fluid Compute
 *   instance lifetime, giving sub-millisecond hits for retries/replays.
 *
 * Supabase layer (L2): persistent across instances — provides cache hits on
 *   subsequent deploys, partial re-renders, and scale-out workers.
 *
 * Required DB migration:
 *
 *   CREATE TABLE render_shard_cache (
 *     cache_key         text PRIMARY KEY,
 *     shard_id          text NOT NULL,
 *     output_url        text NOT NULL,
 *     duration_seconds  float NOT NULL,
 *     cached_at         timestamptz DEFAULT now() NOT NULL
 *   );
 */

import { createClient } from "@supabase/supabase-js";
import type { ShardCacheEntry } from "./types";
import { cleanEnv } from "@/lib/supabase/admin";

function getServiceClient() {
  return createClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY),
  );
}

class ShardCache {
  private readonly mem = new Map<string, ShardCacheEntry>();

  async get(cacheKey: string): Promise<ShardCacheEntry | null> {
    const hit = this.mem.get(cacheKey);
    if (hit) return hit;

    const { data } = await getServiceClient()
      .from("render_shard_cache")
      .select("cache_key, shard_id, output_url, duration_seconds, cached_at")
      .eq("cache_key", cacheKey)
      .maybeSingle();

    if (!data) return null;

    const entry: ShardCacheEntry = {
      cacheKey:        data.cache_key        as string,
      shardId:         data.shard_id         as string,
      outputUrl:       data.output_url       as string,
      durationSeconds: data.duration_seconds as number,
      cachedAt:        data.cached_at        as string,
    };
    this.mem.set(cacheKey, entry);
    return entry;
  }

  async set(entry: ShardCacheEntry): Promise<void> {
    this.mem.set(entry.cacheKey, entry);
    await getServiceClient()
      .from("render_shard_cache")
      .upsert({
        cache_key:        entry.cacheKey,
        shard_id:         entry.shardId,
        output_url:       entry.outputUrl,
        duration_seconds: entry.durationSeconds,
        cached_at:        entry.cachedAt,
      });
  }

  // Batch lookup — single DB round-trip for all cache keys in a plan
  async getBatch(cacheKeys: string[]): Promise<Map<string, ShardCacheEntry>> {
    const result = new Map<string, ShardCacheEntry>();
    const misses: string[] = [];

    for (const key of cacheKeys) {
      const hit = this.mem.get(key);
      if (hit) result.set(key, hit);
      else misses.push(key);
    }

    if (misses.length > 0) {
      const { data } = await getServiceClient()
        .from("render_shard_cache")
        .select("cache_key, shard_id, output_url, duration_seconds, cached_at")
        .in("cache_key", misses);

      for (const row of data ?? []) {
        const entry: ShardCacheEntry = {
          cacheKey:        row.cache_key        as string,
          shardId:         row.shard_id         as string,
          outputUrl:       row.output_url       as string,
          durationSeconds: row.duration_seconds as number,
          cachedAt:        row.cached_at        as string,
        };
        this.mem.set(entry.cacheKey, entry);
        result.set(entry.cacheKey, entry);
      }
    }

    return result;
  }
}

// Singleton — one cache instance per server process
let instance: ShardCache | null = null;

export function getShardCache(): ShardCache {
  instance ??= new ShardCache();
  return instance;
}
