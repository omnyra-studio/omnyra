import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const maxDuration = 60;

// Voice generation — auth required, no credit deduction.
// preview mode (default): text capped at 200 chars for voice selection UI.
// full mode (full=true): no cap, stable settings, used by cinematic pipeline.

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: { text?: string; voice_id?: string; full?: boolean };
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { text, voice_id, full = false } = body;
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey)    return Response.json({ error: "ElevenLabs not configured" }, { status: 503 });
  if (!voice_id)  return Response.json({ error: "voice_id required" }, { status: 400 });
  if (!text?.trim()) return Response.json({ error: "text required" }, { status: 400 });

  const ttsText = full ? text.trim() : text.trim().substring(0, 200);
  const voiceSettings = full
    ? { stability: 0.75, similarity_boost: 0.85, style: 0.0, use_speaker_boost: true }
    : { stability: 0.35, similarity_boost: 0.75, style: 0.65, use_speaker_boost: true, speed: 1.08 };

  console.log(`[TEST_VOICE_MODE] full=${full} textLength=${text.length} truncated=${!full && text.length > 200}`);

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: ttsText,
        model_id: "eleven_turbo_v2_5",
        voice_settings: voiceSettings,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[test-voice] ElevenLabs error:", response.status, errText.substring(0, 200));
      return Response.json({ error: `Voice preview failed (HTTP ${response.status})` }, { status: 502 });
    }

    const buffer = await response.arrayBuffer();
    return new Response(buffer, {
      headers: { "Content-Type": "audio/mpeg", "Content-Length": buffer.byteLength.toString() },
    });
  } catch (err) {
    console.error("[test-voice] error:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Voice preview failed" }, { status: 500 });
  }
}
