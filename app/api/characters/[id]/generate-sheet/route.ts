/**
 * POST /api/characters/[id]/generate-sheet
 *
 * Generates a 3-image Flux reference sheet for the character:
 *   1. Front-facing portrait (primary)
 *   2. Emotional/vulnerable expression
 *   3. Tender/gentle smile
 *
 * Saves all images to character_references table and updates ref_frame_url
 * on the character registry to the primary (front-facing) image.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies }           from "next/headers";
import { NextResponse }      from "next/server";
import { generateReferenceSheet } from "@/lib/memory/character-memory";

export const maxDuration = 120;

export async function POST(
  _req: Request,
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

  console.log(`[generate-sheet] charId=${characterId} userId=${user.id}`);

  const result = await generateReferenceSheet(characterId, user.id);

  if (!result) {
    return NextResponse.json(
      { error: "Reference sheet generation failed — check FAL_API_KEY and character ID" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success:    true,
    primaryUrl: result.primaryUrl,
    allUrls:    result.allUrls,
    count:      result.allUrls.length,
  });
}
