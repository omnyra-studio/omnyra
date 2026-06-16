import { NextRequest } from 'next/server';
import { extractVideoUrl } from '@/lib/video-models';

export async function GET(req: NextRequest) {
  const falKey = process.env.FAL_API_KEY ?? process.env.FALAI_API_KEY;
  if (!falKey) return Response.json({ error: 'FAL_API_KEY not configured' }, { status: 500 });

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('jobId');
  const model = searchParams.get('model');
  if (!jobId || !model) return Response.json({ error: 'jobId and model required' }, { status: 400 });

  const statusRes = await fetch(
    `https://queue.fal.run/${model}/requests/${jobId}/status`,
    { headers: { 'Authorization': `Key ${falKey}` } },
  );
  if (!statusRes.ok) return Response.json({ status: 'error' }, { status: 500 });

  const status = await statusRes.json() as { status?: string; queue_position?: number; error?: string };

  if (status.status === 'COMPLETED') {
    const resultRes = await fetch(
      `https://queue.fal.run/${model}/requests/${jobId}`,
      { headers: { 'Authorization': `Key ${falKey}` } },
    );
    if (!resultRes.ok) return Response.json({ status: 'error' }, { status: 500 });
    const result = await resultRes.json();
    const videoUrl = extractVideoUrl(result);
    if (!videoUrl) return Response.json({ status: 'failed', error: 'No video URL in response' });
    return Response.json({ status: 'complete', videoUrl });
  }

  if (status.status === 'FAILED') {
    return Response.json({ status: 'failed', error: status.error ?? 'Generation failed' });
  }

  return Response.json({ status: 'processing', queuePosition: status.queue_position });
}
