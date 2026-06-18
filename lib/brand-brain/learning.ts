/**
 * lib/brand-brain/learning.ts — Creator performance learning loop
 *
 * Closes the prediction → reality gap:
 *   1. Records outcome signals (published, edited, rated) against renders
 *   2. Ingests real platform metrics (views, retention %, shares, saves)
 *   3. Derives Ghost Test–compliant behavioral observations from performance data
 *   4. Writes high-signal pattern observations to creator_memory
 *   5. Surfaces best-settings recommendations from history
 *
 * ══ GHOST TEST (enforced throughout) ══════════════════════════════════════════
 * Every observation stored in memory describes ONLY:
 *   ✓ Observable physical actions    — "character placed object on surface deliberately"
 *   ✓ Body language / posture        — "upright stance, direct forward gaze"
 *   ✓ Pacing / timing / rhythm       — "3-second pause before first spoken word"
 *   ✓ Eye-line / spatial direction   — "eye contact broken to look left, then returned"
 *   ✓ Viewer behavioral signals      — "stayed past the 15-second mark, replayed, shared"
 *   ✗ NEVER emotion labels           — not "excited", "emotional", "loved", "engaged"
 *   ✗ NEVER internal states          — not "audience felt connected", "creator was nervous"
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Tables used:
 *   renders          — source of truth per generated video (template, script, outcome columns)
 *   usage_logs       — action history (template, niche, speed mode)
 *   creator_memory   — persistent behavioral memory (creative_intelligence_schema.sql)
 *   performance_data — post-publish platform metrics (views, retention, shares)
 */

import { supabaseAdmin }             from "@/lib/supabase/admin";
import { updateMemoryFromGeneration } from "@/lib/user-memory";
import { recordOutcome as recordGenMemOutcome } from "@/lib/brand-brain/store";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OutcomeInput {
  generationId:  string;
  was_published: boolean;
  was_edited:    boolean;
  user_rating?:  number; // 1–5
}

export interface BestSettings {
  bestHookType:  string | null;
  bestEnergy:    number;          // 1–5 scale
  bestPacing:    "slow" | "measured" | "fast";
  bestTemplate:  string | null;
  topNiches:     string[];
  confidence:    "low" | "medium" | "high";
}

export interface CreatorHistoryAnalysis {
  totalGenerations:   number;
  publishRate:        number;
  editRate:           number;
  avgRating:          number;
  topHooks:           Array<{ hook: string; count: number; publishRate: number }>;
  topTemplates:       Array<{ template: string; count: number; publishRate: number }>;
  energyDistribution: Record<string, number>;
}

export interface PerformanceDataInput {
  renderId:          string;
  platform:          string;
  views:             number;
  likes?:            number;
  comments?:         number;
  shares?:           number;
  saves?:            number;
  retentionPct?:     number;  // 0–100 average watch %
  watchTimeSeconds?: number;  // average watch duration in seconds
  postUrl?:          string;
}

// ── Ghost Test behavioral vocabulary ─────────────────────────────────────────
//
// All observations written to creator_memory must draw from this vocabulary.
// Never use: excited, emotional, loves, happy, sad, engaged, resonated, felt.
// Always use: physical actions, timing, spatial direction, pacing, gaze, posture.

