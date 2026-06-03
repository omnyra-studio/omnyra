import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { generateViralStrategy } from "@/packages/viral-strategy";
import type { NicheCategory } from "@/packages/distribution-intelligence";
import type { SessionPreferences } from "@/packages/selection-feedback";
import { checkAbuse } from "@/lib/abuse-protection";
import { checkAndDeductCredits } from "@/lib/rules/creditRules";
import { saveGeneration } from "@/lib/db/generations";

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let idea: string, niche: string | undefined, platform: string | undefined;
  let sessionPreferences: SessionPreferences | undefined;

  try {
    const body = await req.json() as {
      idea?: string;
      niche?: string;
      platform?: string;
      sessionPreferences?: SessionPreferences;
    };
    idea = (body.idea ?? "").trim();
    niche = body.niche;
    platform = body.platform;
    sessionPreferences = body.sessionPreferences;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!idea) return Response.json({ error: "idea is required" }, { status: 400 });

  // ── Abuse protection ──────────────────────────────────────────────────────
  const abuse = await checkAbuse({ userId: user.id, input: idea });
  if (!abuse.allowed) {
    const retryAfterSec = Math.ceil(abuse.cooldownRemainingMs / 1000);
    return Response.json(
      { error: "Too many requests. Please wait before generating again." },
      { status: 429, headers: { "Retry-After": String(retryAfterSec) } },
    );
  }
  if (abuse.queueDelayMs > 0) {
    await new Promise(r => setTimeout(r, abuse.queueDelayMs));
  }

  // ── Credit enforcement — deduct BEFORE generation ─────────────────────────
  const creditResult = await checkAndDeductCredits(user.id, "viral_strategy_generate");
  if (!creditResult.allowed) {
    return Response.json(
      {
        error: "INSUFFICIENT_CREDITS",
        balance: creditResult.balance,
        planType: creditResult.planType,
        required: creditResult.cost,
      },
      { status: 402 },
    );
  }

  // ── Generation ────────────────────────────────────────────────────────────
  const output = generateViralStrategy(
    idea,
    niche as NicheCategory | undefined,
    sessionPreferences,
  );

  // ── Persist to DB (best-effort; non-fatal if it fails) ────────────────────
  // base variants (pre-session-bias) come from output.variants
  const baseVariantMap = new Map(output.variants.map(v => [v.id, v]));

  void saveGeneration({
    user_id: user.id,
    idea,
    niche,
    platform,
    variants: output.variants,
    recommended_variant_id: `v${output.recommendedVariantId}`,
    credits_used: creditResult.cost,
  }).catch(err => console.error("[viral-strategy/generate] saveGeneration failed:", err));

  // ── Response — return baseScores and adjustedScores separately ────────────
  return Response.json({
    sessionId: output.sessionId,
    niche: output.niche,
    variants: output.rankedVariants.map(r => {
      const base = baseVariantMap.get(r.variant.id);
      const hasSessionBias = sessionPreferences !== undefined;
      return {
        id: r.variant.id,
        hook: r.variant.hook,
        script: r.variant.script,
        format: r.variant.format,
        psychologicalStrategy: r.variant.psychologicalStrategy,
        // Deterministic base scores — same input always returns same values
        baseScores: {
          scrollHold:      base?.scores.scrollHold      ?? r.variant.scores.scrollHold,
          sharePotential:  base?.scores.sharePotential  ?? r.variant.scores.sharePotential,
          messageStrength: base?.scores.messageStrength ?? r.variant.scores.messageStrength,
          finalScore:      base?.finalScore             ?? r.variant.finalScore,
        },
        // Session-adjusted scores (only present when session preferences were passed)
        adjustedScores: hasSessionBias ? {
          scrollHold:      r.variant.scores.scrollHold,
          sharePotential:  r.variant.scores.sharePotential,
          messageStrength: r.variant.scores.messageStrength,
          finalScore:      r.variant.finalScore,
        } : null,
        platformFit:    r.variant.scores.platformFit,
        displayRole:    r.displayRole,
        isRecommended:  r.isRecommended,
      };
    }),
    recommendedId: `v${output.recommendedVariantId}`,
    recommendationReason: output.recommendationReason,
    ranking: output.rankedVariants.map(r => `v${r.variant.id}`),
    creditsRemaining: creditResult.balance,
  });
}
