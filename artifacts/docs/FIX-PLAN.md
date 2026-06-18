# Omnyra AI — Non-Visual Fixes Plan (Backend, Brand Memory, Analytics, Feedback, Scalability)

**Constraint:** NO changes to visuals, cosmetics, AnimatedBackground, colors, layouts, CSS, JSX rendering, or background elements. Only edit:
- lib/*.ts (pure logic)
- app/api/**/route.* (endpoints + orchestration)
- utils/*.ts (if pure, non-UI)
- hooks/*.ts (logic only, preserve exported API)
- packages/* (if core)
- scripts, prisma, supabase/migrations (schema fixes)
- Add new files under artifacts/ (blueprints + improved modules)
- Can enhance existing API responses if shape-preserving for UI consumers.

Goal: Make brand memory, analytics, feedback loops, core functionality, and scalability robust and actually wired end-to-end.

## Current Problems Identified (from audit)
1. **Brand Memory Fragmentation** (critical):
   - Multiple tables: brand_profiles (primary UI), brand_brain (queried for prompt suffixes but NEVER written to in code), creator_profiles, brand_memories (20260615 migration, columns mismatch with utils/brandMemory.ts), legacy brand_memory.
   - loadBrandMemory (lib/memory/brand-memory.ts) always falls back because brand_brain rows are absent.
   - utils/brandMemory.ts (campaign + voice) not imported anywhere; dead + schema-drifted.
   - No sync from user-edited brand_profiles → brand_brain (used in video prompt injection).
   - brand-brain/* (learning, profile, store) partially implemented: recordGeneration never called, generation_memory unused, preference_weights unused for updates.

2. **Feedback Loops Incomplete**:
   - processOutcome + record-outcome API exists but not called from generation complete flows in many pipelines.
   - No auto-recording of generation settings at start of cinematic/shot/video flows.
   - Learning (EMA weights, bestSettings) runs on creator_memory but generation_memory table starved.
   - Performance ingest (ingest-performance API?) exists but wiring spotty.

3. **Analytics**:
   - PostHog reverse proxy + events in place (from setup report).
   - Internal /api/analytics and cron/aggregate-analytics use usage_events (check if table always present).
   - Brand brain analytics route exists but data incomplete due to #1.
   - Missing some server-side captures for key funnels (e.g. brand saved, memory used in gen, outcome recorded).
   - Snapshots in lib/analytics/snapshots.ts may need robustness.

4. **Scalability / Functionality**:
   - Many generation paths (cinematic, avatar, parallel-engine, old routes) duplicate prompt injection logic instead of central brand memory.
   - Limited caching for brand loads / preference weights (hot path).
   - Error handling / fallbacks inconsistent in memory loads.
   - No central "record generation for learning" hook in orchestrators.
   - Queue/worker recovery exists but observability thin.
   - Some routes use client supabase in server contexts.

5. **Other**:
   - Dead code (unused brandMemory utils).
   - Potential column mismatches (e.g. brand_memories vs utils code).
   - Some crons / jobs may assume tables that need verification.

## Artifacts Structure (this is the "clean room" for improved logic)
artifacts/
  backend/
    core/
      brand-memory/     # Unified BrandMemory service (single source of truth + sync)
      analytics/        # Consolidated tracker (PostHog + internal + snapshots)
      feedback/         # Outcome + learning engine (EMA, ghost-test safe)
      scalability/      # Caches, resilience wrappers, batch helpers
    api/                # Example enhanced route facades (reference)
    data/               # Seed data, migration helpers, fixtures for brand
    integrations/
      posthog/
      social/
    types/              # Shared TS contracts (no drift)
  docs/

## Implementation Phases (non-visual)
- Phase 1 (this): Init structure + canonical types + unified brand-memory module (with sync, robust load, populate).
- Phase 2: Wire recording hooks into generation paths (lib/orchestrator/*, lib/engine/*, cinematic routes) — call recordGeneration + ensure outcome endpoints used.
- Phase 3: Update preference_weights learning + make brand-brain store the truth for best settings.
- Phase 4: Centralize analytics events + fix PostHog + internal snapshot robustness.
- Phase 5: Scalability: add TTL cache for brand loads, make loads resilient + batched, add usage guards.
- Phase 6: Fix schema drift (if needed add columns/migrations idempotent), deprecate dead paths.
- Phase 7: Enhance APIs (e.g. /api/brand/save now triggers sync to brand_brain; new or improved /api/brand-brain/sync).
- Phase 8: Self-verify (typecheck, health, simulate flows via scripts if possible). No UI diffs.

All new logic in artifacts/ first (as authoritative clean version). Then port/apply the fixes into the live lib/ + api/ by targeted edits (preserving all call sites and public APIs exactly).

Keep Ghost Test compliance (no emotion words in observations/prompts).

## Tech
- Keep: Next.js App Router, Supabase (admin for server), PostHog node/js.
- No new deps unless already in package.json.
- Prefer enhancing existing patterns.

This fixes functionality without touching any visual components.
