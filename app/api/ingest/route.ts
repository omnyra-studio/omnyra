import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { scrapePost, type ScrapedMetrics } from '@/lib/apify';

type Sentiment = 'performed_well' | 'average' | 'flopped';

interface UrlBody {
  url: string;
  projectId?: string;
}

interface ManualBody {
  manual: {
    views: number;
    engagement: number;
    sentiment: Sentiment;
  };
  projectId?: string;
}

type RequestBody = UrlBody | ManualBody;

const VALID_SENTIMENTS: Sentiment[] = ['performed_well', 'average', 'flopped'];

/** Weighted composite 0-100 score from scraped metrics. */
function computeScore(views: number, likes: number, comments: number, shares: number, saves: number): number {
  if (views === 0) return 0;
  const rate = (likes + comments * 2 + shares * 3 + saves * 4) / views;
  return Math.min(100, Math.round(rate * 700));
}

/** Score inferred from manual entry — qualitative sentiment adjusts the numeric base. */
function scoreFromManual(views: number, engagement: number, sentiment: Sentiment): number {
  const base = views > 0 ? Math.min(80, Math.round((engagement / views) * 700)) : 0;
  const boost: Record<Sentiment, number> = { performed_well: 20, average: 0, flopped: -20 };
  return Math.max(0, Math.min(100, base + boost[sentiment]));
}

/** Detect qualitative/quantitative divergence worth flagging for learning. */
function checkDivergence(views: number, sentiment: Sentiment | null): boolean {
  if (!sentiment) return false;
  return (sentiment === 'flopped' && views > 50_000) ||
         (sentiment === 'performed_well' && views < 5_000);
}

