// app/api/brands/route.ts
// Pure backend API for multi-brand support (Requirement 1).
// UI can call this (no visual changes made here).
// Supports list, create. Update/delete via /brands/[id].
// All operations update brand memory cache and create version snapshots.

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { invalidateBrandMemoryCache } from "@/lib/memory/brand-memory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
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

  const { data, error } = await supabaseAdmin
    .from("brand_profiles")
    .select("id, brand_name, slug, is_default, niche, tone_of_voice, consistency_score, last_trained_at, created_at, updated_at")
    .eq("user_id", user.id)
    .order("is_default", { ascending: false })
    .order("updated_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ brands: data ?? [], defaultId: data?.find(b => b.is_default)?.id ?? data?.[0]?.id });
}

export async function POST(req: Request) {
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

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const name = (body.brand_name || body.name || "Untitled Brand").trim();
  const slug = (body.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)) || null;

  // Create new brand profile row (multi-brand)
  const { data: created, error } = await supabaseAdmin
    .from("brand_profiles")
    .insert({
      user_id: user.id,
      brand_name: name,
      slug,
      is_default: body.make_default === true, // only one default allowed by index
      niche: body.niche ?? null,
      target_audience: body.target_audience ?? null,
      tone_of_voice: body.tone_of_voice ?? null,
      colors: body.colors ?? [],
      content_style_notes: body.content_style_notes ?? null,
      guidelines_pdf_url: body.guidelines_pdf_url ?? null,
      // other rich fields accepted
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If this is the first or marked default, ensure only one default
  if (body.make_default) {
    await supabaseAdmin
      .from("brand_profiles")
      .update({ is_default: false })
      .eq("user_id", user.id)
      .neq("id", created.id);
    await supabaseAdmin
      .from("brand_profiles")
      .update({ is_default: true })
      .eq("id", created.id);
  }

  // Create initial version snapshot
  await supabaseAdmin.from("brand_profile_versions").insert({
    brand_profile_id: created.id,
    user_id: user.id,
    snapshot: created,
    change_summary: "Initial brand created",
    source: "user",
  });

  invalidateBrandMemoryCache(user.id);

  return NextResponse.json({ brand: created });
}
