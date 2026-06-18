import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { engineerSeedancePrompt } from "@/lib/seedance/prompt-engineer";
import { guardPrompt } from "@/lib/security/prompt-guard";
import { parseJsonWithEthnicityFix } from "@/middleware/ethnicityFix";

export const runtime = "nodejs";

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

  let body: { prompt?: string; subjectEthnicity?: string };
  try {
    body = await parseJsonWithEthnicityFix<{ prompt?: string; subjectEthnicity?: string }>(req);
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const raw = body.prompt ?? "";
  const guarded = guardPrompt(raw, 1500);
  if (!guarded.safe) {
    return NextResponse.json({ error: "Prompt blocked by content policy" }, { status: 400 });
  }
  if (!guarded.text.trim()) {
    return NextResponse.json({
      prompt:      "",
      explanation: "Describe your scene — character, action, setting, mood, and duration — and I'll craft your Seedance prompt.",
    });
  }

  try {
    const result = await engineerSeedancePrompt(guarded.text, body.subjectEthnicity);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[seedance-prompt]", err);
    return NextResponse.json({ error: "Failed to engineer prompt" }, { status: 500 });
  }
}