import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { checkAndDeductCredits } from "@/lib/rules/creditRules";
import { validateVoiceSample } from "@/lib/voice-quality";

export const maxDuration = 60;

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let formData: FormData;
  try { formData = await req.formData(); }
  catch { return Response.json({ error: "Invalid form data" }, { status: 400 }); }

  const audio = formData.get("audio") as File | null;
  const name  = ((formData.get("name") as string | null) ?? "My Cloned Voice").trim();

  if (!audio) return Response.json({ error: "No audio file provided" }, { status: 400 });

  const validation = validateVoiceSample(audio);
  if (!validation.valid) {
    return Response.json({
      error: validation.errors[0],
      errors: validation.errors,
      warnings: validation.warnings,
      qualityScore: validation.qualityScore,
    }, { status: 422 });
  }

  const creditResult = await checkAndDeductCredits(user.id, "voice_clone");
  if (!creditResult.allowed) {
    return Response.json({
      error: "INSUFFICIENT_CREDITS",
      balance: creditResult.balance,
      required: creditResult.cost,
      planType: creditResult.planType,
    }, { status: 402 });
  }

  if (!process.env.ELEVENLABS_API_KEY) {
    return Response.json({ error: "ElevenLabs not configured" }, { status: 503 });
  }

  const elevenForm = new FormData();
  elevenForm.append("name", name);
  elevenForm.append("files", audio);
  elevenForm.append("description", "Cloned via Omnyra AI");

  const res = await fetch("https://api.elevenlabs.io/v1/voices/add", {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
    body: elevenForm,
  });

  const data = await res.json() as { voice_id?: string; name?: string; detail?: { message?: string } | string };
  if (!res.ok) {
    await supabaseAdmin.rpc("add_credits", { p_user_id: user.id, p_amount: creditResult.cost });
    const errMsg = typeof data?.detail === "string"
      ? data.detail
      : (data?.detail as { message?: string })?.message ?? "ElevenLabs error";
    return Response.json({ error: errMsg }, { status: 400 });
  }

  return Response.json({
    success:          true,
    voiceId:          data.voice_id,
    name:             data.name,
    qualityScore:     validation.qualityScore,
    warnings:         validation.warnings,
    creditsRemaining: creditResult.balance,
  });
}
