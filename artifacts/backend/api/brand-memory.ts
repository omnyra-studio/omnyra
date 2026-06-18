/**
 * artifacts/backend/api/brand-memory.ts
 *
 * Example improved API route logic (reference implementation).
 * The actual routes in app/api/brand/* will be lightly patched to call the unified core.
 *
 * Endpoints remain the same shape so UI is untouched.
 */

import { NextResponse } from "next/server";
import {
  loadUnifiedBrandMemory,
  saveBrandProfileAndSync,
} from "../core/brand-memory";
import { trackServerEvent } from "../core/analytics/tracker";

export async function handleBrandGet(userId: string) {
  const mem = await loadUnifiedBrandMemory(userId);
  // Return shape compatible with existing consumers of /api/brand/get and /api/brand-brain/profile
  return {
    ...mem,
    // legacy aliases
    brand_name: mem.brandName,
    tone_of_voice: mem.toneOfVoice,
    target_audience: mem.targetAudience,
  };
}

export async function handleBrandSave(userId: string, body: any) {
  const result = await saveBrandProfileAndSync(userId, body);
  if ("error" in result) {
    return { error: result.error };
  }
  await trackServerEvent(userId, "brand_profile_saved", { source: "dashboard" });
  // Invalidate scalability cache
  (await import("../core/scalability/resilience")).invalidateBrandCache(userId);
  return result.memory;
}

export async function handleRecordOutcome(userId: string, body: any) {
  const { Feedback } = await import("../core");
  const res = await Feedback.recordOutcomeAndLearn(userId, body);
  await trackServerEvent(userId, "brand_outcome_recorded", body);
  return res;
}
