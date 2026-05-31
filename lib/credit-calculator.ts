/*  Omnyra credit calculator
 *  Pure for the breakdown computation. Optionally accepts a
 *  `cost_multiplier` argument so the AGS engine can dial template
 *  pricing up or down without code changes (see template_settings).
 *
 *  Public API:
 *    calculateRenderCost(input: CalculateRenderCostInput): CreditResult
 *    applyCostMultiplier(cost: number, multiplier: number): number
 *    loadTemplateMultiplier(template: string): Promise<number>
 */

/* ────────────────────────────────────────────────────────────────
 *  Types
 * ─────────────────────────────────────────────────────────────── */

export type Quality = "draft" | "final";

export interface CalculateRenderCostInput {
  duration: number;
  template: string;
  quality: Quality;
  apis_used: string[];
  scenes?: number;
  images?: number;
  userCredits?: number;
  /** Override the cost multiplier (defaults to 1.0). Server-supplied
   * by routes that have already resolved it from template_settings. */
  cost_multiplier?: number;
}

export interface CreditBreakdown {
  elevenlabs: number;
  kling: number;
  runway: number;
  pika: number;
  synclabs: number;
  heygen: number;
  did: number;
  falai: number;
  flux: number;
}

export interface CreditResult {
  draft_cost: number;
  final_cost: number;
  breakdown: CreditBreakdown;
  sufficient_credits: boolean;
  warning: string | null;
}

/* ────────────────────────────────────────────────────────────────
 *  Constants
 * ─────────────────────────────────────────────────────────────── */

const DRAFT_COST = 2;
const DEFAULT_SCENES = 3;
const DEFAULT_IMAGES = 1;
const LOW_CREDIT_THRESHOLD = 20;

export const TEMPLATE_DEFAULT_APIS: Record<string, readonly string[]> = {
  "ugc-ad": ["elevenlabs", "kling", "synclabs"],
  storytime: ["elevenlabs", "runway", "synclabs"],
  influencer: ["elevenlabs", "kling", "heygen", "synclabs"],
  "product-launch": ["elevenlabs", "runway", "falai"],
  faceless: ["elevenlabs", "kling"],
};

const FALLBACK_APIS: readonly string[] = ["elevenlabs"];

type ApiKey = keyof CreditBreakdown;

const API_KEYS: readonly ApiKey[] = [
  "elevenlabs",
  "kling",
  "runway",
  "pika",
  "synclabs",
  "heygen",
  "did",
  "falai",
  "flux",
];

function emptyBreakdown(): CreditBreakdown {
  return {
    elevenlabs: 0,
    kling: 0,
    runway: 0,
    pika: 0,
    synclabs: 0,
    heygen: 0,
    did: 0,
    falai: 0,
    flux: 0,
  };
}

/* ────────────────────────────────────────────────────────────────
 *  Per-API cost rules
 * ─────────────────────────────────────────────────────────────── */

function blocks30s(duration: number): number {
  return Math.ceil(duration / 30);
}

function costForApi(
  api: ApiKey,
  duration: number,
  scenes: number,
  images: number,
): number {
  switch (api) {
    case "elevenlabs":
      return blocks30s(duration) * 3;
    case "kling":
      return scenes * 8;
    case "runway":
      return scenes * 10;
    case "pika":
      return scenes * 5;
    case "synclabs":
      return blocks30s(duration) * 6;
    case "heygen":
      return blocks30s(duration) * 15;
    case "did":
      return blocks30s(duration) * 8;
    case "falai":
      return images * 2;
    case "flux":
      return images * 3;
    default:
      return 0;
  }
}

function isKnownApi(s: string): s is ApiKey {
  return (API_KEYS as readonly string[]).includes(s);
}

function resolveApis(
  apis_used: string[],
  template: string,
): readonly string[] {
  if (Array.isArray(apis_used) && apis_used.length > 0) {
    return apis_used;
  }
  const fromTemplate = TEMPLATE_DEFAULT_APIS[template];
  if (fromTemplate && fromTemplate.length > 0) {
    return fromTemplate;
  }
  return FALLBACK_APIS;
}

/* ────────────────────────────────────────────────────────────────
 *  Main calculator
 * ─────────────────────────────────────────────────────────────── */

export function calculateRenderCost(
  inputs: CalculateRenderCostInput,
): CreditResult {
  const breakdown = emptyBreakdown();
  const draft_cost = DRAFT_COST;

  if (inputs.quality === "draft") {
    const hasUserCredits = typeof inputs.userCredits === "number";
    const sufficient_credits = hasUserCredits
      ? (inputs.userCredits as number) >= draft_cost
      : true;
    return {
      draft_cost,
      final_cost: 0,
      breakdown,
      sufficient_credits,
      warning: null,
    };
  }

  const duration = inputs.duration;
  const scenes =
    typeof inputs.scenes === "number" && inputs.scenes > 0
      ? inputs.scenes
      : DEFAULT_SCENES;
  const images =
    typeof inputs.images === "number" && inputs.images > 0
      ? inputs.images
      : DEFAULT_IMAGES;

  const resolved = resolveApis(inputs.apis_used, inputs.template);

  for (const api of resolved) {
    if (!isKnownApi(api)) continue;
    breakdown[api] = breakdown[api] + costForApi(api, duration, scenes, images);
  }

  let final_cost = 0;
  for (const key of API_KEYS) {
    final_cost += breakdown[key];
  }

  // Apply dynamic template multiplier — discounts high-performers
  // and surcharges low-performers. Bounded for safety.
  if (typeof inputs.cost_multiplier === "number") {
    final_cost = applyCostMultiplier(final_cost, inputs.cost_multiplier);
  }

  const hasUserCredits = typeof inputs.userCredits === "number";
  const sufficient_credits = hasUserCredits
    ? (inputs.userCredits as number) >= final_cost
    : true;

  const warning =
    hasUserCredits &&
    (inputs.userCredits as number) - final_cost < LOW_CREDIT_THRESHOLD
      ? "Low credits"
      : null;

  return {
    draft_cost,
    final_cost,
    breakdown,
    sufficient_credits,
    warning,
  };
}

/* ────────────────────────────────────────────────────────────────
 *  Dynamic pricing helpers
 *
 *  The multiplier is clamped to [0.5, 2.0] so a misconfiguration
 *  cannot zero-out or 10x credit costs. Spec governor rule: changes
 *  must be gradual + reversible.
 * ─────────────────────────────────────────────────────────────── */

const MULTIPLIER_MIN = 0.5;
const MULTIPLIER_MAX = 2.0;

export function applyCostMultiplier(cost: number, multiplier: number): number {
  if (!Number.isFinite(multiplier) || multiplier <= 0) return cost;
  const clamped = Math.max(MULTIPLIER_MIN, Math.min(MULTIPLIER_MAX, multiplier));
  return Math.ceil(cost * clamped);
}

/** Lookup the template's cost multiplier from template_settings.
 * Returns 1.0 when no row / no override exists. */
export async function loadTemplateMultiplier(template: string): Promise<number> {
  // Import lazily to keep this module dependency-free at call sites
  // that pass `cost_multiplier` directly.
  const { supabaseAdmin } = await import("./supabase/admin");
  const { data } = await supabaseAdmin
    .from("template_settings")
    .select("cost_multiplier")
    .eq("template", template)
    .maybeSingle();
  const raw = Number(data?.cost_multiplier ?? 1.0);
  if (!Number.isFinite(raw) || raw <= 0) return 1.0;
  return Math.max(MULTIPLIER_MIN, Math.min(MULTIPLIER_MAX, raw));
}
