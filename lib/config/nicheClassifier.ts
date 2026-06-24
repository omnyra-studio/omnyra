/**
 * Omnyra V4 — Hybrid Classification Engine
 *
 * 3-layer decision stack:
 *   [1] Rule Guard       — sync, fast, safety blocks + hard rejects
 *   [2] Semantic Match   — TF-vector cosine similarity over keyword vocabulary
 *   [3] LLM Router       — Claude Haiku, only on ambiguous results
 *
 * V4 additions:
 *   [4] Feedback Logger  — every classification written to Supabase
 *   [5] Confidence Calibration — blends keyword, semantic, LLM, and history signals
 *   [6] Drift Detection  — alerts when category vectors converge above threshold
 *
 * getNicheSettings() in nicheSettings.ts stays as the sync fast path.
 * classifyNicheV3() is the full async production path for generation routes.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { NICHE_SETTINGS } from "./nicheSettings";

// ── Types ──────────────────────────────────────────────────────────────────────

export type ContentStrength = 'high' | 'medium' | 'low';

export interface V3Classification {
  primary:          string;
  secondary:        Array<{ category: string; weight: number }>;
  confidence:       number;
  path:             'rule-guard' | 'semantic' | 'llm' | 'llm-fallback' | 'keyword';
  blocked:          false;
  content_strength: ContentStrength;
}

export interface V3Blocked {
  blocked: true;
  reason:  string;
}

export type ClassifyResult = V3Classification | V3Blocked;

// ── Constants ──────────────────────────────────────────────────────────────────

const SEMANTIC_CONFIDENCE_THRESHOLD = 0.85; // return semantic result directly, skip LLM
const LLM_CONFIDENCE_THRESHOLD      = 0.70; // accept LLM result if its confidence ≥ this
const DRIFT_SIMILARITY_THRESHOLD    = 0.88; // flag overlap when categories converge

// ── [1] Rule Guard ─────────────────────────────────────────────────────────────
//
// Runs FIRST. No API cost. Blocks globally unsafe inputs before any
// classification begins. Returns { blocked: true } immediately.

const HARD_BLOCKS = [
  'how to scam',
  'guaranteed profit',
  'guaranteed returns',
  'self harm instruction',
  'how to hurt',
  'illegal drug synthesis',
  'insider trading tip',
  'pyramid scheme',
  'ponzi',
  'pump and dump',
];

export function ruleGuard(text: string): { blocked: false } | { blocked: true; reason: string } {
  const lower = text.toLowerCase();
  for (const block of HARD_BLOCKS) {
    if (lower.includes(block)) {
      return { blocked: true, reason: `hard-block: "${block}"` };
    }
  }
  return { blocked: false };
}

// ── [2] Semantic Match — TF-vector cosine similarity ──────────────────────────
//
// Converts each niche's triggerKeywords into a normalized TF vector over a shared
// vocabulary. User input is tokenised the same way. Cosine similarity gives a
// genuine semantic match without an external embedding API.

type CategoryVector = { key: string; vector: Map<string, number> };

let _categoryVectors: CategoryVector[] | null = null;

function buildCategoryVectors(): CategoryVector[] {
  if (_categoryVectors) return _categoryVectors;

  const niches = Object.values(NICHE_SETTINGS).filter(n => n.key !== 'lifestyle');

  // Build shared vocabulary from all trigger keywords
  const vocab = new Set<string>();
  for (const n of niches) {
    for (const kw of n.triggerKeywords) {
      for (const token of tokenise(kw)) vocab.add(token);
    }
  }

  _categoryVectors = niches.map(n => {
    const tf = new Map<string, number>();
    let total = 0;
    for (const kw of n.triggerKeywords) {
      for (const token of tokenise(kw)) {
        tf.set(token, (tf.get(token) ?? 0) + 1);
        total++;
      }
    }
    // Normalize
    if (total > 0) for (const [t, v] of tf) tf.set(t, v / total);
    return { key: n.key, vector: tf };
  });

  return _categoryVectors;
}

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (const [k, v] of a) {
    dot += v * (b.get(k) ?? 0);
    magA += v * v;
  }
  for (const [, v] of b) magB += v * v;
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

export interface SemanticMatch {
  category: string;
  score:    number;
  ranked:   Array<{ category: string; score: number }>;
}

export function semanticMatch(input: string): SemanticMatch {
  const vectors = buildCategoryVectors();
  const inputVec = new Map<string, number>();
  const tokens = tokenise(input);
  for (const t of tokens) inputVec.set(t, (inputVec.get(t) ?? 0) + 1 / tokens.length);

  const ranked = vectors
    .map(cv => ({ category: cv.key, score: cosineSimilarity(inputVec, cv.vector) }))
    .sort((a, b) => b.score - a.score);

  return { category: ranked[0]?.category ?? 'lifestyle', score: ranked[0]?.score ?? 0, ranked: ranked.slice(0, 5) };
}

// ── Drift Detection ────────────────────────────────────────────────────────────

export interface DriftAlert {
  categoryA: string;
  categoryB: string;
  similarity: number;
}

export function detectCategoryDrift(): DriftAlert[] {
  const vectors = buildCategoryVectors();
  const alerts: DriftAlert[] = [];

  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      const sim = cosineSimilarity(vectors[i].vector, vectors[j].vector);
      if (sim > DRIFT_SIMILARITY_THRESHOLD) {
        alerts.push({ categoryA: vectors[i].key, categoryB: vectors[j].key, similarity: sim });
      }
    }
  }
  return alerts;
}

// ── [3] LLM Router — Claude Haiku ─────────────────────────────────────────────
//
// Called ONLY when semantic score is below SEMANTIC_CONFIDENCE_THRESHOLD.
// Outputs structured JSON with primary category + confidence.

const ALLOWED_CATEGORIES = Object.values(NICHE_SETTINGS)
  .filter(n => n.key !== 'lifestyle')
  .map(n => n.key)
  .join('\n- ');

const LLM_SYSTEM = `You are Omnyra's classification engine. Classify input text into exactly one of 15 fixed categories.

OUTPUT FORMAT (output ONLY this — no markdown, no explanation):
{"category": "<key>", "confidence": <0.0-1.0>}

ALLOWED KEYS (use these exact strings):
motivation_success, finance_investing, side_hustles, health_fitness, beauty_skincare,
food_recipes, product_reviews, faceless_stoic, luxury_lifestyle, tech_ai,
relationships_dating, mental_health, gaming, pets, animation_3d

DISAMBIGUATION RULES (apply in order):

1. motivation_success vs health_fitness
   - Abstract / mindset / discipline / "push yourself" → motivation_success
   - Physical training / body / workouts / gym / fat loss → health_fitness

2. finance_investing strict gate
   - MUST include money, investing, wealth, income, earnings, compound interest
   - Generic "success mindset" without money context → motivation_success

3. side_hustles vs finance_investing
   - Action-based income: freelancing, dropshipping, selling, making money → side_hustles
   - Conceptual wealth / investing / portfolio → finance_investing

4. faceless_stoic vs motivation_success
   - Stoic quotes, silence, aesthetic edits, no-face content, sigma → faceless_stoic
   - General inspiration / advice / hustle → motivation_success

5. mental_health strict gate
   - Emotional wellbeing, anxiety, healing, therapy, stress → mental_health
   - Discipline / mindset / performance without emotional distress → motivation_success

6. tech_ai strict gate
   - AI tools, software, models, automation explicitly mentioned → tech_ai
   - Generic "work smarter" / productivity → motivation_success

CONFIDENCE TIERS:
- 0.90–1.00  extremely clear match
- 0.75–0.89  strong but slightly ambiguous
- < 0.75     uncertain (system will escalate — prefer accuracy over certainty)`;

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic();
  return _anthropic;
}

export async function llmRoute(input: string): Promise<{ category: string; confidence: number }> {
  const response = await getAnthropic().messages.create({
    model:      'claude-haiku-4-5-20251001',
    max_tokens: 60,
    system:     LLM_SYSTEM,
    messages: [{ role: 'user', content: input.slice(0, 800) }],
  });

  const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '{}';
  const parsed = JSON.parse(raw.match(/\{[\s\S]*?\}/)?.[0] ?? '{}');
  const category = String(parsed.category ?? 'lifestyle');
  const confidence = Math.min(1, Math.max(0, Number(parsed.confidence ?? 0.5)));

  return { category, confidence };
}

// ── [4] Confidence Calibration (V4) ───────────────────────────────────────────
//
// Blends semantic score, LLM confidence, and historical accuracy for the
// category. History weight is 0 if no feedback data is available yet.

export function calibratedConfidence(
  semanticScore:   number,
  llmConfidence:   number,
  historyAccuracy: number,
): number {
  // Weights: LLM 50%, semantic 30%, history 20%
  return (llmConfidence * 0.5) + (semanticScore * 0.3) + (historyAccuracy * 0.2);
}

// ── [4] Feedback Logger (V4) ──────────────────────────────────────────────────
//
// Writes every classification to Supabase `classification_feedback`.
// Non-blocking: errors are swallowed so classification never fails.

export async function logClassification(params: {
  inputText:         string;
  predictedCategory: string;
  confidence:        number;
  path:              string;
  userId?:           string;
}): Promise<void> {
  try {
    const url  = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key  = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return;

    const supabase = createClient(url, key, { auth: { persistSession: false } });
    await supabase.from('classification_feedback').insert({
      input_text:         params.inputText.slice(0, 1000),
      predicted_category: params.predictedCategory,
      confidence:         params.confidence,
      path:               params.path,
      user_id:            params.userId ?? null,
      was_correct:        null, // filled later via correction API
    });
  } catch {
    // Feedback logging must never crash classification
  }
}

// ── Category accuracy from historical feedback (V4) ───────────────────────────

const _accuracyCache = new Map<string, { accuracy: number; fetchedAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5-min cache

export async function getCategoryAccuracy(category: string): Promise<number> {
  const cached = _accuracyCache.get(category);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) return cached.accuracy;

  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return 0.75; // optimistic default when no data

    const supabase = createClient(url, key, { auth: { persistSession: false } });
    const { data } = await supabase
      .from('classification_feedback')
      .select('was_correct')
      .eq('predicted_category', category)
      .not('was_correct', 'is', null)
      .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // 30d window
      .limit(500);

    if (!data || data.length === 0) {
      _accuracyCache.set(category, { accuracy: 0.75, fetchedAt: Date.now() });
      return 0.75;
    }

    const correct = data.filter(r => r.was_correct === true).length;
    const accuracy = correct / data.length;
    _accuracyCache.set(category, { accuracy, fetchedAt: Date.now() });
    return accuracy;
  } catch {
    return 0.75;
  }
}

// ── V4.1 Content Strength ─────────────────────────────────────────────────────
//
// Rule-based content strength hint: how specific and actionable the input is.
// High = strong specific topic with clear intent.
// Medium = clear topic, moderate specificity.
// Low = vague, short, or overly generic.

export function scoreContentStrength(input: string, category: string, semanticScore: number): ContentStrength {
  const words = input.trim().split(/\s+/).length;
  const hasNumber = /\d+/.test(input);
  const hasActionWord = /(how|why|what|step|tip|guide|secret|trick|best|worst|mistake|earn|lose|gain|build|grow)/i.test(input);

  let score = 0;
  if (words >= 10) score += 2;
  else if (words >= 5) score += 1;
  if (hasNumber) score += 1;
  if (hasActionWord) score += 1;
  if (semanticScore >= 0.60) score += 2;
  else if (semanticScore >= 0.35) score += 1;

  // Category-specific boosts for natively high-performing content types
  const boostCategories = new Set(['finance_investing', 'tech_ai', 'mental_health', 'side_hustles']);
  if (boostCategories.has(category)) score += 1;

  if (score >= 6) return 'high';
  if (score >= 3) return 'medium';
  return 'low';
}

// ── Full V4 Pipeline ───────────────────────────────────────────────────────────
//
// This is the production classify() function used by generation routes.
// Falls through layers until a confident answer is found.

export async function classifyNicheV4(
  input:   string,
  userId?: string,
): Promise<ClassifyResult> {
  // ── Step 1: Rule Guard ─────────────────────────────────────────────────────
  const guard = ruleGuard(input);
  if (guard.blocked) {
    await logClassification({ inputText: input, predictedCategory: 'blocked', confidence: 1, path: 'rule-guard', userId });
    return { blocked: true, reason: guard.reason };
  }

  // ── Step 2: Semantic match (primary decision, ~0ms, no API) ───────────────
  const embed = semanticMatch(input);

  const secondary = embed.ranked
    .slice(1, 4)
    .filter(r => r.score > 0.01)
    .map(r => ({ category: r.category, weight: parseFloat(r.score.toFixed(3)) }));

  // ── Step 3: High-confidence fast-path (≥0.85 — skip LLM) ───────────────────
  if (embed.score >= SEMANTIC_CONFIDENCE_THRESHOLD) {
    const history   = await getCategoryAccuracy(embed.category);
    const finalConf = calibratedConfidence(embed.score, embed.score, history);
    await logClassification({ inputText: input, predictedCategory: embed.category, confidence: finalConf, path: 'semantic', userId });
    return {
      primary:          embed.category,
      secondary,
      confidence:       finalConf,
      path:             'semantic',
      blocked:          false,
      content_strength: scoreContentStrength(input, embed.category, embed.score),
    };
  }

  // ── Step 4: LLM Router — called only when semantic score < 0.85 ──────────
  let llmResult: { category: string; confidence: number } | null = null;
  try {
    llmResult = await llmRoute(input);
  } catch (err) {
    console.warn('[NicheClassifier] LLM route failed, falling back to semantic:', err instanceof Error ? err.message : err);
  }

  if (llmResult && llmResult.confidence >= LLM_CONFIDENCE_THRESHOLD) {
    const history   = await getCategoryAccuracy(llmResult.category);
    const finalConf = calibratedConfidence(llmResult.confidence, embed.score, history);
    await logClassification({ inputText: input, predictedCategory: llmResult.category, confidence: finalConf, path: 'llm', userId });
    return {
      primary:          llmResult.category,
      secondary,
      confidence:       finalConf,
      path:             'llm',
      blocked:          false,
      content_strength: scoreContentStrength(input, llmResult.category, embed.score),
    };
  }

  // ── Step 5: Final fallback — best available signal ─────────────────────────
  const finalCategory = llmResult
    ? (llmResult.confidence > embed.score ? llmResult.category : embed.category)
    : embed.category;
  const history   = await getCategoryAccuracy(finalCategory);
  const finalConf = calibratedConfidence(llmResult?.confidence ?? embed.score, embed.score, history);

  await logClassification({ inputText: input, predictedCategory: finalCategory, confidence: finalConf, path: 'llm-fallback', userId });
  return {
    primary:          finalCategory,
    secondary,
    confidence:       finalConf,
    path:             'llm-fallback',
    blocked:          false,
    content_strength: scoreContentStrength(input, finalCategory, embed.score),
  };
}

// ── Correction API helper (V4 feedback loop) ───────────────────────────────────
//
// Call this when a user explicitly changes the niche category after generation.
// Updates the was_correct flag for the most recent classification of the same input.

export async function submitCorrection(params: {
  inputText:           string;
  predictedCategory:   string;
  correctedCategory:   string;
}): Promise<void> {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return;

    const supabase = createClient(url, key, { auth: { persistSession: false } });

    // Find the latest unresolved prediction for this input
    const { data } = await supabase
      .from('classification_feedback')
      .select('id')
      .eq('input_text', params.inputText.slice(0, 1000))
      .eq('predicted_category', params.predictedCategory)
      .is('was_correct', null)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!data?.length) return;

    const wasCor = params.predictedCategory === params.correctedCategory;
    await supabase
      .from('classification_feedback')
      .update({
        was_correct:         wasCor,
        user_corrected_category: wasCor ? null : params.correctedCategory,
      })
      .eq('id', data[0].id);

    // Invalidate cache for affected categories
    _accuracyCache.delete(params.predictedCategory);
    _accuracyCache.delete(params.correctedCategory);
    // Invalidate vector cache if correction occurs — triggers rebuild
    _categoryVectors = null;
  } catch {
    // Non-fatal
  }
}
