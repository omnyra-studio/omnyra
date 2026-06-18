/**
 * GET /api/test-elevenlabs
 * Diagnoses ElevenLabs video/Seedance API availability.
 * Image & Video (Seedance) is web-UI only — this confirms which REST paths exist.
 */
export const maxDuration = 30;

const CANDIDATE_ENDPOINTS = [
  "https://api.elevenlabs.io/v1/video/seedance/generate",
  "https://api.elevenlabs.io/v1/video-generation",
  "https://api.elevenlabs.io/v1/video/seedance",
] as const;

const PROBE_BODY = {
  prompt:           "Test clip — woman on beach, cinematic motion",
  duration_seconds: 6,
  resolution:       "720p",
  motion_intensity: "high",
  generate_audio:   false,
};

export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY ?? "";
  if (!apiKey) {
    return Response.json({ error: "ELEVENLABS_API_KEY not set" }, { status: 500 });
  }

  const probes = await Promise.all(
    CANDIDATE_ENDPOINTS.map(async (endpoint) => {
      const res = await fetch(endpoint, {
        method:  "POST",
        headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
        body:    JSON.stringify(PROBE_BODY),
      });
      const text = await res.text();
      let body: unknown = text;
      try { body = JSON.parse(text); } catch { /* raw text */ }
      return { endpoint, status: res.status, statusText: res.statusText, body };
    }),
  );

  const ttsCheck = await fetch("https://api.elevenlabs.io/v1/voices", {
    headers: { "xi-api-key": apiKey },
  });

  const anyVideoWorks = probes.some(p => p.status >= 200 && p.status < 300);

  return Response.json({
    diagnosis: anyVideoWorks
      ? "At least one video endpoint responded OK — check probes for the working URL."
      : "No public ElevenLabs Seedance/video REST API found. Image & Video is dashboard-only (beta). Use elevenlabs.io → Image & Video in the browser, or use a separate video provider API for automation.",
    openapi_note: "Official openapi.json only lists /v1/music/video-to-music for video-related REST (not Seedance generation).",
    docs: "https://elevenlabs.io/docs/overview/capabilities/image-video",
    tts_api_works: ttsCheck.ok,
    tts_status: ttsCheck.status,
    video_probes: probes,
    recommendation: [
      "Video via API: not available on ElevenLabs public API today.",
      "Voiceover via API: use /v1/text-to-speech/{voice_id} (works).",
      "Automated cinematic pipeline needs a video provider with a public API (e.g. ByteDance Seedance via fal.ai) until ElevenLabs ships one.",
    ],
    apiKeyPrefix: apiKey.substring(0, 4) + "****",
  });
}