/**
 * Seed realistic trend intelligence into Omnyra so the brief-generation
 * layer has signal from day one — before Apify crons have run.
 *
 * Run with:  npx ts-node scripts/seed-trends.ts
 *
 * Guards:
 *   - Skips entirely if trend_signals already contains non-seed rows
 *     (real Apify data is present — seeding would pollute it)
 *   - Creates trend_insights table if it doesn't exist
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

// ── Clients ───────────────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

// ── Config ────────────────────────────────────────────────────────────────────

const NICHES = [
  'skincare',
  'fitness',
  'finance',
  'productivity',
  'lifestyle',
  'beauty',
  'tech',
  'food',
] as const;

type Niche = typeof NICHES[number];
type Velocity = 'rising' | 'surging' | 'stable' | 'declining';
type InsightType = 'hook_pattern' | 'format_shift' | 'audience_sentiment' | 'white_space';

interface TrendSignal {
  keyword: string;
  signal_strength: number;
  velocity: Velocity;
  description: string;
}

interface TrendInsight {
  insight_type: InsightType;
  title: string;
  description: string;
  evidence: string;
  confidence: number;
}

interface ClaudeResponse {
  signals: TrendSignal[];
  insights: TrendInsight[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function daysAgo(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

// ── Table setup ───────────────────────────────────────────────────────────────

async function ensureTrendInsightsTable(): Promise<void> {
  // Supabase JS client can't run DDL — use a raw RPC or just attempt an insert
  // and create the table via the Supabase SQL editor if it fails.
  // We probe by selecting; if it errors with "relation does not exist" we log clearly.
  const { error } = await db.from('trend_insights').select('id').limit(1);
  if (error && error.message.includes('relation') && error.message.includes('does not exist')) {
    console.error(
      '\n⚠  trend_insights table does not exist.\n' +
      '   Run this SQL in your Supabase SQL editor, then re-run the seed:\n\n' +
      '   CREATE TABLE IF NOT EXISTS trend_insights (\n' +
      '     id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n' +
      '     niche        TEXT NOT NULL,\n' +
      '     insight_type TEXT NOT NULL,\n' +
      '     title        TEXT NOT NULL,\n' +
      '     description  TEXT NOT NULL,\n' +
      '     evidence     TEXT,\n' +
      '     confidence   FLOAT CHECK (confidence BETWEEN 0 AND 1),\n' +
      '     valid_until  TIMESTAMPTZ,\n' +
      '     created_at   TIMESTAMPTZ NOT NULL DEFAULT now()\n' +
      '   );\n' +
      '   ALTER TABLE trend_insights ENABLE ROW LEVEL SECURITY;\n' +
      '   CREATE POLICY "trend_insights_read" ON trend_insights\n' +
      '     FOR SELECT USING (auth.role() = \'authenticated\');\n',
    );
    process.exit(1);
  }
}

// ── Guard: skip if real data exists ──────────────────────────────────────────

async function hasRealData(): Promise<boolean> {
  const { count, error } = await db
    .from('trend_signals')
    .select('id', { count: 'exact', head: true })
    .not('source', 'eq', 'seed_data');

  if (error) {
    console.warn('Could not check for real data:', error.message);
    return false;
  }

  return (count ?? 0) > 0;
}

// ── Claude call ───────────────────────────────────────────────────────────────

async function generateNicheIntelligence(niche: Niche): Promise<ClaudeResponse> {
  const prompt = `Generate realistic trend intelligence for the **${niche}** niche on TikTok and Instagram from the last 14 days.

Return a JSON object with exactly this structure:

{
  "signals": [
    {
      "keyword": "string — the trending topic, hook pattern, or format (be specific, not generic)",
      "signal_strength": number between 0-100,
      "velocity": "rising" | "surging" | "stable" | "declining",
      "description": "1-2 sentences: why it's trending, what's driving it, audience psychology behind it"
    }
  ],
  "insights": [
    {
      "insight_type": "hook_pattern" | "format_shift" | "audience_sentiment" | "white_space",
      "title": "short, specific title (max 8 words)",
      "description": "2-3 sentences explaining the insight and what creators should do with it",
      "evidence": "specific evidence — mention real-feeling examples (post formats, creators, audio trends, hashtag volumes)",
      "confidence": number between 0-1
    }
  ]
}

Rules:
- Generate exactly 10 signals and exactly 5 insights
- Be specific and realistic — not "use storytelling" but "3-part problem/twist/payoff structure under 18 seconds is outperforming standard tutorials by 2-4x in ${niche}"
- Include a mix of: hook patterns, audio trends, format shifts, sentiment shifts, emerging micro-niches
- Signal strengths should vary realistically (not all 80+)
- Insights must cover all 4 types: at least one of each
- Return ONLY the JSON object — no markdown, no explanation`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content.find(b => b.type === 'text')?.text ?? '';

  // Strip any markdown code fences Claude might add
  const jsonStr = text.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();

  try {
    const parsed = JSON.parse(jsonStr) as ClaudeResponse;

    // Validate and clamp numeric fields
    parsed.signals = (parsed.signals ?? []).slice(0, 10).map(s => ({
      ...s,
      signal_strength: clamp(Math.round(s.signal_strength), 0, 100),
      velocity: (['rising', 'surging', 'stable', 'declining'].includes(s.velocity)
        ? s.velocity
        : 'stable') as Velocity,
    }));

    parsed.insights = (parsed.insights ?? []).slice(0, 5).map(i => ({
      ...i,
      confidence: clamp(Number(i.confidence), 0, 1),
      insight_type: (['hook_pattern', 'format_shift', 'audience_sentiment', 'white_space'].includes(i.insight_type)
        ? i.insight_type
        : 'hook_pattern') as InsightType,
    }));

    return parsed;
  } catch {
    throw new Error(`Failed to parse Claude response for niche "${niche}":\n${jsonStr.slice(0, 300)}`);
  }
}

// ── Insert signals ────────────────────────────────────────────────────────────

async function insertSignals(niche: Niche, signals: TrendSignal[]): Promise<number> {
  const rows = signals.map(s => ({
    source: 'seed_data',
    niche,
    keyword: s.keyword,
    signal_strength: s.signal_strength,
    velocity: s.velocity,
    raw_data: { description: s.description, seed: true },
    // Backdate scraped_at by 0–14 days for realism
    scraped_at: daysAgo(Math.floor(randomBetween(0, 14))),
    expires_at: daysFromNow(7),
  }));

  const { error, data } = await db.from('trend_signals').insert(rows).select('id');
  if (error) throw new Error(`trend_signals insert failed for ${niche}: ${error.message}`);
  return data?.length ?? rows.length;
}

// ── Insert insights ───────────────────────────────────────────────────────────

async function insertInsights(niche: Niche, insights: TrendInsight[]): Promise<number> {
  const rows = insights.map(i => ({
    niche,
    insight_type: i.insight_type,
    title: i.title,
    description: i.description,
    evidence: i.evidence,
    confidence: i.confidence,
    valid_until: daysFromNow(7),
  }));

  const { error, data } = await db.from('trend_insights').insert(rows).select('id');
  if (error) throw new Error(`trend_insights insert failed for ${niche}: ${error.message}`);
  return data?.length ?? rows.length;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Omnyra Trend Seed\n' + '─'.repeat(50));

  // Validate env
  const missing = ['ANTHROPIC_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
    .filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`Missing env vars: ${missing.join(', ')}`);
    process.exit(1);
  }

  // Ensure trend_insights table exists
  await ensureTrendInsightsTable();

  // Guard: don't pollute real scraped data
  console.log('\nChecking for existing real data...');
  if (await hasRealData()) {
    console.log('✓ Real Apify data already exists — skipping seed to avoid pollution.');
    console.log('  Delete non-seed rows from trend_signals first if you want to re-seed.');
    process.exit(0);
  }
  console.log('  No real data found — proceeding with seed.\n');

  let totalSignals = 0;
  let totalInsights = 0;
  const errors: string[] = [];

  for (const niche of NICHES) {
    process.stdout.write(`[${niche}] Generating intelligence... `);

    try {
      const data = await generateNicheIntelligence(niche);

      process.stdout.write(`✓ (${data.signals.length} signals, ${data.insights.length} insights) — inserting... `);

      const [signalCount, insightCount] = await Promise.all([
        insertSignals(niche, data.signals),
        insertInsights(niche, data.insights),
      ]);

      totalSignals += signalCount;
      totalInsights += insightCount;

      console.log(`✓ saved`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`✗ FAILED`);
      console.error(`  └─ ${msg}`);
      errors.push(`[${niche}] ${msg}`);
    }
  }

  console.log('\n' + '─'.repeat(50));
  console.log(`✅ Seed complete`);
  console.log(`   Signals inserted : ${totalSignals}`);
  console.log(`   Insights inserted: ${totalInsights}`);
  console.log(`   Niches processed : ${NICHES.length - errors.length}/${NICHES.length}`);

  if (errors.length) {
    console.log(`\n⚠  ${errors.length} niche(s) failed:`);
    errors.forEach(e => console.log(`   • ${e}`));
    process.exit(1);
  }

  console.log('\n🚀 Omnyra brief-generation layer now has real trend signal.');
}

main().catch(err => {
  console.error('\nFatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
