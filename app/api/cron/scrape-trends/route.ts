/**
 * GET /api/cron/scrape-trends
 *
 * Scheduled every 6 hours by Vercel Cron (see vercel.json).
 * Runs Apify scrapers in parallel across 8 niches to populate
 * the trend_signals table used by Omnyra's brief-generation layer.
 *
 * Sources per niche:
 *   - google_trends  (apify/google-trends-scraper)
 *   - tiktok_scrape  (apify/tiktok-scraper)
 *   - reddit         (apify/reddit-scraper)
 *
 * Signals expire after 7 days; stale rows are cleaned up at the end.
 *
 * Cron security: Vercel injects `Authorization: Bearer <CRON_SECRET>`.
 */

import { ApifyClient } from 'apify-client';
import { createClient } from '@supabase/supabase-js';
import { cleanEnv } from '@/lib/supabase/admin';

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
type Source = 'google_trends' | 'tiktok_scrape' | 'reddit';
type Velocity = 'rising' | 'stable' | 'declining';

interface TrendSignal {
  source: Source;
  niche: Niche;
  keyword: string;
  signal_strength: number;
  velocity: Velocity;
  raw_data: Record<string, unknown>;
  scraped_at: string;
  expires_at: string;
}

// Supabase admin client — no user session needed for cron writes
function getDb() {
  return createClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY),
  );
}

function getApify() {
  return new ApifyClient({ token: process.env.APIFY_TOKEN });
}

const NOW = () => new Date().toISOString();
const EXPIRES = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

// ── Scrapers ──────────────────────────────────────────────────────────────────

async function scrapeGoogleTrends(apify: ApifyClient, niche: Niche): Promise<TrendSignal[]> {
  const run = await apify.actor('apify/google-trends-scraper').call(
    { searchTerms: [niche], geo: '', outputAsDataset: true },
    { waitSecs: 60 },
  );

  if (run.status !== 'SUCCEEDED') return [];

  const { items } = await apify.dataset(run.defaultDatasetId).listItems({ limit: 50 });
  const signals: TrendSignal[] = [];

  for (const item of items as Record<string, unknown>[]) {
    const keyword = String(item.keyword ?? item.query ?? niche);
    const value = Number(item.value ?? item.interestOverTime ?? item.relativeValue ?? 50);
    const isRising =
      item.isRising === true ||
      String(item.trend ?? '').toLowerCase() === 'rising' ||
      value > 70;

    signals.push({
      source: 'google_trends',
      niche,
      keyword,
      signal_strength: Math.min(100, Math.round(value)),
      velocity: isRising ? 'rising' : 'stable',
      raw_data: item,
      scraped_at: NOW(),
      expires_at: EXPIRES(),
    });
  }

  return signals;
}

