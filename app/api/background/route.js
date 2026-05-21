import { getUserAndPlan } from '../../../lib/auth'
import { deductCredits } from '../../../lib/credits'
import {
  callPika, callKling, callRunway,
  IMG2VIDEO_PROVIDER,
} from '../../../lib/providers'

export const maxDuration = 120

// Cinematic background prompt prefix — steers all providers away from people
const BG_PREFIX = 'Cinematic background scene, no people, no text, no logos, loopable, '

const BG_PROVIDER = {
  free:    'pika',
  creator: 'pika',
  pro:     'kling',
  studio:  'runway', // runway for img2video when imageUrl provided, else kling
}

export async function POST(request) {
  const { user, plan } = await getUserAndPlan(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { description, imageUrl, duration = 5 } = body
  if (!description?.trim()) {
    return Response.json({ error: 'Background description required' }, { status: 400 })
  }

  const creditAction = duration <= 10 ? 'video_30s' : 'video_1min'
  const credit = await deductCredits(user.id, creditAction)
  if (!credit.success) {
    return Response.json({ error: credit.error, balance: credit.balance }, { status: 402 })
  }

  const prompt = BG_PREFIX + description.trim()

  // Provider selection:
  //   With imageUrl → Runway (img2video) for pro/studio, Pika for free/creator
  //   Text-only    → Kling for pro/studio, Pika for free/creator
  let provider = BG_PROVIDER[plan] ?? 'pika'
  if (provider === 'runway' && !imageUrl) provider = 'kling'
  if (imageUrl && (plan === 'free' || plan === 'creator')) provider = 'pika'

  try {
    if (provider === 'runway') {
      // Async — client must poll /api/background/poll
      const data = await callRunway({ imageUrl, prompt, duration })
      return Response.json({
        provider: 'runway',
        jobId: data.id,
        status: data.status ?? 'processing',
        balance: credit.remaining,
      })
    }

    if (provider === 'kling') {
      const subtype = imageUrl ? 'image2video' : 'text2video'
      const data    = await callKling({ prompt, imageUrl, duration, quality: 'pro' })
      return Response.json({
        provider: 'kling',
        subtype,
        jobId: data.data?.task_id,
        status: data.data?.task_status ?? 'processing',
        balance: credit.remaining,
      })
    }

    // Pika — synchronous via fal.run
    const data = await callPika({ prompt, imageUrl, duration })
    return Response.json({
      provider: 'pika',
      jobId: null,
      status: 'complete',
      url: data.url,
      balance: credit.remaining,
    })

  } catch (err) {
    console.error('[background] generation failed:', err.message)
    return Response.json({ error: 'Background generation failed', detail: err.message }, { status: 500 })
  }
}
