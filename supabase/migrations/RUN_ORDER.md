# Omnyra — Supabase migration run order

Migrations in `supabase/migrations/` are NOT auto-ordered by name. Apply
them in the order below from the Supabase SQL editor (or via the CLI).
Each file is idempotent (`IF NOT EXISTS`, `CREATE OR REPLACE`, `ON
CONFLICT DO UPDATE`) so re-running is safe.

## Prerequisites (apply first if not already present)

These bootstrap tables are in `supabase/setup.sql`:
- `profiles`, `credits`, `credit_transactions`
- `brand_profiles`
- `handle_new_user()` trigger on auth.users

If you haven't already, run `setup.sql` once before any migration below.

## Migration order

| # | File | Adds | Depends on |
|---|------|------|------------|
| 1 | `create_renders_table.sql` | `renders` table + owner-only RLS | profiles |
| 2 | `create_rate_limits_table.sql` | rate_limits table | — |
| 3 | `add_onboarding_columns.sql` | profile onboarding columns | profiles |
| 4 | `events_table.sql` | global `events` stream + RLS | auth.users |
| 5 | `renders_pipeline_state.sql` | pipeline columns on renders | renders |
| 6 | `renders_status_rename.sql` | 4-stage status enum + `scene_urls` | renders |
| 7 | `render_events_table.sql` | `render_events` realtime stream | renders |
| 8 | `render_state_machine.sql` | BEFORE-UPDATE transition trigger | renders |
| 9 | `credit_ledger.sql` | ledger trigger + `credit_balances` view | credits, credit_transactions |
| 10 | `content_scores_table.sql` | per-render scoring projection | renders, events |
| 11 | `content_performance_table.sql` | per-template aggregates | renders, content_scores |
| 12 | `analytics_views.sql` | `top_templates`, `funnel_metrics`, `time_to_first_video`, `funnel_dropoff` | events, renders |
| 13 | `analytics_snapshots_table.sql` | append-only BI snapshots | auth.users |
| 14 | `system_insights_table.sql` | AGS audit log | — |
| 15 | `template_settings_table.sql` | template visibility + cost_multiplier | system_insights |
| 16 | `user_profiles_extended_table.sql` | personalisation row per user | auth.users |
| 17 | `user_profiles_extended_churn_overrides.sql` | + `suggested_template` | user_profiles_extended |
| 18 | `user_profiles_extended_growth_flags.sql` | + `onboarding_minimal`, `premium_unlocked_until` | user_profiles_extended |
| 19 | `recalculate_scores_schema.sql` | drops the events scoring trigger, adds `template_scores` + `user_scores`, ships the 3 batch RPCs (`recalculate_content_scores`, `recalculate_template_scores`, `recalculate_user_scores`) | renders, events, content_scores, user_profiles_extended |
| 20 | `revenue_layer.sql` | `user_revenue_state` + `revenue_events` | auth.users |
| 21 | `safe_mutation_rpcs.sql` | `try_deduct_credits`, `grant_credits_atomic`, `finalize_render`, `fail_render_atomic` | credits, renders, render_events, events |
| 22 | `rls_hardening.sql` | locks down client write policies (renders / credits / credit_transactions / content_scores) | (any) |
| 23 | `company_brain.sql` | `company_memory`, `roadmap_items`, `competitor_signals`, `marketing_assets` | system_insights |
| 24 | `pipeline_observability.sql` | `render_pipeline_jobs`, `render_state_derived` view, `render_stage_timings` view | renders, render_events |
| 25 | `product_intelligence.sql` | `product_behavior_graph`, `feature_lifecycle`, `generated_prds`, `feature_flags`, `ui_flow_proposals` | events |
| 26 | `offer_throttling.sql` | `offer_log` + `can_show_offer` + `log_offer_shown` RPCs | revenue_events, user_revenue_state |
| 27 | `avatar_pipeline_tables.sql` | `avatar_jobs`, `avatar_stage_ledger`, `external_api_cost_ledger` | auth.users |
| 28 | `rename_heygen_shots_column.sql` | rename `shot_plans.heygen_shots` → `avatar_shots` | shot_plans |
| 29 | `fix_render_assignment_constraint.sql` | drop `shots.render_assignment CHECK IN ('heygen','fal')`, re-add with `('avatar','fal')` | shots |
| 30 | `make_renders_bucket_public.sql` | `UPDATE storage.buckets SET public = true WHERE id = 'renders'` — fal.ai cannot download private bucket URLs | — |
| 31 | `system_insights_extend.sql` | ADD COLUMN: `insight_type`, `title`, `summary`, `metadata`, `severity`, `source`, `confidence_score`, `user_id`; 4 new indexes | system_insights |
| 32 | `creator_profiles_table.sql` | `creator_profiles` — user-curated identity memory used by Director Core (niche, tone, hooks, CTAs, quality_score) | auth.users |
| 33 | `brand_brain_tables.sql` | `generation_memory` (per-generation settings + outcome) + `preference_weights` (EMA weight maps per user) | auth.users |

