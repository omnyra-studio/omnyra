import { getUserAndPlan } from '../../../lib/auth'
import { checkBalance, deductCredits } from '../../../lib/credits'
import { callPika, callRunway } from '../../../lib/providers'

export const maxDuration = 120

const BG_PREFIX = 'Cinematic background scene, no people, no text, no logos, loopable, '

export async function POST(request) {
  const { user } = await getUserAndPlan(request)
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

  // Balance check before calling expensive APIs
  const balCheck = await checkBalance(user.id, creditAction)
  if (!balCheck.ok) {
    return Response.json({ error: 'Insufficient credits', balance: balCheck.balance }, { status: 402 })
  }

  const prompt = BG_PREFIX + description.trim()

  if (imageUrl && process.env.RUNWAY_API_KEY) {
    try {
      const data = await callRunway({ imageUrl, prompt, duration })
      if (data.id) {
        // Async Runway job confirmed — deduct now
        const credit = await deductCredits(user.id, creditAction)
        return Response.json({
          provider: 'runway',
          jobId: data.id,
          status: data.status ?? 'processing',
          creditAction,
          balance: credit.remaining,
        })
      }
    } catch (err) {
      console.warn('[background] Runway failed, falling back to Pika:', err.message)
    }
  }

  const falKey = process.env.FAL_API_KEY || process.env.FALAI_API_KEY
  if (!falKey) {
    return Response.json({ error: 'No video generation provider configured' }, { status: 500 })
  }

  try {
    const data = await callPika({ prompt, imageUrl, duration })
    if (!data.url) return Response.json({ error: 'Pika returned no URL' }, { status: 500 })
    // Sync Pika result confirmed — deduct now
    const credit = await deductCredits(user.id, creditAction)
    return Response.json({
      provider: 'pika',
      jobId: null,
      status: 'complete',
      url: data.url,
      balance: credit.remaining,
    })
  } catch (err) {
    console.error('[background] Pika failed:', err.message)
    return Response.json({ error: 'Background generation failed', detail: err.message }, { status: 500 })
  }
}
