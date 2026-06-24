/**
 * POST /api/v1/classify
 *
 * Stable frontend contract — maps niche input to a display label + confidence.
 * Frontend always receives this shape and nothing else.
 * Internal AI logic (embeddings, LLM, feedback) is completely hidden.
 *
 * Response shape (LOCKED — never change without bumping to /v2/classify):
 *   { "category": "Health & Fitness", "confidence": 0.91 }
 */

import { NextResponse }   from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies }         from "next/headers";
import { classifyNicheV4, type V3Classification } from "@/lib/config/nicheClassifier";
import { NICHE_SETTINGS, type Category } from "@/lib/config/nicheSettings";

export const maxDuration = 15;

// ── Locked display-name map (keys → UI labels) ────────────────────────────────
// Derived from NICHE_SETTINGS — keys map to the CATEGORIES const in nicheSettings.ts.
// Adding a niche: update nicheSettings.ts only.
const KEY_TO_LABEL: Record<string, Category | 'Lifestyle'> = {
  motivation_success:   'Motivation / Success',
  finance_investing:    'Personal Finance & Investing',
  side_hustles:         'Side Hustles & Money Making',
  health_fitness:       'Health & Fitness',
  beauty_skincare:      'Beauty / Skincare / Makeup',
  food_recipes:         'Food & Recipes',
  product_reviews:      'Product Reviews & Launches',
  faceless_stoic:       'Faceless Motivation / Stoic Content',
  luxury_lifestyle:     'Luxury Lifestyle',
  tech_ai:              'Technology & AI',
  relationships_dating: 'Relationships & Dating',
  mental_health:        'Mental Health & Wellness',
  gaming:               'Gaming',
  pets:                 'Pets',
  animation_3d:         '3D Animation',
  lifestyle:            'Lifestyle',
  blocked:              'Mental Health & Wellness', // safe fallback for blocked inputs
};

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { text?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const text = (body.text ?? '').trim();
  if (!text) {
    return NextResponse.json({ error: 'text is required' }, { status: 400 });
  }
  if (text.length > 2000) {
    return NextResponse.json({ error: 'text exceeds 2000 character limit' }, { status: 400 });
  }

  const start = Date.now();
  const result = await classifyNicheV4(text, user.id);

  if (result.blocked) {
    // Never expose the block reason to the client
    return NextResponse.json({ category: 'Mental Health & Wellness', confidence: 0 });
  }

  const cls = result as V3Classification;
  const category = KEY_TO_LABEL[cls.primary] ?? KEY_TO_LABEL['lifestyle'];
  const latencyMs = Date.now() - start;

  console.log(
    `[CLASSIFY_V1] uid=${user.id.slice(0, 8)} ` +
    `→ "${cls.primary}" conf=${cls.confidence.toFixed(2)} ` +
    `strength=${cls.content_strength} path=${cls.path} ${latencyMs}ms`
  );

  // ── Stable v1 response (frontend contract) ───────────────────────────────
  return NextResponse.json({ category, confidence: cls.confidence });
}
