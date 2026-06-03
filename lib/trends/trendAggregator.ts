// Pure, synchronous, deterministic transform — no async, no external calls.
// Takes raw Apify items and returns a structured TrendFingerprint.

export type TrendPlatform = "tiktok" | "instagram" | "youtube";

export interface RawTrendItem {
  platform: TrendPlatform;
  title?: string;
  description?: string;
  transcript?: string;
  views?: number;
  likes?: number;
  shares?: number;
}

export interface TrendFingerprint {
  niche: string;
  platform: string;
  hookPatterns: string[];
  formatPatterns: string[];
  emotionalSignals: {
    curiosity:    number;
    emotion:      number;
    authority:    number;
    shock:        number;
    storytelling: number;
  };
  topTranscriptSnippets: string[];
  engagementScore: number;
  velocityScore:   number;
}

// ── Hook pattern matchers ─────────────────────────────────────────────────────

const HOOK_PATTERNS = [
  { pattern: /this is why/i,                   label: "this is why..." },
  { pattern: /you'?re? doing .+ wrong/i,       label: "you're doing this wrong" },
  { pattern: /nobody tells? you/i,             label: "nobody tells you..." },
  { pattern: /i tried .+ so you don'?t have to/i, label: "I tried X so you don't have to" },
  { pattern: /what happens? if/i,              label: "what happens if..." },
  { pattern: /the truth about/i,               label: "the truth about..." },
  { pattern: /stop doing/i,                    label: "stop doing..." },
  { pattern: /\d+ (things?|reasons?|ways?)/i, label: "listicle number hook" },
  { pattern: /pov:/i,                          label: "POV hook" },
  { pattern: /wait for it/i,                   label: "wait for it..." },
] as const;

const FORMAT_PATTERNS = [
  { signal: /story|when i|my journey|i was/i,            label: "story-based" },
  { signal: /how to|step \d|tutorial|guide|learn/i,      label: "tutorial-based" },
  { signal: /shocking|unbelievable|you won'?t believe/i, label: "shock-based" },
  { signal: /\d+ (things?|tips?|hacks?|ways?)/i,         label: "listicle" },
  { signal: /before.{0,20}after|transformation|glow.?up/i, label: "transformation" },
] as const;

// ── Emotional signal scorers ──────────────────────────────────────────────────

function scoreCuriosity(texts: string[]): number {
  const signals = [/\?/, /why|how|what|secret|revealed?|truth|nobody knows/i];
  return clamp(countMatches(texts, signals) * 10, 0, 100);
}

function scoreEmotion(texts: string[]): number {
  const signals = [/feel|love|hate|cry|broke|changed my life|powerful|moving/i];
  return clamp(countMatches(texts, signals) * 12, 0, 100);
}

function scoreAuthority(texts: string[]): number {
  const signals = [/expert|proven|science|study|research|fact|professional|years? of experience/i];
  return clamp(countMatches(texts, signals) * 15, 0, 100);
}

function scoreShock(texts: string[]): number {
  const signals = [/shocking|unbelievable|crazy|insane|never|impossible|banned|secret/i];
  return clamp(countMatches(texts, signals) * 12, 0, 100);
}

function scoreStorytelling(texts: string[]): number {
  const signals = [/i was|when i|then|suddenly|but then|until|finally|one day/i];
  return clamp(countMatches(texts, signals) * 10, 0, 100);
}

function countMatches(texts: string[], patterns: RegExp[]): number {
  let count = 0;
  for (const t of texts) {
    for (const p of patterns) {
      if (p.test(t)) { count++; break; }
    }
  }
  return count;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function trendAggregator(
  raw: RawTrendItem[],
  niche: string,
  platform: string,
): TrendFingerprint {
  // Step 1 — Filter
  const items = raw
    .filter(i => i.title || i.description || i.transcript)
    .filter(i => (i.views ?? 0) + (i.likes ?? 0) + (i.shares ?? 0) > 0)
    .slice(0, 50);

  const texts = items.map(i =>
    [i.title, i.description, i.transcript].filter(Boolean).join(" "),
  );

  // Step 2 — Hook patterns
  const hookCounts = new Map<string, number>();
  for (const text of texts) {
    for (const { pattern, label } of HOOK_PATTERNS) {
      if (pattern.test(text)) {
        hookCounts.set(label, (hookCounts.get(label) ?? 0) + 1);
      }
    }
  }
  const hookPatterns = [...hookCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([label]) => label);

  // Step 3 — Format clustering
  const formatCounts = new Map<string, number>();
  for (const text of texts) {
    for (const { signal, label } of FORMAT_PATTERNS) {
      if (signal.test(text)) {
        formatCounts.set(label, (formatCounts.get(label) ?? 0) + 1);
      }
    }
  }
  const formatPatterns = [...formatCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label]) => label);

  // Step 4 — Emotional signals
  const emotionalSignals = {
    curiosity:    scoreCuriosity(texts),
    emotion:      scoreEmotion(texts),
    authority:    scoreAuthority(texts),
    shock:        scoreShock(texts),
    storytelling: scoreStorytelling(texts),
  };

  // Step 5 — Engagement score
  const engagementScore = clamp(
    avg(items.map(i => normalizeEngagement(i.views, i.likes, i.shares))),
    0,
    100,
  );

  // Step 6 — Velocity score (no time data → default moderate)
  const velocityScore = clamp(Math.round(engagementScore * 0.8), 0, 100);

  // Step 7 — Transcript snippets
  const topTranscriptSnippets = items
    .map(i => i.title ?? i.description ?? "")
    .filter(Boolean)
    .slice(0, 10);

  return {
    niche,
    platform,
    hookPatterns,
    formatPatterns,
    emotionalSignals,
    topTranscriptSnippets,
    engagementScore,
    velocityScore,
  };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function normalizeEngagement(
  views = 0,
  likes = 0,
  shares = 0,
): number {
  const raw = views * 0.01 + likes * 0.5 + shares * 2;
  // Normalize to 0–100 scale (cap at 10M combined)
  return Math.min(100, (raw / 10_000_000) * 100);
}
