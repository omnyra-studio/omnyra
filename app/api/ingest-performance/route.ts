import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ApifyClient } from "apify-client";

// ── Apify actor IDs — configure via environment variables ──────────────────────
const ACTOR_IDS = {
  tiktok:         process.env.APIFY_ACTOR_TIKTOK         ?? "clockworks/tiktok-scraper",
  instagram:      process.env.APIFY_ACTOR_INSTAGRAM      ?? "apify/instagram-scraper",
  youtube_shorts: process.env.APIFY_ACTOR_YOUTUBE_SHORTS ?? "streamers/youtube-scraper",
} as const;

type Platform = keyof typeof ACTOR_IDS;

// ── Types ──────────────────────────────────────────────────────────────────────

type Sentiment = "performed_well" | "average" | "flopped";

interface UrlBody {
  url: string;
  projectId: string;
}

interface ManualBody {
  manual: {
    views: number;
    engagement: number;
    sentiment: Sentiment;
  };
  projectId: string;
}

type RequestBody = UrlBody | ManualBody;

interface ScrapedMetrics {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  postedAt: string | null;
  caption: string | null;
}

// ── Platform detection ─────────────────────────────────────────────────────────

function detectPlatform(url: string): Platform | null {
  try {
    const { hostname, pathname } = new URL(url);
    if (hostname.includes("tiktok.com")) return "tiktok";
    if (hostname.includes("instagram.com")) return "instagram";
    if (
      hostname.includes("youtube.com") &&
      (pathname.includes("/shorts/") || pathname.includes("shorts"))
    )
      return "youtube_shorts";
    if (hostname.includes("youtu.be")) return "youtube_shorts";
  } catch {
    // malformed URL
  }
  return null;
}

// ── Apify scraping ─────────────────────────────────────────────────────────────

async function scrapePost(url: string, platform: Platform): Promise<ScrapedMetrics> {
  const client = new ApifyClient({ token: process.env.APIFY_API_TOKEN });

  const inputByPlatform: Record<Platform, Record<string, unknown>> = {
    tiktok: {
      postURLs: [url],
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
    },
    instagram: {
      directUrls: [url],
      resultsType: "posts",
      resultsLimit: 1,
    },
    youtube_shorts: {
      startUrls: [{ url }],
      maxResults: 1,
    },
  };

  const run = await client.actor(ACTOR_IDS[platform]).call(inputByPlatform[platform], {
    // 90-second timeout — Apify actors typically finish well within this
    timeoutSecs: 90,
  } as Parameters<ReturnType<typeof client.actor>["call"]>[1]);

  const { items } = await client.dataset(run.defaultDatasetId).listItems({ limit: 1 });

  if (!items.length) {
    throw new Error("Actor returned no items for this URL");
  }

  const item = items[0] as Record<string, unknown>;

  // Normalise the different field names across platforms
  const views =
    (item.playCount as number) ??
    (item.videoPlayCount as number) ??
    (item.viewCount as number) ??
    (item.views as number) ??
    0;

  const likes =
    (item.diggCount as number) ??
    (item.likesCount as number) ??
    (item.likes as number) ??
    0;

  const comments =
    (item.commentCount as number) ??
    (item.commentsCount as number) ??
    (item.comments as number) ??
    0;

  const shares =
    (item.shareCount as number) ??
    (item.sharesCount as number) ??
    (item.shares as number) ??
    0;

  const saves =
    (item.collectCount as number) ??
    (item.bookmarkCount as number) ??
    (item.saves as number) ??
    0;

  const postedAt =
    (item.createTime as string) ??
    (item.timestamp as string) ??
    (item.takenAtTimestamp as string) ??
    null;

  const caption =
    (item.text as string) ??
    (item.caption as string) ??
    (item.description as string) ??
    null;

  return { views, likes, comments, shares, saves, postedAt, caption };
}

// ── Scoring helpers ────────────────────────────────────────────────────────────

/** 0-100 score: weighted engagement rate-style composite */
function computeActualScore(
  views: number,
  likes: number,
  comments: number,
  shares: number,
  saves: number,
): number {
  if (views === 0) return 0;
  const engagementRate = (likes + comments * 2 + shares * 3 + saves * 4) / views;
  // Cap at 100, typical high-performing rate ~0.05–0.15
  return Math.min(100, Math.round(engagementRate * 700));
}

