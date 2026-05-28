import { ApifyClient } from 'apify-client';

const client = new ApifyClient({ token: process.env.APIFY_TOKEN });

// Default actor — unified schema across all platforms
const DEFAULT_ACTOR = 'aaether/social-scraper';
const RUN_TIMEOUT_SECS = 60;

export type Platform = 'tiktok' | 'instagram' | 'youtube_shorts' | 'unknown';

export interface ScrapedMetrics {
  url: string;
  platform: Platform;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  caption: string | null;
  engagementRate: number | null;
  scrapedAt: string;
}

export interface ScrapeError {
  error: true;
  message: string;
  suggestion: string;
}

export type ScrapeResult = ScrapedMetrics | ScrapeError;

export function detectPlatform(url: string): Platform {
  if (/tiktok\.com/i.test(url)) return 'tiktok';
  if (/instagram\.com/i.test(url)) return 'instagram';
  if (/youtube\.com\/shorts|youtu\.be/i.test(url)) return 'youtube_shorts';
  return 'unknown';
}

function safeNum(val: unknown): number | null {
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

// Normalise the raw item returned by aaether/social-scraper (and fallback actors)
// into a consistent ScrapedMetrics shape. Field names vary by actor version, so
// we probe several common aliases.
function normalise(item: Record<string, unknown>, url: string, platform: Platform): ScrapedMetrics {
  const views =
    safeNum(item.playCount) ??
    safeNum(item.viewCount) ??
    safeNum(item.views) ??
    safeNum(item.videoViewCount) ??
    null;

  const likes =
    safeNum(item.diggCount) ??
    safeNum(item.likeCount) ??
    safeNum(item.likes) ??
    null;

  const comments =
    safeNum(item.commentCount) ??
    safeNum(item.comments) ??
    null;

  const shares =
    safeNum(item.shareCount) ??
    safeNum(item.shares) ??
    null;

  const saves =
    safeNum(item.collectCount) ??
    safeNum(item.saveCount) ??
    safeNum(item.saves) ??
    null;

  const caption =
    (typeof item.text === 'string' ? item.text : null) ??
    (typeof item.description === 'string' ? item.description : null) ??
    (typeof item.caption === 'string' ? item.caption : null) ??
    null;

  // Engagement rate: (likes + comments + shares) / views * 100
  let engagementRate: number | null = null;
  if (views && views > 0 && likes !== null) {
    const interactions = (likes ?? 0) + (comments ?? 0) + (shares ?? 0);
    engagementRate = Math.round((interactions / views) * 10000) / 100;
  }

  return {
    url,
    platform,
    views,
    likes,
    comments,
    shares,
    saves,
    caption,
    engagementRate,
    scrapedAt: new Date().toISOString(),
  };
}

export async function scrapePost(url: string): Promise<ScrapeResult> {
  if (!process.env.APIFY_TOKEN) {
    return {
      error: true,
      message: 'APIFY_TOKEN is not configured.',
      suggestion: 'Add APIFY_TOKEN to your .env.local and restart the dev server.',
    };
  }

  const platform = detectPlatform(url);

  if (platform === 'unknown') {
    return {
      error: true,
      message: `Unrecognised URL: ${url}`,
      suggestion: 'Paste a TikTok, Instagram, or YouTube Shorts URL.',
    };
  }

  try {
    const run = await client.actor(DEFAULT_ACTOR).call(
      { url },
      { waitSecs: RUN_TIMEOUT_SECS },
    );

    if (run.status !== 'SUCCEEDED') {
      return {
        error: true,
        message: `Actor run ended with status "${run.status}".`,
        suggestion: 'The post may be private or the scraper may be rate-limited. Try again in a few minutes, or enter the metrics manually.',
      };
    }

    const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: 1 });

    if (!items.length) {
      return {
        error: true,
        message: 'Scraper returned no data for this post.',
        suggestion: 'The post may be private, deleted, or the URL format is unsupported. Try entering metrics manually.',
      };
    }

    return normalise(items[0] as Record<string, unknown>, url, platform);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      error: true,
      message: `Scrape failed: ${message}`,
      suggestion: 'Apify may be unreachable or your token may be invalid. You can enter the metrics manually instead.',
    };
  }
}
