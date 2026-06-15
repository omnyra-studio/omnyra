const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const BASE_URL = 'https://api.elevenlabs.io/v1';

export async function generateElevenLabsAudio({
  text,
  voiceId         = '21m00Tcm4TlvDq8ikWAM',
  stability       = 0.75,
  similarityBoost = 0.85,
  style           = 0.6,
  modelId         = 'eleven_multilingual_v2',
}: {
  text:             string;
  voiceId?:         string;
  stability?:       number;
  similarityBoost?: number;
  style?:           number;
  modelId?:         string;
}): Promise<{ url: string; duration: number }> {
  if (!ELEVENLABS_API_KEY) throw new Error('ELEVENLABS_API_KEY not configured');

  const res = await fetch(`${BASE_URL}/text-to-speech/${voiceId}`, {
    method:  'POST',
    headers: {
      'xi-api-key':   ELEVENLABS_API_KEY,
      'Content-Type': 'application/json',
      Accept:         'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id:       modelId,
      voice_settings: { stability, similarity_boost: similarityBoost, style },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`ElevenLabs TTS failed: ${err}`);
  }

  const audioBuffer = await res.arrayBuffer();
  // ~150 words/min speaking rate estimate
  const estimatedDuration = Math.ceil((text.trim().split(/\s+/).length / 150) * 60);

  // Convert to base64 data URL so the pipeline can reference it without an upload step.
  // In production replace this with a Supabase Storage or Vercel Blob upload.
  const base64  = Buffer.from(audioBuffer).toString('base64');
  const dataUrl = `data:audio/mpeg;base64,${base64}`;

  return { url: dataUrl, duration: estimatedDuration };
}
