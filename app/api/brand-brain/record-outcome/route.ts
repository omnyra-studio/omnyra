import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { processOutcome } from "@/lib/brand-brain/learning";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RecordOutcomeBody {
  generationId: string;
  was_published: boolean;
  was_edited: boolean;
  user_rating?: number;
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

  let body: RecordOutcomeBody;
  try {
    body = await req.json() as RecordOutcomeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { generationId, was_published, was_edited, user_rating } = body;

  if (!generationId || typeof was_published !== "boolean" || typeof was_edited !== "boolean") {
    return NextResponse.json(
      { error: "generationId, was_published, and was_edited are required" },
      { status: 400 },
    );
  }

  if (user_rating !== undefined && (user_rating < 1 || user_rating > 5)) {
    return NextResponse.json({ error: "user_rating must be 1–5" }, { status: 400 });
  }

  try {
    await processOutcome(user.id, {
      generationId,
      was_published,
      was_edited,
      user_rating,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[brand-brain/record-outcome] POST error:", err);
    return NextResponse.json({ error: "Failed to record outcome" }, { status: 500 });
  }
}
