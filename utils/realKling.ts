const KLING_API_KEY = process.env.KLING_API_KEY;
const BASE_URL = 'https://api.klingai.com';

export async function generateKlingVideo({
  prompt,
  modelId     = 'kling-v3-pro',
  duration    = 6,
  aspectRatio = '9:16',
  imageUrl,
}: {
  prompt:       string;
  modelId?:     string;
  duration?:    number;
  aspectRatio?: string;
  imageUrl?:    string;
}): Promise<{ url: string; duration: number }> {
  if (!KLING_API_KEY) throw new Error('KLING_API_KEY not configured');

  const endpoint = imageUrl
    ? `${BASE_URL}/v1/videos/image2video`
    : `${BASE_URL}/v1/videos/text2video`;

  const body: Record<string, unknown> = { model: modelId, prompt, duration, aspect_ratio: aspectRatio };
  if (imageUrl) body.image_url = imageUrl;

  const createRes = await fetch(endpoint, {
    method:  'POST',
    headers: { Authorization: `Bearer ${KLING_API_KEY}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`Kling create task failed: ${err}`);
  }

  const { data: { task_id } } = await createRes.json();

  const pollEndpoint = imageUrl
    ? `${BASE_URL}/v1/videos/image2video/${task_id}`
    : `${BASE_URL}/v1/videos/text2video/${task_id}`;

  // Poll every 5 s, up to 5 minutes
  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 5000));

    const pollRes = await fetch(pollEndpoint, {
      headers: { Authorization: `Bearer ${KLING_API_KEY}` },
    });

    if (!pollRes.ok) continue;

    const { data } = await pollRes.json();

    if (data.task_status === 'succeed' && data.task_result?.videos?.[0]?.url) {
      return { url: data.task_result.videos[0].url, duration };
    }
    if (data.task_status === 'failed') {
      throw new Error(`Kling generation failed: ${data.task_status_msg ?? 'unknown error'}`);
    }
  }

  throw new Error('Kling generation timed out after 5 minutes');
}
