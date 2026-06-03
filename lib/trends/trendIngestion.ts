// Async Apify ingestion layer — called ONLY from cron jobs, never per request.
// Fetches raw trend data, transforms it via trendAggregator, and writes to cache.

import { supabaseAdmin } from "@/lib/supabase/admin";
import { trendAggregator, type RawTrendItem, type TrendPlatform, type TrendFingerprint } from "./trendAggregator";

// ── Cache TTLs (ms) ───────────────────────────────────────────────────────────

const CACHE_TTL_MS: Record<TrendPlatform, number> = {
  tiktok:    6  * 60 * 60 * 1000,
  instagram: 12 * 60 * 60 * 1000,
  youtube:   24 * 60 * 60 * 1000,
};

// ── Cache read ────────────────────────────────────────────────────────────────

export async function getCachedFingerprint(
  niche: string,
  platform: TrendPlatform,
): Promise<TrendFingerprint | null> {
  const { data } = await supabaseAdmin
    .from("trend_cache")
    .select("data, updated_at")
    .eq("niche", niche)
    .eq("platform", platform)
    .maybeSingle();

  if (!data) return null;

  const ageMs = Date.now() - new Date(data.updated_at as string).getTime();
  if (ageMs > CACHE_TTL_MS[platform]) return null;

  return data.data as TrendFingerprint;
}

// ── Cache write ───────────────────────────────────────────────────────────────

async function writeCache(
  niche: string,
  platform: TrendPlatform,
  fingerprint: TrendFingerprint,
): Promise<void> {
  await supabaseAdmin
    .from("trend_cache")
    .upsert(
      { niche, platform, data: fingerprint, updated_at: new Date().toISOString() },
      { onConflict: "niche,platform" },
    );
}

// ── Apify runner ──────────────────────────────────────────────────────────────

async function runApifyActor(
  actorId: string,
  input: Record<string, unknown>,
): Promise<unknown[]> {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) {
    console.warn("[trendIngestion] APIFY_API_KEY not set — skipping");
    return [];
  }

  const runRes = await fetch(
    `https://api.apify.com/v2/acts/${actorId}/runs?token=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );

  if (!runRes.ok) {
    console.error("[trendIngestion] Apify run error:", await runRes.text());
    return [];
  }

  const run = (await runRes.json()) as { data: { defaultDatasetId: string } };
  const datasetId = run.data.defaultDatasetId;

  const dataRes = await fetch(
    `https://api.apify.com/v2/datasets/${datasetId}/items?token=${apiKey}&limit=50`,
  );

  if (!dataRes.ok) return [];
  return (await dataRes.json()) as unknown[];
}

// ── Platform scrapers → RawTrendItem[] ───────────────────────────────────────

async function fetchTikTok(niche: string): Promise<RawTrendItem[]> {
  const raw = await runApifyActor("clockworks/tiktok-hashtag-scraper", {
    hashtags: [niche.replace(/\s+/g, "").toLowerCase()],
    resultsPerPage: 30,
    maxResults: 50,
  }) as Array<{ desc?: string; playCount?: number; diggCount?: number; shareCount?: number }>;

  return raw.map(i => ({
    platform: "tiktok" as TrendPlatform,
    title: i.desc,
    views: i.playCount,
    likes: i.diggCount,
    shares: i.shareCount,
  }));
}

async function fetchInstagram(niche: string): Promise<RawTrendItem[]> {
  const raw = await runApifyActor("apify/instagram-hashtag-scraper", {
    hashtags: [niche.replace(/\s+/g, "").toLowerCase()],
    resultsLimit: 30,
  }) as Array<{ caption?: string; likesCount?: number; videoPlayCount?: number; commentsCount?: number }>;

  return raw.map(i => ({
    platform: "instagram" as TrendPlatform,
    description: i.caption,
    views: i.videoPlayCount,
    likes: i.likesCount,
    shares: i.commentsCount,
  }));
}

async function fetchYouTube(niche: string): Promise<RawTrendItem[]> {
  const raw = await runApifyActor("streamers/youtube-scraper", {
    searchKeywords: [`${niche} shorts trending`],
    maxResults: 30,
    sortBy: "viewCount",
  }) as Array<{ title?: string; viewCount?: number; likeCount?: number; commentCount?: number }>;

  return raw.map(i => ({
    platform: "youtube" as TrendPlatform,
    title: i.title,
    views: i.viewCount,
    likes: i.likeCount,
    shares: i.commentCount,
  }));
}

// ── Public: refresh a niche across all platforms ──────────────────────────────

export async function refreshNiche(niche: string): Promise<void> {
  const fetchers: Array<[TrendPlatform, () => Promise<RawTrendItem[]>]> = [
    ["tiktok",    () => fetchTikTok(niche)],
    ["instagram", () => fetchInstagram(niche)],
    ["youtube",   () => fetchYouTube(niche)],
  ];

  await Promise.allSettled(
    fetchers.map(async ([platform, fetch]) => {
      try {
        const raw = await fetch();
        if (!raw.length) return;
        const fingerprint = trendAggregator(raw, niche, platform);
        await writeCache(niche, platform, fingerprint);
      } catch (err) {
        console.error(`[trendIngestion] Failed to refresh ${platform}/${niche}:`, err);
      }
    }),
  );
}

// ── Public: get cached multi-platform fingerprint (used in /api/generate) ────

export async function getTrendContext(
  niche: string,
): Promise<TrendFingerprint | null> {
  const platforms: TrendPlatform[] = ["tiktok", "instagram", "youtube"];
  const signals = await Promise.all(
    platforms.map(p => getCachedFingerprint(niche, p)),
  );

  const valid = signals.filter(Boolean) as TrendFingerprint[];
  if (!valid.length) return null;

  // Merge: union hook patterns, average engagement/velocity scores
  const merged: TrendFingerprint = {
    niche,
    platform: "merged",
    hookPatterns: [...new Set(valid.flatMap(s => s.hookPatterns))].slice(0, 10),
    formatPatterns: [...new Set(valid.flatMap(s => s.formatPatterns))].slice(0, 6),
    emotionalSignals: {
      curiosity:    avg(valid.map(s => s.emotionalSignals.curiosity)),
      emotion:      avg(valid.map(s => s.emotionalSignals.emotion)),
      authority:    avg(valid.map(s => s.emotionalSignals.authority)),
      shock:        avg(valid.map(s => s.emotionalSignals.shock)),
      storytelling: avg(valid.map(s => s.emotionalSignals.storytelling)),
    },
    topTranscriptSnippets: [...new Set(valid.flatMap(s => s.topTranscriptSnippets))].slice(0, 10),
    engagementScore: avg(valid.map(s => s.engagementScore)),
    velocityScore:   avg(valid.map(s => s.velocityScore)),
  };

  return merged;
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}
