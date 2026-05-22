/* Autonomous marketing asset generator.
 *
 * Reads top-performing templates / hooks from the scoring tables and
 * generates marketing copy via the Anthropic API. Assets are persisted
 * to `marketing_assets` with status='draft'. Distribution stays
 * human-gated per spec §7 (no auto-publishing, no auto-DM, no spam).
 *
 * Server-only.
 */

import { supabaseAdmin } from "../supabase/admin";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS_PER_ASSET = 800;
const TOP_TEMPLATES_TO_USE = 2;

export type AssetType = "tiktok_script" | "ad_copy" | "headline" | "ugc_concept" | "email_subject";

interface TemplateRow {
  template: string;
  avg_viral_score: number;
  composite_score: number;
  completed_renders: number;
}

interface AnthropicTextBlock { type: "text"; text: string }
interface AnthropicResponse { content?: AnthropicTextBlock[]; error?: { message: string } }

async function callClaude(systemPrompt: string, userPrompt: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY missing");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS_PER_ASSET,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });
  const data = (await res.json()) as AnthropicResponse;
  if (data.error) throw new Error(`anthropic: ${data.error.message}`);
  return data.content?.[0]?.text ?? "";
}

async function fetchTopTemplates(): Promise<TemplateRow[]> {
  const { data } = await supabaseAdmin
    .from("template_scores")
    .select("template, avg_viral_score, composite_score, completed_renders")
    .gte("completed_renders", 5)
    .order("composite_score", { ascending: false })
    .limit(TOP_TEMPLATES_TO_USE);
  return ((data as TemplateRow[] | null) ?? []).map((r) => ({
    template: String(r.template),
    avg_viral_score: Number(r.avg_viral_score ?? 0),
    composite_score: Number(r.composite_score ?? 0),
    completed_renders: Number(r.completed_renders ?? 0),
  }));
}

async function persistAsset(
  assetType: AssetType,
  template: string,
  content: string,
  source_metrics: Record<string, unknown>,
  confidence_score: number,
): Promise<void> {
  await supabaseAdmin.from("marketing_assets").insert({
    asset_type: assetType,
    source_template: template,
    source_metrics,
    content,
    confidence_score: Math.max(0, Math.min(100, Math.round(confidence_score))),
    status: "draft",
  });
}

const SYSTEM_PROMPT = `You are the in-house marketing copywriter for Omnyra AI — an AI creative studio that generates short-form videos for creators and brands. Write concise, founder-voice copy with concrete claims. No marketing fluff, no clichés like "unleash" or "supercharge". Prefer specificity over hype.`;

function userPromptFor(asset: AssetType, t: TemplateRow): string {
  const stat = `(top-performing template "${t.template}" — composite_score ${t.composite_score.toFixed(1)}/100 across ${t.completed_renders} renders)`;
  switch (asset) {
    case "tiktok_script":
      return `Write a 15-second TikTok script that demonstrates Omnyra's "${t.template}" template ${stat}. Format: hook (0–2s), payoff (2–12s), CTA (12–15s). Spoken words only, no stage directions. Under 50 words.`;
    case "ad_copy":
      return `Write 3 short ad copy variations (one line each) for Meta/TikTok ads promoting Omnyra's "${t.template}" template ${stat}. Each line under 90 chars. No emojis. Output as a numbered list.`;
    case "headline":
      return `Write 5 landing page hero headline variants positioning Omnyra around the "${t.template}" use case ${stat}. Each under 70 chars. Output as a numbered list. No subtitles.`;
    case "ugc_concept":
      return `Outline a 30-second user-generated content concept that a creator could film to organically promote Omnyra's "${t.template}" template ${stat}. Format: scene 1, scene 2, scene 3. Under 120 words total.`;
    case "email_subject":
      return `Write 5 cold-email subject lines for creators who would love Omnyra's "${t.template}" template ${stat}. Each under 50 chars. Output as a numbered list. No spam tropes (avoid "secret", "trick", "hack").`;
  }
}

export interface GenerationResult {
  generated: number;
  failed: number;
  templates_used: string[];
}

export async function generateAllAssets(): Promise<GenerationResult> {
  const templates = await fetchTopTemplates();
  if (templates.length === 0) {
    return { generated: 0, failed: 0, templates_used: [] };
  }

  const assetTypes: AssetType[] = ["tiktok_script", "ad_copy", "headline", "ugc_concept", "email_subject"];
  let generated = 0;
  let failed = 0;

  for (const t of templates) {
    for (const asset of assetTypes) {
      try {
        const text = await callClaude(SYSTEM_PROMPT, userPromptFor(asset, t));
        if (text.trim().length === 0) {
          failed += 1;
          continue;
        }
        await persistAsset(
          asset,
          t.template,
          text.trim(),
          {
            composite_score: t.composite_score,
            avg_viral_score: t.avg_viral_score,
            completed_renders: t.completed_renders,
          },
          t.composite_score,
        );
        generated += 1;
      } catch (err) {
        console.error(`[marketing] ${asset} for ${t.template} failed:`, err instanceof Error ? err.message : err);
        failed += 1;
      }
    }
  }

  return {
    generated,
    failed,
    templates_used: templates.map((t) => t.template),
  };
}
