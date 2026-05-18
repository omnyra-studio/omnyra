import { getUserAndPlan } from '../../../lib/auth'
import { deductCredits } from '../../../lib/credits'
import {
  VIDEO_PROVIDER, IMG2VIDEO_PROVIDER,
  callPika, callKling, callRunway,
} from '../../../lib/providers'

export const maxDuration = 60

export async function POST(request) {
  const { user, plan } = await getUserAndPlan(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { prompt, imageUrl, duration = 5 } = await request.json()
  if (!prompt?.trim()) return Response.json({ error: 'Prompt required' }, { status: 400 })

  // Determine cost by duration
  const creditAction = duration <= 10 ? 'video_30s'
    : duration <= 60  ? 'video_1min'
    : duration <= 120 ? 'video_2min'
    : 'video_3min'

  const credit = await deductCredits(user.id, creditAction)
  if (!credit.success) {
    return Response.json({ error: credit.error, balance: credit.balance }, { status: 402 })
  }

  // Pick provider based on plan and whether a source image was supplied
  const provider = imageUrl
    ? (IMG2VIDEO_PROVIDER[plan] ?? 'pika')
    : (VIDEO_PROVIDER[plan]    ?? 'pika')

  // Pro quality flag for Kling
  const quality = plan === 'studio' ? 'pro' : 'std'

  try {
    let jobId, status

    if (provider === 'pika') {
      const data = await callPika({ prompt, imageUrl, duration })
      jobId  = data.id
      status = data.status ?? 'processing'

    } else if (provider === 'runway') {
      const data = await callRunway({ imageUrl, prompt, duration })
      jobId  = data.id
      status = data.status ?? 'processing'

    } else {
      // kling (pro / studio)
      const data = await callKling({ prompt, imageUrl, duration, quality })
      jobId  = data.data?.task_id
      status = data.data?.task_status ?? 'processing'
    }

    return Response.json({ provider, jobId, status, balance: credit.remaining })

  } catch (err) {
    console.error('Video generation error:', err.message)
    return Response.json({ error: 'Video generation failed', detail: err.message }, { status: 500 })
  }
}
