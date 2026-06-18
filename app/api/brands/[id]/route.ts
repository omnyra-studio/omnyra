// app/api/brands/[id]/route.ts
// Backend for specific brand operations: get, update (with auto version), delete.
// Supports asset association (upload happens via /upload then attach here).
// Also supports "memory training" trigger.

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { invalidateBrandMemoryCache, loadBrandMemory } from "@/lib/memory/brand-memory";

export const runtime = "nodejs";

async function getUser() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const { data, error } = await supabaseAdmin
    .from("brand_profiles")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !data) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Also return latest memory view + versions count for "depth"
  const memory = await loadBrandMemory(user.id, id).catch(() => null);

  const { count: versionCount } = await supabaseAdmin
    .from("brand_profile_versions")
    .select("id", { count: "exact", head: true })
    .eq("brand_profile_id", id);

  return NextResponse.json({
    brand: data,
    memory,
    versionCount: versionCount ?? 0,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  // Fetch current for snapshot
  const { data: before } = await supabaseAdmin
    .from("brand_profiles")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!before) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updatePayload: any = {
    ...body,
    updated_at: new Date().toISOString(),
  };
  delete updatePayload.id; delete updatePayload.user_id; delete updatePayload.created_at;

  const { data: updated, error } = await supabaseAdmin
    .from("brand_profiles")
    .update(updatePayload)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Create version for history + "memory training"
  await supabaseAdmin.from("brand_profile_versions").insert({
    brand_profile_id: id,
    user_id: user.id,
    snapshot: updated,
    change_summary: body.change_summary || "Profile updated",
    source: body.source || "user",
  });

  invalidateBrandMemoryCache(user.id, id);

  return NextResponse.json({ brand: updated });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  // Prevent deleting the last brand
  const { count } = await supabaseAdmin
    .from("brand_profiles")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if ((count || 0) <= 1) {
    return NextResponse.json({ error: "Cannot delete your only brand" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("brand_profiles")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  invalidateBrandMemoryCache(user.id);

  return NextResponse.json({ ok: true });
}

// POST /api/brands/[id]  -> attach an already-uploaded asset + optional processing trigger
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: brandProfileId } = await params;
  const body = await req.json().catch(() => ({}));

  const { asset_type, storage_url, file_name, mime_type } = body;
  if (!asset_type || !storage_url) {
    return NextResponse.json({ error: "asset_type and storage_url required" }, { status: 400 });
  }

  const { data: asset, error } = await supabaseAdmin
    .from("brand_assets")
    .insert({
      brand_profile_id: brandProfileId,
      user_id: user.id,
      asset_type,
      storage_url,
      file_name,
      mime_type,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // For guidelines_pdf: could trigger background LLM extract here (future enhancement)
  if (asset_type === "guidelines_pdf" && storage_url) {
    // Placeholder: in real impl, fetch the file (if accessible) or use a vision/OCR service and UPDATE the brand with extracted rules.
    // For now we just store; the intelligence/brand load can reference the asset.
    console.info(`[BRAND_ASSET] PDF attached to ${brandProfileId}. Consider LLM extraction in worker.`);
  }

  invalidateBrandMemoryCache(user.id, brandProfileId);

  return NextResponse.json({ asset });
}
