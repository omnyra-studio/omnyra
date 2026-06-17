import crypto from 'crypto';

function generateKlingToken(accessKey: string, secretKey: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: accessKey, exp: now + 1800, nbf: now - 5 })).toString('base64url');
  const sig     = crypto.createHmac('sha256', secretKey).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const task_id   = searchParams.get('task_id');
  const is_image  = searchParams.get('is_image') === 'true';

  if (!task_id) {
    return Response.json({ error: 'No task_id provided' }, { status: 400 });
  }

  if (!process.env.KLING_ACCESS_KEY || !process.env.KLING_SECRET_KEY) {
    return Response.json({ error: 'Kling credentials not configured' }, { status: 500 });
  }

  const token    = generateKlingToken(process.env.KLING_ACCESS_KEY, process.env.KLING_SECRET_KEY);
  const endpoint = is_image
    ? `https://api.klingai.com/v1/videos/image2video/${task_id}`
    : `https://api.klingai.com/v1/videos/text2video/${task_id}`;

  const res = await fetch(endpoint, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const json = await res.json() as { data?: { task_status?: string; task_result?: { videos?: Array<{ url?: string }> } } };

  return Response.json({
    status:    json.data?.task_status ?? null,
    video_url: json.data?.task_result?.videos?.[0]?.url ?? null,
  });
}
