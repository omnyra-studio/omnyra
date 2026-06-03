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

  const audioFile = formData.get("audio") as File | null;
  const userName  = ((formData.get("name") as string | null) ?? "My Voice").trim();

  if (!audioFile) return Response.json({ error: "No audio file provided" }, { status: 400 });

  // Validate sample quality before charging credits
  const validation = validateVoiceSample(audioFile);
  if (!validation.valid) {
    return Response.json({
      error: validation.errors[0],
      errors: validation.errors,
      warnings: validation.warnings,
      qualityScore: validation.qualityScore,
    }, { status: 422 });
  }

  // Deduct 15 credits — BEFORE calling ElevenLabs
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

  const elFormData = new FormData();
  elFormData.append("name", `${userName} — Omnyra`);
  elFormData.append("files", audioFile);
  elFormData.append("description", "Voice clone created via Omnyra AI");

  const res = await fetch("https://api.elevenlabs.io/v1/voices/add", {
    method: "POST",
    headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY },
    body: elFormData,
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({})) as { detail?: string | { message?: string } };
    const detail  = errBody?.detail;
    const msg     = typeof detail === "string" ? detail : (detail?.message ?? "Voice clone failed");
    console.error("[clone-voice] ElevenLabs error:", msg);
    // Refund credits — provider rejected the sample
    await supabaseAdmin.rpc("add_credits", { p_user_id: user.id, p_amount: creditResult.cost });
    return Response.json({ error: msg }, { status: 400 });
  }

  const { voice_id } = await res.json() as { voice_id: string };

  await supabaseAdmin.from("profiles").update({
    voice_id,
    voice_name: userName,
    has_voice_clone: true,
    voice_type: "clone",
  }).eq("id", user.id);

  console.log(`[clone-voice] user=${user.id} voice_id=${voice_id} duration=${validation.estimatedDurationSec}s quality=${validation.qualityScore}`);

  return Response.json({
    voice_id,
    success: true,
    qualityScore: validation.qualityScore,
    warnings: validation.warnings,
    creditsRemaining: creditResult.balance,
  });
}