export async function POST(request: Request) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  // ── Parse body ───────────────────────────────────────────────────────────────
  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const isManual = 'manual' in body && body.manual != null;
  const isUrl = 'url' in body && typeof (body as UrlBody).url === 'string' && (body as UrlBody).url.trim().length > 0;

  if (!isManual && !isUrl) {
    return Response.json({
      success: false,
      error: 'Provide { url } for scraping or { manual: { views, engagement, sentiment } } for manual entry.',
    }, { status: 400 });
  }

  // Validate manual fields up-front
  if (isManual) {
    const m = (body as ManualBody).manual;
    if (typeof m.views !== 'number' || typeof m.engagement !== 'number' || !VALID_SENTIMENTS.includes(m.sentiment)) {
      return Response.json({
        success: false,
        error: "manual requires: views (number), engagement (number), sentiment ('performed_well' | 'average' | 'flopped')",
      }, { status: 400 });
    }
  }

  const projectId = body.projectId?.trim() || null;

  // ── Fetch predicted score from the most recent brief (if projectId given) ──
  let predictedScore: number | null = null;
  let briefAngle: string | null = null;

  if (projectId) {
    const { data: brief } = await supabase
      .from('briefs')
      .select('confidence_score, recommended_angle')
      .eq('project_id', projectId)
      .order('generated_at', { ascending: false })
      .limit(1)
      .single();

    if (brief?.confidence_score != null) {
      predictedScore = Math.round(Number(brief.confidence_score) * 100);
    }
    briefAngle = brief?.recommended_angle ?? null;
  }

  // ── Scrape or accept manual ──────────────────────────────────────────────────
  let views = 0;
  let likes: number | null = null;
  let comments: number | null = null;
  let shares: number | null = null;
  let saves: number | null = null;
  let caption: string | null = null;
  let sentiment: Sentiment | null = null;
  let platform = 'unknown';
  let postUrl: string | null = null;
  let source: string;
  let actualScore: number;

  if (isManual) {
    const m = (body as ManualBody).manual;
    views = m.views;
    likes = m.engagement;
    sentiment = m.sentiment;
    source = 'manual';
    actualScore = scoreFromManual(views, m.engagement, sentiment);
  } else {
    const url = (body as UrlBody).url.trim();
    postUrl = url;

    const result = await scrapePost(url);

    if ('error' in result) {
      return Response.json({
        success: false,
        error: "Couldn't access this post's metrics. Try manual entry — three fields, thirty seconds.",
        detail: result.message,
      });
    }

    const metrics = result as ScrapedMetrics;
    views = metrics.views ?? 0;
    likes = metrics.likes;
    comments = metrics.comments;
    shares = metrics.shares;
    saves = metrics.saves;
    caption = metrics.caption;
    platform = metrics.platform;
    source = 'apify';
    actualScore = computeScore(views, likes ?? 0, comments ?? 0, shares ?? 0, saves ?? 0);
  }

  // ── Store in performance_data ────────────────────────────────────────────────
  const { data: perfRow, error: perfErr } = await supabase
    .from('performance_data')
    .insert({
      user_id: user.id,
      project_id: projectId,
      platform,
      post_url: postUrl,
      views,
      likes,
      comments,
      shares,
      saves,
      caption,
      engagement_rate: metrics_engagementRate(views, likes, comments, shares),
      predicted_score: predictedScore,
      actual_score: actualScore,
      sentiment: sentiment ?? null,
      source,
      data_ingested_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (perfErr) {
    console.error('[ingest] performance_data insert error:', perfErr);
    return Response.json({ success: false, error: perfErr.message });
  }

  // ── Compute delta and divergence signals ─────────────────────────────────────
  const delta = predictedScore != null ? Math.abs(actualScore - predictedScore) : null;
  const overperformed = delta != null && predictedScore != null && actualScore > predictedScore + 20;
  const underperformed = delta != null && predictedScore != null && actualScore < predictedScore - 20;
  const divergence = checkDivergence(views, sentiment);

  // ── Write creator_memory if signal is meaningful ──────────────────────────────
  if (projectId && (delta != null || divergence)) {
    const memParts: string[] = [];

    if (overperformed) memParts.push(`Significantly outperformed prediction: actual ${actualScore} vs predicted ${predictedScore}. +${Math.round(delta!)} pts.`);
    else if (underperformed) memParts.push(`Underperformed prediction: actual ${actualScore} vs predicted ${predictedScore}. −${Math.round(delta!)} pts.`);
    else if (delta != null) memParts.push(`Within expected range: actual ${actualScore} vs predicted ${predictedScore}. Δ${Math.round(delta)} pts.`);

    if (divergence && sentiment === 'flopped') memParts.push(`${views.toLocaleString()} views but marked 'flopped' — signals audience mismatch or context issue.`);
    if (divergence && sentiment === 'performed_well') memParts.push(`Only ${views.toLocaleString()} views but marked 'performed_well' — quality-over-reach signal.`);
    if (briefAngle) memParts.push(`Brief angle: "${briefAngle}".`);

    await supabase.from('creator_memory').insert({
      user_id: user.id,
      memory_type: 'performance_pattern',
      content: memParts.join(' ') || `Performance recorded for ${platform}: ${views.toLocaleString()} views.`,
      metadata: {
        performance_id: perfRow.id,
        project_id: projectId,
        platform,
        views,
        actual_score: actualScore,
        predicted_score: predictedScore,
        delta,
        sentiment,
        flagged: overperformed || underperformed || divergence,
        qualitative_quantitative_divergence: divergence,
      },
      source_project_id: projectId,
    });
  }

  // ── Build human-readable comparison ─────────────────────────────────────────
  let comparisonToPrediction: string | null = null;
  if (predictedScore != null) {
    if (overperformed) comparisonToPrediction = `Significantly outperformed: actual ${actualScore} vs predicted ${predictedScore}. +${Math.round(delta!)} pts. Omnyra underestimated this.`;
    else if (underperformed) comparisonToPrediction = `Underperformed: actual ${actualScore} vs predicted ${predictedScore}. −${Math.round(delta!)} pts. The predicted angle didn't land as expected.`;
    else comparisonToPrediction = `Within expected range: actual ${actualScore} vs predicted ${predictedScore}. Δ${Math.round(delta!)} pts.`;
  }

  return Response.json({
    success: true,
    data: {
      performance_id: perfRow.id,
      views,
      engagement: (likes ?? 0) + (comments ?? 0) + (shares ?? 0),
      likes,
      comments,
      shares,
      saves,
      sentiment,
      actual_score: actualScore,
      predicted_score: predictedScore,
      delta: delta != null ? Math.round(delta) : null,
      flagged: overperformed || underperformed || divergence,
      comparison_to_prediction: comparisonToPrediction,
      source,
      platform,
    },
  });
}

function metrics_engagementRate(
  views: number,
  likes: number | null,
  comments: number | null,
  shares: number | null,
): number | null {
  if (!views) return null;
  const interactions = (likes ?? 0) + (comments ?? 0) + (shares ?? 0);
  return Math.round((interactions / views) * 10000) / 100;
}
