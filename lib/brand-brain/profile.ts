/**
 * Brand Brain Profile
 *
 * Assembles a rich creator context from brand profile + creator profile +
 * preference weights + recent history, and optionally uses Anthropic Claude
 * to generate actionable insights.
 */

import Anthropic from "@anthropic-ai/sdk";
import { getBrandProfile } from "../brand";
import { loadCreatorProfile } from "../creator-profile";
import { getPreferenceWeights, getRecentGenerations } from "./store";
import { analyzeCreatorHistory, getBestSettings } from "./learning";

// ── Full context object ────────────────────────────────────────────────────────

export interface BrandBrainContext {
  userId:         string;
  brandName:      string | null;
  niche:          string | null;
  targetAudience: string | null;
  toneOfVoice:    string | null;
  products:       Array<{ name: string; description: string }>;
  contentPillars: string[];
  preferredHooks: string[];
  preferredCTAs:  string[];
  bestSettings: {
    hookType:  string | null;
    energy:    number;
    pacing:    "slow" | "measured" | "fast";
    template:  string | null;
  };
  qualityScore:       number;
  totalVideos:        number;
  publishRate:        number;
  topHooks:           Array<{ hook: string; publishRate: number }>;
  topTemplates:       Array<{ template: string; publishRate: number }>;
  hasEnoughHistory:   boolean;
}

export async function buildBrandBrainContext(userId: string): Promise<BrandBrainContext> {
  const [brandProfile, creatorProfile, bestSettings, history] = await Promise.all([
    getBrandProfile(userId),
    loadCreatorProfile(userId),
    getBestSettings(userId),
    analyzeCreatorHistory(userId),
  ]);

  return {
    userId,
    brandName:      brandProfile?.brand_name ?? null,
    niche:          creatorProfile?.niche ?? brandProfile?.niche ?? null,
    targetAudience: brandProfile?.target_audience ?? null,
    toneOfVoice:    brandProfile?.tone_of_voice ?? null,
    products:       brandProfile?.products ?? [],
    contentPillars: creatorProfile?.content_pillars ?? [],
    preferredHooks: creatorProfile?.preferred_hooks ?? [],
    preferredCTAs:  creatorProfile?.preferred_ctas ?? [],
    bestSettings: {
      hookType:  bestSettings.bestHookType,
      energy:    bestSettings.bestEnergy,
      pacing:    bestSettings.bestPacing,
      template:  bestSettings.bestTemplate,
    },
    qualityScore:     creatorProfile?.quality_score ?? 0.5,
    totalVideos:      creatorProfile?.total_videos ?? 0,
    publishRate:      history.publishRate,
    topHooks:         history.topHooks.map(h => ({ hook: h.hook, publishRate: h.publishRate })),
    topTemplates:     history.topTemplates.map(t => ({ template: t.template, publishRate: t.publishRate })),
    hasEnoughHistory: history.totalGenerations >= 3,
  };
}

// ── Director Core system prompt injection ──────────────────────────────────────

export function buildBrandBrainSystemPromptSection(ctx: BrandBrainContext): string {
  if (!ctx.hasEnoughHistory && !ctx.brandName && !ctx.niche) return "";

  const lines: string[] = ["— CREATOR MEMORY (use to personalise this generation) —"];

  if (ctx.brandName)      lines.push(`Brand: ${ctx.brandName}`);
  if (ctx.niche)          lines.push(`Niche: ${ctx.niche}`);
  if (ctx.targetAudience) lines.push(`Target Audience: ${ctx.targetAudience}`);
  if (ctx.toneOfVoice)    lines.push(`Tone: ${ctx.toneOfVoice}`);

  if (ctx.contentPillars.length) {
    lines.push(`Content Pillars: ${ctx.contentPillars.join(", ")}`);
  }
  if (ctx.preferredHooks.length) {
    lines.push(`High-performing hook patterns: ${ctx.preferredHooks.slice(0, 3).join(", ")}`);
  }

  if (ctx.hasEnoughHistory) {
    if (ctx.topHooks.length) {
      const bestHook = ctx.topHooks.find(h => h.publishRate > 0.6);
      if (bestHook) lines.push(`Best hook type: ${bestHook.hook} (${Math.round(bestHook.publishRate * 100)}% publish rate)`);
    }
    lines.push(`Creator quality score: ${(ctx.qualityScore * 100).toFixed(0)}/100 (${ctx.totalVideos} videos)`);
    if (ctx.bestSettings.energy !== 3) {
      lines.push(`Preferred energy level: ${ctx.bestSettings.energy}/5`);
    }
    if (ctx.bestSettings.pacing !== "measured") {
      lines.push(`Preferred pacing: ${ctx.bestSettings.pacing}`);
    }
  }

  lines.push("— END CREATOR MEMORY —");
  return "\n\n" + lines.join("\n");
}

