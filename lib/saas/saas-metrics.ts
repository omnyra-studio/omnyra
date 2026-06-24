import { supabaseAdmin } from "@/lib/supabase/admin";

export interface GenerationMetric {
  userId:       string;
  projectId?:   string;
  type:         'cinematic' | 'avatar' | 'quick' | 'continuation';
  provider:     string;
  niche?:       string;
  durationSecs: number;
  creditsUsed:  number;
  generationMs: number;
  success:      boolean;
  errorCode?:   string;
}

export interface DailyMetrics {
  date:               string;
  totalGenerations:   number;
  successRate:        number;
  avgGenerationMs:    number;
  totalCreditsUsed:   number;
  topNiches:          Array<{ niche: string; count: number }>;
  providerBreakdown:  Record<string, number>;
}

export class SaaSMetrics {
  async record(metric: GenerationMetric): Promise<void> {
    await supabaseAdmin.from('generation_metrics').insert({
      user_id:       metric.userId,
      project_id:    metric.projectId ?? null,
      type:          metric.type,
      provider:      metric.provider,
      niche:         metric.niche ?? null,
      duration_secs: metric.durationSecs,
      credits_used:  metric.creditsUsed,
      generation_ms: metric.generationMs,
      success:       metric.success,
      error_code:    metric.errorCode ?? null,
    }).then(() => {}, err =>
      console.error('[SaaSMetrics] record failed (non-fatal):', err.message)
    );
  }

  async getDailyMetrics(date?: string): Promise<DailyMetrics> {
    const targetDate = date ?? new Date().toISOString().slice(0, 10);
    const startOfDay = `${targetDate}T00:00:00Z`;
    const endOfDay   = `${targetDate}T23:59:59Z`;

    const { data } = await supabaseAdmin
      .from('generation_metrics')
      .select('*')
      .gte('created_at', startOfDay)
      .lte('created_at', endOfDay);

    const rows = data ?? [];
    const total = rows.length;
    const successes = rows.filter(r => r.success).length;
    const avgMs = total > 0 ? rows.reduce((s, r) => s + (r.generation_ms ?? 0), 0) / total : 0;
    const totalCr = rows.reduce((s, r) => s + (r.credits_used ?? 0), 0);

    const nicheCounts: Record<string, number> = {};
    const providerCounts: Record<string, number> = {};
    for (const r of rows) {
      if (r.niche) nicheCounts[r.niche] = (nicheCounts[r.niche] ?? 0) + 1;
      if (r.provider) providerCounts[r.provider] = (providerCounts[r.provider] ?? 0) + 1;
    }

    const topNiches = Object.entries(nicheCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([niche, count]) => ({ niche, count }));

    return {
      date:              targetDate,
      totalGenerations:  total,
      successRate:       total > 0 ? successes / total : 0,
      avgGenerationMs:   Math.round(avgMs),
      totalCreditsUsed:  totalCr,
      topNiches,
      providerBreakdown: providerCounts,
    };
  }
}
