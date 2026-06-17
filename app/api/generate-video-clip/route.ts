import { NextRequest } from 'next/server';
import crypto from 'crypto';

export const maxDuration = 30;

function generateKlingToken(accessKey: string, secretKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: accessKey, exp: now + 1800, nbf: now - 5 })).toString('base64url');
  const sig     = crypto.createHmac('sha256', secretKey).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

const MODE_MAP: Record<string, 'pro' | 'std'> = {
  quick:     'std',
  preview:   'std',
  cinematic: 'pro',
};

export async function POST(req: NextRequest) {
  if (!process.env.KLING_ACCESS_KEY || !process.env.KLING_SECRET_KEY) {
    return Response.json({ error: 'Kling credentials not configured' }, { status: 500 });
  }

  const { prompt, imageUrl, model = 'cinematic' } = await req.json();
  const cinemaPrompt = `${prompt}, cinematic motion, smooth natural movement, 9:16 vertical, high quality`;
  const hasImage = imageUrl && typeof imageUrl === 'string' && imageUrl.startsWith('https://');
  const mode = MODE_MAP[model] ?? 'pro';

  const token = generateKlingToken(process.env.KLING_ACCESS_KEY, process.env.KLING_SECRET_KEY);
  const endpoint = hasImage
    ? 'https://api.klingai.com/v1/videos/image2video'
    : 'https://api.klingai.com/v1/videos/text2video';

  const body: Record<string, unknown> = {
    model_name:      'kling-v1-6',
    mode,
    prompt:          cinemaPrompt,
    negative_prompt: 'blurry, low quality, distorted, watermark, text overlay, ugly',
    cfg_scale:       0.5,
    duration:        '10',
    aspect_ratio:    '9:16',
  };
  if (hasImage) body.image_url = imageUrl;

  const res = await fetch(endpoint, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return Response.json({ error: `Kling submission failed: ${JSON.stringify(err)}` }, { status: 500 });
  }

  const data = await res.json() as { code?: number; data?: { task_id?: string }; message?: string };
  if (data.code !== 0 || !data.data?.task_id) {
    return Response.json({ error: `Kling API error: ${JSON.stringify(data)}` }, { status: 500 });
  }

  return Response.json({ jobId: data.data.task_id, mode: `direct:kling-v1-6:${mode}`, isImage2Video: hasImage });
}
