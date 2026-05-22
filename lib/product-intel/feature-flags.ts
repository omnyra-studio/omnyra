/* Server-side feature flag evaluation.
 *
 * The `evaluate_feature_flag(key, user_id)` PL/pgSQL function in
 * product_intelligence.sql is the single source of truth. This module
 * is a thin TS wrapper so server routes can call it ergonomically.
 *
 * The function is deterministic — the same (key, user_id) always
 * returns the same bucket assignment until the flag's
 * rollout_percent or enabled state changes.
 */

import { supabaseAdmin } from "../supabase/admin";

const cache = new Map<string, { value: boolean; expiresAt: number }>();
const CACHE_TTL_MS = 30_000;

export async function isFlagEnabled(key: string, userId: string): Promise<boolean> {
  const cacheKey = `${key}:${userId}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const { data, error } = await supabaseAdmin.rpc("evaluate_feature_flag", {
    p_key: key,
    p_user_id: userId,
  });
  if (error) {
    console.error(`[flags] evaluate_feature_flag failed for ${key}:`, error.message);
    return false;
  }
  const value = data === true;
  cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

/** Get the full list of flags enabled-for-this-user. Useful for a
 * single client bootstrap call. */
export async function listEnabledFlags(userId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("feature_flags")
    .select("key, enabled, rollout_percent");
  const flags = (data ?? []) as Array<{ key: string; enabled: boolean; rollout_percent: number }>;
  const enabled: string[] = [];
  for (const f of flags) {
    if (!f.enabled) continue;
    if (f.rollout_percent >= 100) { enabled.push(f.key); continue; }
    if (f.rollout_percent <= 0)   continue;
    if (await isFlagEnabled(f.key, userId)) enabled.push(f.key);
  }
  return enabled;
}