const RETENTION_OBSERVATIONS = {
  excellent: (pct: number, template: string, platform: string) =>
    `${template} on ${platform}: ${pct.toFixed(0)}% average retention. ` +
    `Viewers tracked the full visual arc without interrupting scrolling behavior. ` +
    `Physical pacing held forward momentum — deliberate action sequences with ` +
    `no extended static holds past 3 seconds. Replicate this rhythm.`,

  good: (pct: number, template: string, platform: string) =>
    `${template} on ${platform}: ${pct.toFixed(0)}% average retention. ` +
    `Viewers stayed through the primary action sequence. Scroll-away behavior ` +
    `began in the final third — the closing gesture or physical reveal may need ` +
    `to shift 5–8 seconds earlier to hold through the end.`,

  moderate: (pct: number, template: string, platform: string) =>
    `${template} on ${platform}: ${pct.toFixed(0)}% average retention. ` +
    `Viewers tracked through the opening physical action but attention fractured ` +
    `past the midpoint. Test: introduce a new physical element, environmental shift, ` +
    `or direct camera address at the 8–12 second mark to reset forward pull.`,

  low: (pct: number, template: string, platform: string) =>
    `${template} on ${platform}: ${pct.toFixed(0)}% average retention. ` +
    `Significant scroll-away in the first 15 seconds. The opening physical action — ` +
    `first gesture, eye-line direction, or subject movement — needs to create pull ` +
    `within 2–3 seconds. Test: open with decisive movement toward camera or a ` +
    `clear spatial reveal rather than static framing.`,

  critical: (pct: number, template: string, platform: string) =>
    `${template} on ${platform}: ${pct.toFixed(0)}% average retention. ` +
    `Rapid scroll-away in the first 5 seconds — opening visual action is not ` +
    `creating sufficient forward pull. Immediate structural change needed: ` +
    `open with physical movement toward camera, direct sustained eye contact, ` +
    `or a visible physical reveal at frame entry. Cut all static opening holds.`,
};

const SHARE_OBSERVATIONS = {
  high: (rate: number, template: string, platform: string) =>
    `${template} on ${platform}: ${(rate * 100).toFixed(1)}% share rate — ` +
    `one in ${Math.round(1 / rate)} viewers took the physical action of tapping share. ` +
    `This indicates a specific moment — a visual reveal, unexpected physical action, ` +
    `or clear declarative gesture — that activated immediate sharing behavior. ` +
    `Identify this moment and replicate its structural position in subsequent videos.`,

  moderate: (rate: number, template: string, platform: string) =>
    `${template} on ${platform}: ${(rate * 100).toFixed(1)}% share rate. ` +
    `Above-average sharing behavior suggests a specific timing or physical moment ` +
    `triggered viewer action. Include a clear visual surprise or decisive physical ` +
    `movement in the middle third of future ${template} videos.`,
};

const SAVE_OBSERVATIONS = {
  high: (rate: number, template: string, platform: string) =>
    `${template} on ${platform}: ${(rate * 100).toFixed(1)}% save rate. ` +
    `Viewers saved this to a personal collection — behavior indicating the visual ` +
    `composition, character posture, or environmental setup had reference value. ` +
    `The specific framing, lighting setup, or physical arrangement in this video ` +
    `should be documented and replicated.`,
};

const HOOK_PATTERNS: Record<"positive" | "negative", Record<string, (key: string) => string>> = {
  positive: {
    hook: (key: string) =>
      `Opening 3-second sequence using "${key}" structure held viewer gaze past the ` +
      `swipe threshold. First physical action or eye-line direction was clear and ` +
      `immediate — no delay before subject movement. Replicate this opening geometry.`,
    pacing: (key: string) =>
      `"${key}" pacing structure — deliberate physical action with measured pauses ` +
      `between movements — correlated with higher completion rate. Maintain this ` +
      `rhythm: action → brief hold → next action, without extended static periods.`,
    energy: (key: string) =>
      `"${key}" energy level produced sustained viewer tracking. Physical movements ` +
      `were neither too rapid (causing visual fatigue) nor too slow (losing forward ` +
      `momentum). Hold this tempo in subsequent videos.`,
    template: (key: string) =>
      `"${key}" template structure reached publish threshold with consistent output. ` +
      `Physical action sequence, script length, and visual rhythm held across ` +
      `multiple generations. Continue using this format.`,
  },
  negative: {
    hook: (key: string) =>
      `Opening with "${key}" structure showed early scroll-away before the 3-second ` +
      `mark. Substitute: open with a physical action rather than a static hold, ` +
      `or shift the first point of eye contact to frame entry rather than mid-sentence.`,
    pacing: (key: string) =>
      `"${key}" timing approach showed viewer attrition past the midpoint. ` +
      `Test compressing the primary action sequence by 30–40%, or add a physical ` +
      `reset point — a subject movement, camera direction shift, or environmental ` +
      `change — at the 8-second mark.`,
    energy: (key: string) =>
      `"${key}" energy level produced drop-off. Physical movements may be either ` +
      `too uniform (no variation in tempo) or too rapid (no rest points for the eye). ` +
      `Test adding a single 2–3 second deliberate pause with a held physical position.`,
    template: (key: string) =>
      `"${key}" template format showed lower publish rate than alternatives. ` +
      `Test modifying the structural sequence: move the physical reveal or key action ` +
      `to the first 5 seconds rather than building toward it.`,
  },
};

