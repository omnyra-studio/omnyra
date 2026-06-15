// AI provider wrappers — thin adapters over the real provider implementations.
// These match the interface expected by the /api/generate-video architecture.

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function callLLM(prompt: string, _model = "claude-sonnet-4-6"): Promise<string> {
  const msg = await anthropic.messages.create({
    model:      "claude-sonnet-4-6",
    max_tokens: 1024,
    messages:   [{ role: "user", content: prompt }],
  });
  const block = msg.content[0];
  return block.type === "text" ? block.text : "";
}

export async function generateImage(prompt: string, _reference?: string): Promise<string> {
  // GetImg/Flux integration — returns image URL.
  // Real implementation: @/lib/orchestrator/getimg-worker.generateGetImgFrame
  const { generateGetImgFrame } = await import("@/lib/orchestrator/getimg-worker");
  const frame = await generateGetImgFrame({
    prompt,
    negativePrompt: "extra limbs, bad anatomy, deformed, watermark, blurry",
    width:          768,
    height:         1344,
    useQualityModel: false,
  });
  return frame.imageUrl;
}

export async function generateVideo({
  prompt,
  model,
  referenceImage,
  duration,
}: {
  prompt:         string;
  model:          string;
  referenceImage: string;
  duration:       number;
  campaignMode?:  boolean;
}): Promise<{ url: string; duration: number }> {
  // Real implementation: @/lib/orchestrator/kling-worker.generateKlingClip
  const { generateKlingClip } = await import("@/lib/orchestrator/kling-worker");
  const { KLING_T2V_PRO, KLING_I2V_PRO } = await import("@/lib/video-models");

  const modelId = referenceImage ? KLING_I2V_PRO : KLING_T2V_PRO;
  const result  = await generateKlingClip({
    shotId:       `gen-video-${Date.now()}`,
    shotNumber:   1,
    visualPrompt: prompt,
    modelId,
    durationSecs: duration,
    aspectRatio:  "9:16",
    imageUrl:     referenceImage || undefined,
  });
  return { url: result.video_url, duration: result.duration_seconds };
}

export async function generateVoice({
  script,
  voiceStyle,
}: {
  script:     string;
  emotion?:   string;
  voiceStyle: string;
}): Promise<{ url: string; duration: number }> {
  // Real implementation: @/lib/orchestrator/elevenlabs-worker.generateSceneAudio
  const { generateSceneAudio } = await import("@/lib/orchestrator/elevenlabs-worker");
  const correlationId = `gen-voice-${Date.now()}`;
  const { audio_url } = await generateSceneAudio(
    { text: script, speed: voiceStyle === "cinematic-narrative" ? 0.95 : 1.0 },
    correlationId,
    "generate-video",
  );
  return { url: audio_url, duration: Math.ceil(script.split(/\s+/).length / 2.5) };
}
