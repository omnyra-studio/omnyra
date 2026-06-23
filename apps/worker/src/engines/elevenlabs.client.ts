/**
 * ElevenLabs TTS client — thin stateless wrapper.
 */

export interface VoiceoverParams {
  text:    string;
  voiceId: string;
  model?:  string;
}

export async function generateVoiceover(
  params: VoiceoverParams,
  apiKey: string,
): Promise<Buffer> {
  const model = params.model ?? "eleven_turbo_v2_5";

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${params.voiceId}`, {
    method:  "POST",
    headers: {
      "xi-api-key":   apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text:           params.text,
      model_id:       model,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs TTS failed: ${err.slice(0, 200)}`);
  }

  return Buffer.from(await res.arrayBuffer());
}
