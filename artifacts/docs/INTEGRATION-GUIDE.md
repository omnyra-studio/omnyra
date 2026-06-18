# Integration Guide — Applying the Artifacts Fixes to Live Code

## 1. Brand Memory (priority)
- Replace the body of `lib/memory/brand-memory.ts` loadBrandMemory with call (or inline the logic) from `artifacts/backend/core/brand-memory/unified.ts` loadUnifiedBrandMemory + getBrandPromptSuffixes.
- Update `lib/brand.ts` upsert + `app/api/brand/save/route.ts` to call saveBrandProfileAndSync after (or instead of) plain upsert. This makes brand_brain get populated.
- Wire `app/api/brand/get/route.ts` to return the unified shape (add fields if needed, keep old keys).
- In every generator that does `const brandMemory = await loadBrandMemory(userId)` (cinematic, parallel-engine, run-cinematic, continue-story, generate-cinematic-sequence) — also call `trackBrandMemoryUsed` from analytics core.
- Fix utils/brandMemory.ts or deprecate its functions — point callers (if any) to the campaign save/load from unified.

## 2. Feedback loops
- In generation start points (lib/orchestrator/parallel-engine.ts, app/api/generate-cinematic-sequence/route.ts, app/api/generate-shot-plan etc), call `recordGenerationStart` right after deciding hook/energy/template.
- Wire existing record-outcome calls + any "publish" buttons in dashboard to use the new `recordOutcomeAndLearn`.
- Update lib/brand-brain/learning.ts processOutcome to also call the new engine (or replace its implementation).

## 3. Analytics
- Add `import { trackServerEvent, trackOutcomeRecorded... } from "..."` (or the artifacts version) at key points:
  - After successful brand save
  - After generation start
  - In /api/brand-brain/record-outcome
  - In video download, publish flows
- Ensure /api/analytics and brand-brain/analytics continue to work (they already query good tables).

## 4. Scalability
- Wrap hot `loadBrandMemory` calls with the cached version from resilience.
- Use `withRetry` around AI calls inside brand-brain profile insights if flaky.
- Call enqueueBrandSync (or just invalidate) after any profile change.

## 5. Schema (if needed)
- Add missing columns to brand_memories if voice favorites desired:
  ALTER TABLE brand_memories ADD COLUMN IF NOT EXISTS preferred_voice_id TEXT;
  ALTER TABLE brand_memories ADD COLUMN IF NOT EXISTS voice_favorites TEXT[];

- Ensure brand_brain table exists (the RLS migrations assume it; if SELECT fails in health, create it manually with user_id PK + the columns from types/brand.ts).

## 6. Wiring order recommendation
1. Apply unified load + save+sync (makes memory actually appear in videos).
2. Add recordGenerationStart + outcome learn calls.
3. Add tracking events.
4. Swap in cached loads.
5. Run `npm run health` + typecheck.
6. Test a full flow: edit brand in /dashboard/brand → create cinematic video → check if kling/flux suffixes appear in logs → mark as published → check brand-brain/analytics shows updated weights.

All changes preserve exact function signatures where called from UI or other modules.
No visual or background files touched.
