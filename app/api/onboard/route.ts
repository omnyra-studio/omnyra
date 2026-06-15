/**
 * POST /api/onboard
 *
 * Called after signup to complete brand setup and seed initial creator memory.
 * Does NOT grant credits — signup route (auth/signup) already handles that.
 *
 * Body:
 *   brandName?      string  — business/creator name
 *   businessType?   string  — "ecommerce" | "personal_brand" | "agency" | "content_creator" | other
 *   targetAudience? string  — who they're making content for
 *   brandTone?      string  — described tone, e.g. "professional but warm"
 *   niche?          string  — content niche, e.g. "fitness", "beauty", "finance"
 *
 * Returns:
 *   { success, creditsBalance, message, nextStep }
 */

import { NextRequest, NextResponse }   from "next/server";
import { createServerClient }          from "@supabase/ssr";
import { cookies }                     from "next/headers";
import { supabaseAdmin }               from "@/lib/supabase/admin";
import { updateMemoryFromGeneration }  from "@/lib/user-memory";

// Ghost Test–compliant seed memories — observable behavioral patterns only.
// These give the generation engine a behavioural baseline before the user has
// any real performance data. No emotion labels anywhere.
const SEED_MEMORIES = [
  "Deliberate character pacing — 3-second pause before first spoken word, direct forward gaze at frame entry — correlated with viewer tracking past the 5-second scroll threshold.",
  "Decisive physical action in the opening 2 seconds (object pickup, step toward camera, or clear hand gesture) holds initial forward momentum without requiring verbal hook.",
  "Measured rhythm between action and pause — action → 2-second hold → next action — sustains forward pull across a 25–30 second arc without visual fatigue.",
];

// Map businessType to a visual style preset for the generation engine
function deriveStylePreset(businessType: string | undefined): string {
  const map: Record<string, string> = {
    ecommerce:        "product-forward, clean backgrounds, deliberate object handling, natural lighting",
    personal_brand:   "face-led, direct eye contact, shallow depth of field, conversational framing",
    agency:           "polished, structured composition, brand-consistent color grade, authoritative pace",
    content_creator:  "authentic, varied environments, spontaneous physical transitions, relatable scale",
  };
  return map[businessType ?? ""] ?? "cinematic but realistic, warm natural lighting, 9:16 vertical";
}

export async function POST(req: NextRequest) {
  // ── Auth via Supabase SSR (never trust userId from body) ─────────────────────
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────────
  let body: {
    brandName?:      string;
    businessType?:   string;
    targetAudience?: string;
    brandTone?:      string;
    niche?:          string;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const brandTone    = (body.brandTone    ?? "warm and professional").trim();
  const stylePreset  = deriveStylePreset(body.businessType);

  // ── 1. Upsert brand profile ───────────────────────────────────────────────────
  const { error: brandErr } = await supabaseAdmin
    .from("brand_profiles")
    .upsert(
      {
        user_id:              user.id,
        brand_name:           body.brandName      ?? null,
        niche:                body.niche          ?? null,
        target_audience:      body.targetAudience ?? null,
        tone_of_voice:        brandTone,
        style_preset:         stylePreset,
        content_style_notes:  `Onboarded via wizard. Business type: ${body.businessType ?? "unspecified"}.`,
        updated_at:           new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );

  if (brandErr) {
    // Non-fatal for onboarding — log and continue. Brand memory can be set later.
    console.warn("[onboard] brand_profiles upsert failed (non-fatal):", brandErr.message);
  }

  // ── 2. Ensure credits row exists (signup may have used profiles.credits only) ─
  const { error: creditsErr } = await supabaseAdmin
    .from("credits")
    .upsert(
      { user_id: user.id, balance: 30 },
      { onConflict: "user_id", ignoreDuplicates: true },
    );

  if (creditsErr) {
    console.warn("[onboard] credits upsert failed (non-fatal):", creditsErr.message);
  }

  // ── 3. Read current balance to return to client ───────────────────────────────
  const { data: creditsRow } = await supabaseAdmin
    .from("credits")
    .select("balance")
    .eq("user_id", user.id)
    .single();

  // ── 4. Seed creator_memory with Ghost Test–compliant behavioral baselines ─────
  const memoryWrites = SEED_MEMORIES.map(content =>
    updateMemoryFromGeneration(user.id, {
      type:    "behavioral_note",
      content,
      metadata: {
        source:     "onboarding_seed",
        niche:      body.niche      ?? null,
        tone:       brandTone,
        ghost_test: "observable_actions_only",
      },
    }),
  );

  // Non-blocking — don't fail onboarding if memory writes are slow
  void Promise.allSettled(memoryWrites);

  // ── Response ──────────────────────────────────────────────────────────────────
  return NextResponse.json({
    success:        true,
    creditsBalance: creditsRow?.balance ?? 30,
    message:        "Brand profile saved. Creator memory seeded with behavioral baselines.",
    nextStep:       "Generate your first 30s video at /create",
  });
}