// ── Claude-powered insights ────────────────────────────────────────────────────

export interface CreatorInsight {
  category: "hook" | "energy" | "template" | "content_gap" | "growth";
  headline: string;
  detail:   string;
  action:   string;
  priority: "high" | "medium" | "low";
}

export interface BrandBrainInsights {
  insights:     CreatorInsight[];
  dailyBrief:   string;
  generatedAt:  string;
}

export async function generateCreatorInsights(userId: string): Promise<BrandBrainInsights> {
  const [ctx, history, weights] = await Promise.all([
    buildBrandBrainContext(userId),
    analyzeCreatorHistory(userId),
    getPreferenceWeights(userId),
    getRecentGenerations(userId, 10),
  ]);

  if (!ctx.hasEnoughHistory) {
    return {
      insights: [{
        category: "growth",
        headline: "Build your creative history",
        detail:   "Generate at least 3 videos and mark which ones you published to activate personalised insights.",
        action:   "Create and publish your first few videos",
        priority: "high",
      }],
      dailyBrief: "Create and publish videos to unlock personalised brand intelligence.",
      generatedAt: new Date().toISOString(),
    };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { insights: [], dailyBrief: "ANTHROPIC_API_KEY not configured.", generatedAt: new Date().toISOString() };
  }

  const client = new Anthropic({ apiKey });

  const contextSummary = JSON.stringify({
    niche:           ctx.niche,
    totalVideos:     ctx.totalVideos,
    publishRate:     `${Math.round(ctx.publishRate * 100)}%`,
    qualityScore:    ctx.qualityScore,
    topHooks:        ctx.topHooks.slice(0, 3),
    topTemplates:    ctx.topTemplates.slice(0, 3),
    bestEnergy:      ctx.bestSettings.energy,
    bestPacing:      ctx.bestSettings.pacing,
    hookWeights:     weights?.hook_weights,
    templateWeights: weights?.template_weights,
    energyDistribution: Object.entries(history.energyDistribution)
      .sort((a, b) => b[1] - a[1]),
  }, null, 2);

  try {
    const response = await client.messages.create({
      model:     "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: `You are a creative performance analyst for short-form video creators. Analyze the creator's data and return JSON insights. Be specific, actionable, and honest.`,
      messages: [{
        role:    "user",
        content: `Analyze this creator's performance data and generate insights:

${contextSummary}

Return JSON with this exact structure:
{
  "insights": [
    {
      "category": "hook|energy|template|content_gap|growth",
      "headline": "short headline (max 8 words)",
      "detail": "1-2 sentence explanation of what the data shows",
      "action": "specific next action to take",
      "priority": "high|medium|low"
    }
  ],
  "dailyBrief": "2-3 sentence daily creative brief for this creator"
}

Generate 3-5 insights. Focus on patterns that are statistically meaningful (not random chance). Include at least one growth opportunity.`,
      }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
    const { tryParseJson } = await import("../safe-parse-json");
    const parsed = (tryParseJson<BrandBrainInsights>(text) ?? {}) as BrandBrainInsights;

    return {
      insights:    parsed.insights ?? [],
      dailyBrief:  parsed.dailyBrief ?? "",
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[brand-brain:profile] generateCreatorInsights error:", err);
    return { insights: [], dailyBrief: "", generatedAt: new Date().toISOString() };
  }
}