## Notes

- **`rls_hardening.sql` should run LAST among schema migrations** because it inspects existing policies and prunes legacy ones.
- All `CREATE OR REPLACE FUNCTION` calls are idempotent; re-running them is the supported way to ship a function update.
- The state-machine trigger in `render_state_machine.sql` rejects illegal status transitions. To reconcile manually, set `SET LOCAL omnyra.bypass = 'on'` inside the same transaction.
- Score / analytics / strategy / marketing crons assume the migrations through row 24 are applied. Without them, the routes will error on missing tables.

## Cron schedule (vercel.json)

| Path | Schedule | Purpose |
|------|----------|---------|
| `/api/cron/recalculate-scores` | `*/15 * * * *` | Batch scoring (content / template / user) |
| `/api/cron/optimize-system` | `0 */6 * * *` | AGS recommendations + appliers |
| `/api/cron/aggregate-analytics` | `0 */6 * * *` | Analytics snapshots |
| `/api/cron/optimize-funnel` | `0 */12 * * *` | Funnel bottleneck detection |
| `/api/cron/company-strategy` | `0 3 * * *` | Strategic actions + roadmap sync |
| `/api/cron/generate-marketing-assets` | `0 4 * * *` | Marketing copy generation |
| `/api/cron/product-intelligence` | `0 5 * * 1` | Weekly product graph + PRD generation |
| `/api/cron/pipeline-worker` | `*/5 * * * *` | Resume orphaned pipeline jobs (crash recovery) |
| `/api/social/cron` | `0 0 * * *` | Social posts (legacy) |
| `/api/cron/monthly-summary` | `0 1 1 * *` | Monthly email summary |

## Environment variables

| Var | Used by | Required? |
|-----|---------|-----------|
| `CRON_SECRET` | All cron routes | Yes in prod (Vercel sets this for you) |
| `OMNYRA_AGS_AUTO_APPLY` | `lib/optimization/appliers.ts` (revenue + pricing actions) | Optional. Default off. Set `true` to arm. |
| `REVENUE_PRICE_PER_CREDIT` | revenue / analytics layer | Optional. Default `0.10`. |
| `ANTHROPIC_API_KEY` | Script gen + marketing assets + PRD generation | Yes |
| `ELEVENLABS_API_KEY` | Pipeline voice | Yes |
| `KLING_ACCESS_KEY` / `KLING_SECRET_KEY` | Pipeline motion (Kling) | Yes |
| `RUNWAY_API_KEY` / `PIKA_API_KEY` | Pipeline motion (alt) | Optional |
| `SYNCLABS_API_KEY` | Pipeline lipsync | Yes |
| `DEFAULT_VOICE_ID` | Pipeline fallback voice | Optional |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | Stripe webhook | Yes |
| `OMNYRA_ADMIN_USER_IDS` | `/api/admin/render/[id]/inspect` | Optional (comma-separated user IDs allowed to inspect any render) |
