import { NextRequest } from 'next/server';

export const maxDuration = 30;

const MODEL_MAP: Record<string, string> = {
  quick:     'fal-ai/kling-video/v3/standard/text-to-video',
  preview:   'fal-ai/kling-video/v3/standard/text-to-video',
  cinematic: 'fal-ai/kling-video/v3/pro/text-to-video',
};

const I2V_MAP: Record<string, string> = {
  quick:     'fal-ai/kling-video/v3/standard/image-to-video',
  preview:   'fal-ai/kling-video/v3/standard/image-to-video',
  cinematic: 'fal-ai/kling-video/v3/pro/image-to-video',
};

export async function POST(req: NextRequest) {
  const falKey = process.env.FAL_API_KEY ?? process.env.FALAI_API_KEY;
  if (!falKey) return Response.json({ error: 'FAL_API_KEY not configured' }, { status: 500 });

  const { prompt, imageUrl, model = 'cinematic' } = await req.json();
  const cinemaPrompt = `${prompt}, cinematic motion, smooth natural movement, 9:16 vertical, high quality`;

  const hasImage = imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('https://');
  const falModel = hasImage ? (I2V_MAP[model] ?? I2V_MAP.cinematic) : (MODEL_MAP[model] ?? MODEL_MAP.cinematic);

  const input: Record<string, unknown> = {
    prompt: cinemaPrompt,
    duration: 10,
    aspect_ratio: '9:16',
  };
  if (hasImage) input.image_url = imageUrl;

  const res = await fetch(`https://queue.fal.run/${falModel}`, {
    method: 'POST',
    headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return Response.json({ error: `Queue submission failed: ${JSON.stringify(err)}` }, { status: 500 });
  }

  const data = await res.json() as { request_id?: string };
  return Response.json({ jobId: data.request_id, model: falModel });
}
