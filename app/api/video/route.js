import { getUserAndPlan } from '../../../lib/auth'
import { checkBalance, deductCredits } from '../../../lib/credits'
import { enforceRateLimit } from '../../../lib/api-guard'
import {
  VIDEO_PROVIDER, IMG2VIDEO_PROVIDER,
  callPika, callKling, callRunway,
} from '../../../lib/providers'

export const maxDuration = 120

export async function POST(request) {
  const { user, plan } = await getUserAndPlan(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await enforceRateLimit(user.id, '/api/video')
  if (limited) return Response.json(limited.body, { status: limited.status })

  const { prompt, imageUrl, duration = 5 } = await request.json()
  if (!prompt?.trim()) return Response.json({ error: 'Prompt required' }, { status: 400 })

  const creditAction = duration <= 10 ? 'video_30s'
    : duration <= 60  ? 'video_1min'
    : duration <= 120 ? 'video_2min'
    : 'video_3min'

  // Check balance before calling expensive APIs — but do not deduct yet
  const balCheck = await checkBalance(user.id, creditAction)
  if (!balCheck.ok) {
    return Response.json({ error: 'Insufficient credits', balance: balCheck.balance }, { status: 402 })
  }

  const provider = imageUrl
    ? (IMG2VIDEO_PROVIDER[plan] ?? 'pika')
    : (VIDEO_PROVIDER[plan]    ?? 'pika')

  const quality = plan === 'studio' ? 'pro' : 'std'

  try {
    if (provider === 'pika') {
      const data = await callPika({ prompt, imageUrl, duration })
      if (!data.url) return Response.json({ error: 'Pika returned no video URL' }, { status: 500 })
      // Sync result — deduct only after confirmed URL
      const credit = await deductCredits(user.id, creditAction)
      return Response.json({ provider: 'pika', jobId: null, status: 'complete', url: data.url, balance: credit.remaining })

    } else if (provider === 'runway') {
      const data = await callRunway({ imageUrl, prompt, duration })
      if (!data.id) return Response.json({ error: 'Runway returned no job ID' }, { status: 500 })
      // Async — deduct on confirmed submission, creditAction returned for refund if job fails
      const credit = await deductCredits(user.id, creditAction)
      return Response.json({ provider: 'runway', jobId: data.id, status: data.status ?? 'processing', creditAction, balance: credit.remaining })

    } else {
      const subtype = imageUrl ? 'image2video' : 'text2video'
      const data    = await callKling({ prompt, imageUrl, duration, quality })
      const taskId  = data.data?.task_id
      if (!taskId) return Response.json({ error: 'Kling returned no task ID' }, { status: 500 })
      const credit = await deductCredits(user.id, creditAction)
      return Response.json({ provider: 'kling', subtype, jobId: taskId, status: data.data?.task_status ?? 'processing', creditAction, balance: credit.remaining })
    }

  } catch (err) {
    console.error('Video generation error:', err.message)
    // No deduction happened — safe to just return the error
    return Response.json({ error: 'Video generation failed', detail: err.message }, { status: 500 })
  }
}