// ── Core: record outcome ──────────────────────────────────────────────────────

/**
 * Record a user's publish/edit/rating decision for a generated video.
 * Persists to the renders table and writes a Ghost Test–compliant behavioral
 * observation to creator_memory when the video was published.
 */
export async function processOutcome(
  userId:  string,
  outcome: OutcomeInput,
): Promise<void> {
  const { generationId, was_published, was_edited, user_rating } = outcome;

  // 1. Persist outcome signals to renders row
  const { error: updateErr } = await supabaseAdmin
    .from("renders")
    .update({
      was_published,
      was_edited,
      user_rating:  user_rating ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", generationId)
    .eq("user_id", userId);

  if (updateErr) {
    console.warn("[learning:processOutcome] renders update failed:", updateErr.message);
    return;
  }

  // Multi-brand automatic memory refinement: bump consistency score on good outcomes (Requirement 1)
  const { data: renderRow } = await supabaseAdmin
    .from("renders")
    .select("brand_profile_id")
    .eq("id", generationId)
    .maybeSingle();

  if (renderRow?.brand_profile_id && was_published) {
    const boost = (user_rating && user_rating >= 4) ? 4 : 2;
    // Safe read-modify-write for consistency_score bump + version
    const { data: currentBrand } = await supabaseAdmin
      .from("brand_profiles")
      .select("consistency_score")
      .eq("id", renderRow.brand_profile_id)
      .maybeSingle();

    const newScore = Math.min(95, ((currentBrand?.consistency_score as number) || 50) + boost);

    void Promise.resolve(
      supabaseAdmin
        .from("brand_profiles")
        .update({ consistency_score: newScore, last_trained_at: new Date().toISOString() })
        .eq("id", renderRow.brand_profile_id)
    ).then(async () => {
      const { data: fresh } = await supabaseAdmin.from("brand_profiles").select("*").eq("id", renderRow.brand_profile_id).maybeSingle();
      if (fresh) {
        await supabaseAdmin.from("brand_profile_versions").insert({
          brand_profile_id: renderRow.brand_profile_id,
          user_id: userId,
          snapshot: fresh,
          change_summary: `Auto-refined from published generation (rating ${user_rating ?? "n/a"}) — consistency +${boost}`,
          source: "auto-refinement",
          rating_context: generationId,
        });
      }
    }).catch(() => {});
  }

  // ── FIX: also update generation_memory (so brand-brain analytics + EMA weights see outcomes)
  void Promise.resolve(
    supabaseAdmin
      .from("generation_memory")
      .update({
        was_published,
        was_edited,
        user_rating: user_rating ?? null,
        outcome_recorded: true,
        outcome_at: new Date().toISOString(),
      })
      .eq("id", generationId)
      .eq("user_id", userId)
  ).then((r: any) => { if (r?.error) console.warn("[learning] gen_memory outcome update skipped:", r.error.message); })
   .catch((e: any) => console.warn("[learning] gen_memory outcome update skipped:", e?.message));

  // 2. Fetch render context for observation building
  const { data: render, error: renderErr } = await supabaseAdmin
    .from("renders")
    .select("template, script, video_url, audio_url")
    .eq("id", generationId)
    .single();

  if (renderErr || !render) {
    console.warn("[learning:processOutcome] render fetch failed:", renderErr?.message);
    return;
  }

  // 3. Write behavioral observation to creator_memory when published
  if (was_published) {
    const observation = buildPublishObservation(
      (render.template as string | null) ?? "cinematic",
      (render.script   as string | null),
      user_rating,
      was_edited,
    );

    await updateMemoryFromGeneration(userId, {
      type:    "behavioral_note",
      content: observation,
      metadata: {
        source:      "outcome_published",
        template:    render.template,
        render_id:   generationId,
        user_rating: user_rating ?? null,
        was_edited,
        ghost_test:  "observable_actions_only",
      },
    });

    console.info(
      `[OUTCOME_RECORDED] user=${userId} render=${generationId.slice(0, 8)} ` +
      `published=true edited=${was_edited} rating=${user_rating ?? "—"}`,
    );

    // Also record to generation_memory for preference weight learning
    void recordGenMemOutcome(userId, generationId, { was_published, was_edited, user_rating }).catch(() => {});
  } else {
    // Not published — log but don't write negative memory (too noisy, low signal)
    console.info(
      `[OUTCOME_RECORDED] user=${userId} render=${generationId.slice(0, 8)} ` +
      `published=false edited=${was_edited}`,
    );
    void recordGenMemOutcome(userId, generationId, { was_published, was_edited, user_rating }).catch(() => {});
  }
}

// ── Performance data ingestion ────────────────────────────────────────────────

/**
 * Ingest post-publish platform metrics for a render.
 *
 * Flow:
 *   1. Verify render belongs to user
 *   2. Upsert into performance_data table
 *   3. Derive Ghost Test–compliant behavioral observations
 *   4. Write high-signal observations to creator_memory
 *   5. Update the render's published status (mark as published if views > 0)
 */
export async function ingestPerformanceData(
  userId: string,
  data:   PerformanceDataInput,
): Promise<{ observationsWritten: number }> {
  // 1. Resolve render (ownership check + template context)
  const { data: render, error: renderErr } = await supabaseAdmin
    .from("renders")
    .select("id, template, script")
    .eq("id", data.renderId)
    .eq("user_id", userId)
    .single();

  if (renderErr || !render) {
    console.warn("[learning:ingestPerformanceData] render not found or access denied:", data.renderId);
    return { observationsWritten: 0 };
  }

  const template = (render.template as string | null) ?? "cinematic";

  // 2. Upsert into performance_data
  const { error: perfErr } = await supabaseAdmin
    .from("performance_data")
    .upsert(
      {
        render_id:        data.renderId,
        user_id:          userId,
        platform:         data.platform,
        post_url:         data.postUrl          ?? null,
        views:            data.views,
        likes:            data.likes             ?? 0,
        comments:         data.comments          ?? 0,
        shares:           data.shares            ?? 0,
        saves:            data.saves             ?? 0,
        retention_pct:    data.retentionPct      ?? null,
        watch_time_seconds: data.watchTimeSeconds ?? null,
        data_ingested_at: new Date().toISOString(),
      },
      { onConflict: "render_id,platform" },
    );

  if (perfErr) {
    // Non-fatal — still derive and write observations
    console.warn("[learning:ingestPerformanceData] performance_data upsert failed:", perfErr.message);
  }

  // 3. Auto-mark render as published if it has views and wasn't already
  if (data.views > 0) {
    void supabaseAdmin
      .from("renders")
      .update({ was_published: true })
      .eq("id", data.renderId)
      .eq("was_published", false);
  }

  // 4. Derive behavioral observations
  const observations = derivePerformanceObservations(data, template);
  if (!observations.length) {
    console.info(
      `[PERF_INGESTED] user=${userId} render=${data.renderId.slice(0, 8)} ` +
      `views=${data.views} retention=${data.retentionPct ?? "—"}% — no high-signal observations`,
    );
    return { observationsWritten: 0 };
  }

  // 5. Write each high-signal observation to creator_memory (sequential to avoid hammering DB)
  let written = 0;
  for (const obs of observations) {
    try {
      await updateMemoryFromGeneration(userId, {
        type:    "audience_pattern",
        content: obs,
        metadata: {
          source:        "performance_ingest",
          platform:      data.platform,
          views:         data.views,
          retention_pct: data.retentionPct ?? null,
          share_rate:    data.shares && data.views ? data.shares / data.views : null,
          save_rate:     data.saves  && data.views ? data.saves  / data.views : null,
          render_id:     data.renderId,
          ghost_test:    "behavioral_signals_only",
        },
      });
      written++;
    } catch (err) {
      console.warn("[learning:ingestPerformanceData] observation write failed:", err);
    }
  }

  console.info(
    `[PERF_INGESTED] user=${userId} render=${data.renderId.slice(0, 8)} ` +
    `views=${data.views.toLocaleString()} retention=${data.retentionPct ?? "—"}% ` +
    `shares=${data.shares ?? 0} saves=${data.saves ?? 0} ` +
    `observations_written=${written}`,
  );

  return { observationsWritten: written };
}

// ── History analysis ──────────────────────────────────────────────────────────

/**
 * Analyze the creator's full generation + publish history.
 * Joins renders with performance_data to surface behavioral patterns.
 * Ghost Test: all returned data describes pacing/timing/structural signals.
 */
export async function analyzeCreatorHistory(userId: string): Promise<CreatorHistoryAnalysis> {
  const [rendersRes, perfRes] = await Promise.all([
    supabaseAdmin
      .from("renders")
      .select("id, template, was_published, was_edited, user_rating, completed_at, script")
      .eq("user_id", userId)
      .order("completed_at", { ascending: false })
      .limit(150),

    supabaseAdmin
      .from("performance_data")
      .select("render_id, platform, views, retention_pct, shares, saves")
      .eq("user_id", userId)
      .order("data_ingested_at", { ascending: false })
      .limit(150),
  ]);

  const renders    = rendersRes.data ?? [];
  const perfRows   = perfRes.data    ?? [];
  const total      = renders.length;

  if (total === 0) return emptyHistory();

  // Build a performance lookup by render ID
  const perfByRender = new Map<string, typeof perfRows[0]>();
  for (const p of perfRows) {
    if (!perfByRender.has(p.render_id)) {
      perfByRender.set(p.render_id, p);
    }
  }

  // Aggregates
  const published  = renders.filter(r => r.was_published);
  const edited     = renders.filter(r => r.was_edited);
  const rated      = renders.filter(r => r.user_rating != null);
  const avgRating  = rated.length
    ? parseFloat((rated.reduce((s, r) => s + (r.user_rating as number), 0) / rated.length).toFixed(2))
    : 0;

  // Template scoring: count, publish rate, avg retention, avg watch time
  const templateMap: Record<string, {
    count:        number;
    published:    number;
    retentionSum: number;
    retentionN:   number;
    scriptWords:  number[];
  }> = {};

  for (const r of renders) {
    const t   = (r.template as string | null) ?? "unknown";
    const pid = r.id as string;
    const pf  = perfByRender.get(pid);

    templateMap[t] ??= { count: 0, published: 0, retentionSum: 0, retentionN: 0, scriptWords: [] };
    templateMap[t].count++;
    if (r.was_published) templateMap[t].published++;
    if (pf?.retention_pct != null) {
      templateMap[t].retentionSum += pf.retention_pct as number;
      templateMap[t].retentionN++;
    }
    const wc = r.script ? (r.script as string).trim().split(/\s+/).length : 0;
    if (wc > 0) templateMap[t].scriptWords.push(wc);
  }

  const topTemplates = Object.entries(templateMap)
    .sort((a, b) => {
      // Rank by publish rate first, then total count
      const prA = a[1].published / a[1].count;
      const prB = b[1].published / b[1].count;
      return prB !== prA ? prB - prA : b[1].count - a[1].count;
    })
    .slice(0, 5)
    .map(([template, stats]) => ({
      template,
      count:       stats.count,
      publishRate: parseFloat((stats.published / stats.count).toFixed(3)),
    }));

  // Energy distribution: inferred from script word count
  // Short (<60 words) → fast, Medium (60–120) → measured, Long (>120) → slow
  const energyDist: Record<string, number> = { fast: 0, measured: 0, slow: 0 };
  for (const r of renders) {
    const wc = r.script ? (r.script as string).trim().split(/\s+/).length : 0;
    if (wc < 60)       energyDist.fast++;
    else if (wc <= 120) energyDist.measured++;
    else               energyDist.slow++;
  }

  return {
    totalGenerations: total,
    publishRate:      published.length  / total,
    editRate:         edited.length     / total,
    avgRating,
    topHooks:         [],     // hook-level tracking requires a separate hooks column — not yet tracked
    topTemplates,
    energyDistribution: energyDist,
  };
}

// ── Best settings ─────────────────────────────────────────────────────────────

/**
 * Return the recommended generation settings based on creator history.
 * Confidence calibrates to how much real publish data is available.
 * Ghost Test: recommendations are structural/behavioral, not emotional.
 */
export async function getBestSettings(userId: string): Promise<BestSettings> {
  const [history, memoryRes] = await Promise.all([
    analyzeCreatorHistory(userId),
    // Pull recent behavioral patterns from creator_memory for pacing signal
    supabaseAdmin
      .from("creator_memory")
      .select("content, metadata, created_at")
      .eq("user_id", userId)
      .in("memory_type", ["behavioral_note", "audience_pattern"])
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const memRows = memoryRes.data ?? [];

  // Derive pacing from energy distribution
  const { fast, measured, slow } = history.energyDistribution as Record<string, number>;
  const dominant = Object.entries({ fast, measured, slow })
    .sort((a, b) => (b[1] as number) - (a[1] as number))[0]?.[0] as "fast" | "measured" | "slow";

  // Refine pacing: if the top template has high publish rate, use its energy
  const bestTemplate = history.topTemplates.find(t => t.publishRate > 0.5) ?? history.topTemplates[0];

  // Energy score: check recent memory for pacing signals
  let energyScore = 3; // default mid
  const pacingHits = memRows.filter(r =>
    (r.content as string).toLowerCase().includes("pacing") ||
    (r.content as string).toLowerCase().includes("rhythm") ||
    (r.content as string).toLowerCase().includes("tempo"),
  );
  if (pacingHits.length >= 3) {
    const hasFast    = pacingHits.some(r => (r.content as string).includes("fast") || (r.content as string).includes("rapid"));
    const hasMeasured = pacingHits.some(r => (r.content as string).includes("deliberate") || (r.content as string).includes("measured"));
    energyScore = hasFast ? 4 : hasMeasured ? 3 : 2;
  }

  const confidence: BestSettings["confidence"] =
    history.totalGenerations >= 20 ? "high"
    : history.totalGenerations >= 5 ? "medium"
    : "low";

  return {
    bestHookType:  bestTemplate?.template ?? null,
    bestEnergy:    energyScore,
    bestPacing:    dominant ?? "measured",
    bestTemplate:  bestTemplate?.template ?? null,
    topNiches:     [],  // niche tracking requires brand_profiles.niche — surfaced separately
    confidence,
  };
}

// ── Pattern reinforcement ─────────────────────────────────────────────────────

/**
 * Write a reinforcement signal to creator_memory.
 * signal > 0 → reinforce (replicate this behavior)
 * signal < 0 → suppress (modify or avoid this pattern)
 *
 * Ghost Test: all observations use the behavioral vocabulary above.
 * Callers pass the key that describes the behavioral approach — not how it "felt."
 */
export async function reinforcePattern(
  userId:    string,
  dimension: "hook" | "energy" | "pacing" | "template",
  key:       string,
  signal:    number,
): Promise<void> {
  const polarity = signal > 0 ? "positive" : "negative";
  const builder  = HOOK_PATTERNS[polarity][dimension];
  const content  = builder
    ? builder(key)
    : `${dimension} "${key}" ${signal > 0 ? "held viewer tracking" : "showed attrition"}.`;

  await updateMemoryFromGeneration(userId, {
    type:    "behavioral_note",
    content,
    metadata: {
      dimension,
      key,
      signal,
      source:     "reinforce_pattern",
      ghost_test: "behavioral_signals_only",
    },
  });

  console.info(
    `[PATTERN_REINFORCED] user=${userId} dimension=${dimension} key="${key}" ` +
    `signal=${signal > 0 ? "+" : ""}${signal}`,
  );
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Build a Ghost Test–compliant publish observation from render metadata.
 * Infers structural patterns from script word count and template type.
 * Never names emotions — describes script length, timing, and action structure.
 */
function buildPublishObservation(
  template:   string,
  script:     string | null,
  rating:     number | undefined,
  wasEdited:  boolean,
): string {
  const wordCount   = script ? script.trim().split(/\s+/).length : 0;
  const durEstimate = wordCount > 0
    ? `~${Math.round(wordCount / 2.5)} seconds of spoken content`
    : "duration not measured";

  // Infer pacing from word count
  const pacingNote = wordCount < 60
    ? "rapid delivery with short declarative phrases"
    : wordCount <= 120
    ? "measured pace with deliberate pauses between statements"
    : "extended arc with multiple physical beats across the full 25–30s duration";

  const editNote = wasEdited
    ? " Creator refined before publishing — structural adjustment was made to the generated output before it reached the publish threshold."
    : " Published without editing — generated structure held as-is through to publish.";

  const ratingNote = rating != null
    ? ` Creator rating: ${rating}/5.`
    : "";

  return (
    `Published ${template} video (${durEstimate}, ${wordCount} words, ${pacingNote}).` +
    editNote + ratingNote +
    ` Observable pattern: physical pacing and visual rhythm held through full 25–30s arc — ` +
    `this structure reached the creator's publish threshold. Replicate timing and action density.`
  );
}

/**
 * Derive high-signal behavioral observations from platform performance data.
 * Only writes observations that cross a significance threshold — avoids noise.
 * Ghost Test: describes viewer behavioral signals, not emotional responses.
 */
function derivePerformanceObservations(
  data:     PerformanceDataInput,
  template: string,
): string[] {
  const observations: string[] = [];
  const { views, retentionPct, shares, saves, platform } = data;

  // ── Retention: highest-signal metric ────────────────────────────────────
  if (retentionPct != null) {
    if (retentionPct >= 80) {
      observations.push(RETENTION_OBSERVATIONS.excellent(retentionPct, template, platform));
    } else if (retentionPct >= 65) {
      observations.push(RETENTION_OBSERVATIONS.good(retentionPct, template, platform));
    } else if (retentionPct >= 50) {
      observations.push(RETENTION_OBSERVATIONS.moderate(retentionPct, template, platform));
    } else if (retentionPct >= 35) {
      observations.push(RETENTION_OBSERVATIONS.low(retentionPct, template, platform));
    } else {
      // Only write critical observation when we have enough views to trust the signal
      if (views >= 200) {
        observations.push(RETENTION_OBSERVATIONS.critical(retentionPct, template, platform));
      }
    }
  }

  // ── Share rate: social spread behavioral signal ──────────────────────────
  if (shares && views >= 100) {
    const shareRate = shares / views;
    if (shareRate >= 0.10) {
      observations.push(SHARE_OBSERVATIONS.high(shareRate, template, platform));
    } else if (shareRate >= 0.04) {
      observations.push(SHARE_OBSERVATIONS.moderate(shareRate, template, platform));
    }
  }

  // ── Save rate: reference value behavioral signal ─────────────────────────
  if (saves && views >= 100) {
    const saveRate = saves / views;
    if (saveRate >= 0.08) {
      observations.push(SAVE_OBSERVATIONS.high(saveRate, template, platform));
    }
  }

  // ── Watch time (when retention % is unavailable) ─────────────────────────
  if (retentionPct == null && data.watchTimeSeconds != null && data.watchTimeSeconds > 0) {
    const videoDurationEstimate = 28; // assume 28s if not known
    const impliedRetention = Math.min(100, (data.watchTimeSeconds / videoDurationEstimate) * 100);
    if (impliedRetention >= 65 || impliedRetention < 40) {
      // Recurse with derived retention — only for clear high/low signals
      const derived = derivePerformanceObservations(
        { ...data, retentionPct: impliedRetention },
        template,
      );
      observations.push(...derived.filter(o => !observations.includes(o)));
    }
  }

  return observations;
}

function emptyHistory(): CreatorHistoryAnalysis {
  return {
    totalGenerations:    0,
    publishRate:         0,
    editRate:            0,
    avgRating:           0,
    topHooks:            [],
    topTemplates:        [],
    energyDistribution:  { fast: 0, measured: 0, slow: 0 },
  };
}
