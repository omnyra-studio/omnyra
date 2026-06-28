/**
 * Trend signal loader — reads from the trend_signals table populated
 * by /api/cron/scrape-trends (Apify + Google Trends + TikTok + Reddit).
 *
 * Returns top rising keywords for a niche, injected into script generation
 * and Director AI prompts to bias output toward what's currently performing.
 *
 * Never throws — returns empty array on any failure (non-blocking).
 */

import { createClient } from "@supabase/supabase-js";

export interface TrendSignal {
  keyword:         string;
  signal_strength: number;  // 0–100
  velocity:        "rising" | "stable" | "declining";
  source:          "google_trends" | "tiktok_scrape" | "reddit";
}

export interface TrendContext {
  niche:   string;
  signals: TrendSignal[];
  // Simple formatted string for injection into prompts
  promptFragment: string;
}

/**
 * Fetch top N rising trends for a niche.
 * Falls back to empty context if DB unavailable or niche has no signals.
 */
export async function fetchTrendContext(
  niche:   string,
  limit:   number = 5,
): Promise<TrendContext> {
  const empty: TrendContext = { niche, signals: [], promptFragment: "" };

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return empty;

    const db = createClient(url, key);

    const { data, error } = await db
      .from("trend_signals")
      .select("keyword, signal_strength, velocity, source")
      .ilike("niche", `%${niche}%`)
      .in("velocity", ["rising"])
      .gt("signal_strength", 30)
      .order("signal_strength", { ascending: false })
      .limit(limit);

    if (error || !data?.length) return empty;

    const signals = data as TrendSignal[];
    const keywords = signals.map(s => s.keyword).join(", ");

    return {
      niche,
      signals,
      promptFragment: `CURRENT TRENDING TOPICS IN ${niche.toUpperCase()}: ${keywords}. Bias scripts toward these if relevant — do not force them in if they don't fit.`,
    };
  } catch {
    return empty;
  }
}

/**
 * Simple trend score for a niche keyword — 0 to 1.
 * Used to rank script variants in the response.
 */
export function computeTrendScore(
  niche:   string,
  signals: TrendSignal[],
): number {
  if (!signals.length) return 0.5; // neutral when no data
  const avg = signals.reduce((s, t) => s + t.signal_strength, 0) / signals.length;
  return Math.min(avg / 100, 1);
}
