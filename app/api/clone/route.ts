import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { validateVoiceSample, type VoiceQualityScore } from "@/lib/voice-quality";
import {
  withCreditState,
  InsufficientCreditsError,
  CreditReservationError,
} from "@/lib/credits/withCreditState";
import { CREDIT_COSTS } from "@/lib/rules/creditRules";

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

  // Validate quality BEFORE reserving credits — no charge on bad sample
  const validation = validateVoiceSample(audio);
  if (!validation.valid) {
    return Response.json({
      error:        validation.errors[0],
      errors:       validation.errors,
      warnings:     validation.warnings,
      qualityScore: validation.qualityScore,
    }, { status: 422 });
  }

  if (!process.env.ELEVENLABS_API_KEY) {
    return Response.json({ error: "ElevenLabs not configured" }, { status: 503 });
  }

  const cost = CREDIT_COSTS.voice_clone ?? 15;

  try {
    const result = await withCreditState<{ voice_id: string; name: string; warnings: string[]; qualityScore: VoiceQualityScore }>({
      userId: user.id,
      cost,
      run: async () => {
        const elevenForm = new FormData();
        elevenForm.append("name", name);
        elevenForm.append("files", audio);
        elevenForm.append("description", "Cloned via Omnyra AI");

        const res = await fetch("https://api.elevenlabs.io/v1/voices/add", {
          method:  "POST",
          headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY! },
          body:    elevenForm,
        });

        const data = await res.json() as { voice_id?: string; name?: string; detail?: { message?: string } | string };
        if (!res.ok) {
          const errMsg = typeof data?.detail === "string"
            ? data.detail
            : (data?.detail as { message?: string })?.message ?? "ElevenLabs error";
          throw new Error(errMsg);
        }

        return {
          data: {
            voice_id:     data.voice_id!,
            name:         data.name ?? name,
            warnings:     validation.warnings,
            qualityScore: validation.qualityScore,
          },
        };
      },
    });

    // Update profile with cloned voice (best-effort — credits already committed)
    void supabaseAdmin.from("profiles").update({
      voice_id:        result.voice_id,
      voice_name:      name,
      has_voice_clone: true,
      voice_type:      "clone",
    }).eq("id", user.id)
      .then(({ error }) => { if (error) console.warn("[clone] profile update failed:", error.message); });

    console.log(`[clone] user=${user.id} voice_id=${result.voice_id} quality=${validation.qualityScore}`);

    return Response.json({
      success:          true,
      voiceId:          result.voice_id,
      name:             result.name,
      qualityScore:     result.qualityScore,
      warnings:         result.warnings,
      creditsRemaining: null,  // balance not exposed — avoids extra query
    });

  } catch (err) {
    if (err instanceof InsufficientCreditsError || err instanceof CreditReservationError) {
      return Response.json({
        error:    "INSUFFICIENT_CREDITS",
        required: cost,
        balance:  err instanceof InsufficientCreditsError ? err.balance : 0,
        planType: err instanceof InsufficientCreditsError ? err.planType : "unknown",
      }, { status: 402 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[clone] ElevenLabs error:", msg);
    return Response.json({ error: msg }, { status: 400 });
  }
}