/** Returns 0-100 actual score inferred from sentiment + raw engagement */
function scoreFromManual(
  views: number,
  engagement: number,
  sentiment: Sentiment,
): number {
  const baseRate = views > 0 ? engagement / views : 0;
  const base = Math.min(80, Math.round(baseRate * 700));

  const sentimentBoost: Record<Sentiment, number> = {
    performed_well: 20,
    average: 0,
    flopped: -20,
  };

  return Math.max(0, Math.min(100, base + sentimentBoost[sentiment]));
}

// ── Handler ────────────────────────────────────────────────────────────────────

/**
 * POST /api/ingest-performance
 *
 * Accepts either a social media URL (scrapes metrics via Apify) or a manual
 * entry fallback. Compares to the latest brief prediction and stores the
 * delta in creator_memory to power the "What Omnyra Learned" surface.
 */
export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
  );

  // ── Auth ─────────────────────────────────────────────────────────────────────
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse body ───────────────────────────────────────────────────────────────
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { projectId } = body;
  if (!projectId?.trim()) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const isManual = "manual" in body;
  const isUrl = "url" in body && typeof (body as UrlBody).url === "string";

  if (!isManual && !isUrl) {
    return NextResponse.json(
      { error: "Provide either { url } for scraping or { manual } for manual entry" },
      { status: 400 },
    );
  }

  // ── Fetch the latest predicted score for this project ────────────────────────
  const { data: latestBrief } = await supabase
    .from("briefs")
    .select("id, confidence_score, recommended_angle")
    .eq("project_id", projectId)
    .order("generated_at", { ascending: false })
    .limit(1)
    .single();

  const predictedScore = latestBrief?.confidence_score != null
    ? latestBrief.confidence_score * 100
    : null;

  // ── Scrape or use manual data ─────────────────────────────────────────────────
  let views: number;
  let likes = 0;
  let comments = 0;
  let shares = 0;
  let saves = 0;
  let postedAt: string | null = null;
  let sentiment: Sentiment | null = null;
  let source: string;
  let platform: string;
  let postUrl: string | null = null;

  if (isManual) {
    const { manual } = body as ManualBody;

    if (
      typeof manual.views !== "number" ||
      typeof manual.engagement !== "number" ||
      !["performed_well", "average", "flopped"].includes(manual.sentiment)
    ) {
      return NextResponse.json(
        { error: "manual requires: views (number), engagement (number), sentiment ('performed_well' | 'average' | 'flopped')" },
        { status: 400 },
      );
    }

    views = manual.views;
    likes = manual.engagement;
    sentiment = manual.sentiment;
    source = "manual";
    platform = "unknown";
  } else {
    const { url } = body as UrlBody;
    postUrl = url;

    const detected = detectPlatform(url);
    if (!detected) {
      return NextResponse.json(
        {
          error: "Couldn't detect platform from this URL. Supported: TikTok, Instagram, YouTube Shorts.",
          fallback: "Couldn't access this post's metrics. Try manual entry — three fields, thirty seconds.",
        },
        { status: 422 },
      );
    }

    platform = detected;

    try {
      const scraped = await scrapePost(url, detected);
      views = scraped.views;
      likes = scraped.likes;
      comments = scraped.comments;
      shares = scraped.shares;
      saves = scraped.saves;
      postedAt = scraped.postedAt;
      source = "apify";
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown scraping error";
      console.error("[ingest-performance] Apify error:", msg);
      return NextResponse.json(
        {
          error: "Couldn't access this post's metrics. Try manual entry — three fields, thirty seconds.",
          detail: msg,
        },
        { status: 502 },
      );
    }
  }

  // ── Compute actual score ─────────────────────────────────────────────────────
  const actualScore = isManual && sentiment
    ? scoreFromManual(views, likes, sentiment)
    : computeActualScore(views, likes, comments, shares, saves);

  // ── Store performance_data ───────────────────────────────────────────────────
  const { data: perfRow, error: perfErr } = await supabase
    .from("performance_data")
    .insert({
      project_id: projectId,
      platform,
      post_url: postUrl,
      views,
      likes,
      comments,
      shares,
      saves,
      predicted_score: predictedScore,
      actual_score: actualScore,
      posted_at: postedAt,
      data_ingested_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (perfErr) {
    console.error("[ingest-performance] performance_data insert error:", perfErr);
    return NextResponse.json({ error: perfErr.message }, { status: 500 });
  }

  // ── Compute delta and flag significant divergences ────────────────────────────
  const delta =
    predictedScore != null ? Math.abs(actualScore - predictedScore) : null;
  const significantDelta = delta != null && delta > 20;

  // Detect qualitative/quantitative divergence:
  // e.g. high views marked 'flopped' → unusual signal
  const highViewsButNegativeSentiment =
    isManual && sentiment === "flopped" && views > 50_000;
  const lowViewsButPositiveSentiment =
    isManual && sentiment === "performed_well" && views < 5_000;
  const qualitativeQuantitativeDivergence =
    highViewsButNegativeSentiment || lowViewsButPositiveSentiment;

  // ── Write creator_memory entry if signal is meaningful ───────────────────────
  const memoryNote = [
    significantDelta
      ? `Performance delta of ${Math.round(delta!)}pts vs prediction (predicted ${Math.round(predictedScore!)}%, actual ${Math.round(actualScore)}%).`
      : null,
    qualitativeQuantitativeDivergence
      ? highViewsButNegativeSentiment
        ? `Quantitative/qualitative divergence: ${views.toLocaleString()} views but creator marked 'flopped' — strong signal about audience mismatch or context.`
        : `Quantitative/qualitative divergence: only ${views.toLocaleString()} views but creator marked 'performed_well' — signals quality over reach.`
      : null,
    latestBrief?.recommended_angle
      ? `Brief angle was: "${latestBrief.recommended_angle}".`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  if (memoryNote || significantDelta || qualitativeQuantitativeDivergence) {
    const { error: memErr } = await supabase.from("creator_memory").insert({
      user_id: user.id,
      memory_type: "performance_pattern",
      content: memoryNote || `Performance recorded for ${platform}: ${views.toLocaleString()} views, score ${Math.round(actualScore)}/100.`,
      metadata: {
        project_id: projectId,
        platform,
        views,
        actual_score: actualScore,
        predicted_score: predictedScore,
        delta,
        sentiment: sentiment ?? null,
        flagged_for_insights: significantDelta || qualitativeQuantitativeDivergence,
        qualitative_quantitative_divergence: qualitativeQuantitativeDivergence,
      },
      source_project_id: projectId,
    });

    if (memErr) {
      console.warn("[ingest-performance] creator_memory insert warning:", memErr);
    }
  }

  // ── Build comparison_to_prediction ───────────────────────────────────────────
  let comparisonToPrediction: string;
  if (predictedScore == null) {
    comparisonToPrediction = "No prediction to compare against — no brief was generated for this project.";
  } else if (actualScore > predictedScore + 20) {
    comparisonToPrediction = `Significantly outperformed: actual ${Math.round(actualScore)} vs predicted ${Math.round(predictedScore)}. +${Math.round(delta!)} pts. Omnyra underestimated this.`;
  } else if (actualScore < predictedScore - 20) {
    comparisonToPrediction = `Underperformed: actual ${Math.round(actualScore)} vs predicted ${Math.round(predictedScore)}. −${Math.round(delta!)} pts. The predicted angle didn't land as expected.`;
  } else {
    comparisonToPrediction = `Within expected range: actual ${Math.round(actualScore)} vs predicted ${Math.round(predictedScore)}. Δ${Math.round(delta!)} pts.`;
  }

  // ── Response ─────────────────────────────────────────────────────────────────
  return NextResponse.json({
    success: true,
    data: {
      performance_id: perfRow.id,
      views,
      likes,
      comments,
      shares,
      saves,
      sentiment: sentiment ?? null,
      actual_score: Math.round(actualScore),
      predicted_score: predictedScore != null ? Math.round(predictedScore) : null,
      delta: delta != null ? Math.round(delta) : null,
      flagged_for_insights: significantDelta || qualitativeQuantitativeDivergence,
      qualitative_quantitative_divergence: qualitativeQuantitativeDivergence,
      comparison_to_prediction: comparisonToPrediction,
      source,
      platform,
    },
  });
}
