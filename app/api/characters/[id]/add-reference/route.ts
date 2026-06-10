/**
 * POST /api/characters/[id]/add-reference
 *
 * Saves a reference image URL to character_references.
 * Called after a successful cinematic generation to save the first
 * Flux-generated frame as a new reference for the character.
 *
 * Body: { image_url, source, pose_label?, is_primary?, quality_score? }
 */

import { createServerClient } from "@supabase/ssr";
import { cookies }            from "next/headers";
import { NextResponse }       from "next/server";
import { saveNewReference }   from "@/lib/memory/character-memory";

export const maxDuration = 15;

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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

  const { id: characterId } = await params;

  let body: {
    image_url:     string;
    source?:       "flux_sheet" | "kling_frame" | "user_upload";
    pose_label?:   string;
    is_primary?:   boolean;
    quality_score?: number;
  };
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  if (!body.image_url?.startsWith("http")) {
    return NextResponse.json({ error: "image_url must be a valid URL" }, { status: 400 });
  }

  const ref = await saveNewReference(
    characterId,
    user.id,
    body.image_url,
    body.source ?? "kling_frame",
    body.pose_label,
    body.is_primary ?? false,
    body.quality_score ?? 0.8,
  );

  if (!ref) {
    return NextResponse.json({ error: "Failed to save reference" }, { status: 500 });
  }

  return NextResponse.json({ success: true, reference: ref }, { status: 201 });
}