async function scrapeTikTok(apify: ApifyClient, niche: Niche): Promise<TrendSignal[]> {
  const run = await apify.actor('apify/tiktok-scraper').call(
    {
      hashtags: [niche],
      resultsPerPage: 20,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
    },
    { waitSecs: 90 },
  );

  if (run.status !== 'SUCCEEDED') return [];

  const { items } = await apify.dataset(run.defaultDatasetId).listItems({ limit: 20 });
  const signals: TrendSignal[] = [];

  for (const item of items as Record<string, unknown>[]) {
    const views = Number(item.playCount ?? item.viewCount ?? 0);
    const likes = Number(item.diggCount ?? item.likeCount ?? 0);
    const comments = Number(item.commentCount ?? 0);
    const shares = Number(item.shareCount ?? 0);

    const engagementRate = views > 0
      ? (likes + comments * 2 + shares * 3) / views
      : 0;

    const signalStrength = Math.min(100, Math.round(engagementRate * 500 + (views > 100_000 ? 20 : 0)));

    // Extract hashtags from caption as keywords
    const caption = String(item.text ?? item.description ?? '');
    const hashtags = (caption.match(/#\w+/g) ?? [])
      .map(h => h.slice(1).toLowerCase())
      .filter(h => h.length > 2 && h !== niche);

    const keyword = hashtags[0] ?? (caption.slice(0, 60) || niche);

    signals.push({
      source: 'tiktok_scrape',
      niche,
      keyword,
      signal_strength: signalStrength,
      velocity: engagementRate > 0.05 ? 'rising' : 'stable',
      raw_data: {
        views,
        likes,
        comments,
        shares,
        hashtags,
        caption: caption.slice(0, 200),
        author: item.authorMeta ?? item.author,
      },
      scraped_at: NOW(),
      expires_at: EXPIRES(),
    });
  }

  return signals;
}

async function scrapeReddit(apify: ApifyClient, niche: Niche): Promise<TrendSignal[]> {
  // Map niches to the most relevant subreddits
  const subredditMap: Record<Niche, string> = {
    skincare: 'SkincareAddiction',
    fitness: 'fitness',
    finance: 'personalfinance',
    productivity: 'productivity',
    lifestyle: 'selfimprovement',
    beauty: 'beauty',
    tech: 'technology',
    food: 'food',
  };

  const subreddit = subredditMap[niche];

  const run = await apify.actor('apify/reddit-scraper').call(
    {
      startUrls: [{ url: `https://www.reddit.com/r/${subreddit}/hot/` }],
      maxItems: 20,
    },
    { waitSecs: 60 },
  );

  if (run.status !== 'SUCCEEDED') return [];

  const { items } = await apify.dataset(run.defaultDatasetId).listItems({ limit: 20 });
  const signals: TrendSignal[] = [];

  for (const item of items as Record<string, unknown>[]) {
    const score = Number(item.score ?? item.ups ?? 0);
    const comments = Number(item.numComments ?? item.num_comments ?? 0);
    const title = String(item.title ?? '');
    if (!title) continue;

    // Signal strength: log-scaled upvotes + comment weight
    const signalStrength = Math.min(100, Math.round(Math.log10(score + 1) * 20 + Math.log10(comments + 1) * 10));

    signals.push({
      source: 'reddit',
      niche,
      keyword: title.slice(0, 120),
      signal_strength: signalStrength,
      velocity: score > 1000 ? 'rising' : 'stable',
      raw_data: {
        title,
        score,
        comments,
        url: item.url ?? item.link,
        subreddit,
        sentiment: score > 500 ? 'positive' : 'neutral',
      },
      scraped_at: NOW(),
      expires_at: EXPIRES(),
    });
  }

  return signals;
}

// ── Niche processor ───────────────────────────────────────────────────────────

async function processNiche(
  apify: ApifyClient,
  niche: Niche,
): Promise<{ niche: Niche; signals: TrendSignal[]; errors: string[] }> {
  const errors: string[] = [];

  const results = await Promise.allSettled([
    scrapeGoogleTrends(apify, niche),
    scrapeTikTok(apify, niche),
    scrapeReddit(apify, niche),
  ]);

  const signals: TrendSignal[] = [];
  const labels: Source[] = ['google_trends', 'tiktok_scrape', 'reddit'];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    if (r.status === 'fulfilled') {
      signals.push(...r.value);
    } else {
      const msg = `[${niche}/${labels[i]}] ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`;
      console.error('[scrape-trends]', msg);
      errors.push(msg);
    }
  }

  return { niche, signals, errors };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = request.headers.get('authorization') ?? '';
    const provided = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
    if (provided !== cronSecret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const apify = getApify();
  const db = getDb();
  const startedAt = Date.now();

  // Process all niches in parallel, never crashing on individual failures
  const nicheResults = await Promise.allSettled(
    NICHES.map(niche => processNiche(apify, niche)),
  );

  const allSignals: TrendSignal[] = [];
  const allErrors: string[] = [];
  let nichesProcessed = 0;

  for (const result of nicheResults) {
    if (result.status === 'fulfilled') {
      allSignals.push(...result.value.signals);
      allErrors.push(...result.value.errors);
      nichesProcessed++;
    } else {
      allErrors.push(String(result.reason));
    }
  }

  // Batch insert signals (Supabase accepts up to 1000 rows per call)
  let signalsInserted = 0;
  if (allSignals.length > 0) {
    const BATCH = 500;
    for (let i = 0; i < allSignals.length; i += BATCH) {
      const { error } = await db
        .from('trend_signals')
        .insert(allSignals.slice(i, i + BATCH));

      if (error) {
        console.error('[scrape-trends] insert error:', error);
        allErrors.push(`Insert batch ${i / BATCH + 1}: ${error.message}`);
      } else {
        signalsInserted += Math.min(BATCH, allSignals.length - i);
      }
    }
  }

  // Cleanup expired signals
  const { error: cleanupErr, count: deletedCount } = await db
    .from('trend_signals')
    .delete({ count: 'exact' })
    .lt('expires_at', NOW());

  if (cleanupErr) {
    console.warn('[scrape-trends] cleanup warning:', cleanupErr);
  } else {
    console.log(`[scrape-trends] cleaned up ${deletedCount ?? 0} expired signals`);
  }

  const durationMs = Date.now() - startedAt;
  console.log(`[scrape-trends] done in ${durationMs}ms — ${nichesProcessed} niches, ${signalsInserted} signals, ${allErrors.length} errors`);

  return Response.json({
    success: allErrors.length < NICHES.length * 3,
    niches_processed: nichesProcessed,
    signals_found: allSignals.length,
    signals_inserted: signalsInserted,
    expired_deleted: deletedCount ?? 0,
    duration_ms: durationMs,
    errors: allErrors.length > 0 ? allErrors : undefined,
  });
}
