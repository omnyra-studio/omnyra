import { getUserAndPlan } from '../../../lib/auth'
import { deductCredits } from '../../../lib/credits'
import {
  VIDEO_PROVIDER, IMG2VIDEO_PROVIDER,
  callPika, callKling, callRunway,
} from '../../../lib/providers'

export const maxDuration = 120

export async function POST(request) {
  const { user, plan } = await getUserAndPlan(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { prompt, imageUrl, duration = 5 } = await request.json()
  if (!prompt?.trim()) return Response.json({ error: 'Prompt required' }, { status: 400 })

  const creditAction = duration <= 10 ? 'video_30s'
    : duration <= 60  ? 'video_1min'
    : duration <= 120 ? 'video_2min'
    : 'video_3min'

  const credit = await deductCredits(user.id, creditAction)
  if (!credit.success) {
    return Response.json({ error: credit.error, balance: credit.balance }, { status: 402 })
  }

  const provider = imageUrl
    ? (IMG2VIDEO_PROVIDER[plan] ?? 'pika')
    : (VIDEO_PROVIDER[plan]    ?? 'pika')

  const quality = plan === 'studio' ? 'pro' : 'std'

  try {
    if (provider === 'pika') {
      // Fal AI is synchronous — video URL comes back immediately
      const data = await callPika({ prompt, imageUrl, duration })
      return Response.json({ provider: 'pika', jobId: null, status: 'complete', url: data.url, balance: credit.remaining })

    } else if (provider === 'runway') {
      const data = await callRunway({ imageUrl, prompt, duration })
      return Response.json({ provider: 'runway', jobId: data.id, status: data.status ?? 'processing', balance: credit.remaining })

    } else {
      // kling — text2video or image2video, need subtype for correct poll endpoint
      const subtype = imageUrl ? 'image2video' : 'text2video'
      const data    = await callKling({ prompt, imageUrl, duration, quality })
      return Response.json({ provider: 'kling', subtype, jobId: data.data?.task_id, status: data.data?.task_status ?? 'processing', balance: credit.remaining })
    }

  } catch (err) {
    console.error('Video generation error:', err.message)
    return Response.json({ error: 'Video generation failed', detail: err.message }, { status: 500 })
  }
}
