import { getUserAndPlan } from '../../../lib/auth'
import { checkBalance, deductCredits } from '../../../lib/credits'
import { callRunwayText, callPika } from '../../../lib/providers'

export const maxDuration = 120

const PERSON_STYLES = [
  "confident young woman walking toward camera",
  "energetic creator talking directly to camera",
  "professional presenter in motion",
  "casual influencer gesturing naturally",
  "athletic person mid-stride toward camera",
]

function buildCinematicPrompt(sceneDescription, personStyle) {
  return `${personStyle}, ${sceneDescription}, cinematic 4K footage, golden hour lighting, shallow depth of field, professional film quality, smooth camera motion, realistic natural movement, no text, no logos, no watermarks, photorealistic, film grain, anamorphic lens flare`
}

export async function POST(request) {
  const { user } = await getUserAndPlan(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { sceneDescription, personStyle = PERSON_STYLES[0], duration = 8 } = body
  if (!sceneDescription?.trim()) {
    return Response.json({ error: 'Scene description required' }, { status: 400 })
  }

  const creditAction = duration <= 10 ? 'video_30s' : 'video_1min'

  // Balance check before calling expensive APIs
  const balCheck = await checkBalance(user.id, creditAction)
  if (!balCheck.ok) {
    return Response.json({ error: 'Insufficient credits', balance: balCheck.balance }, { status: 402 })
  }

  const prompt = buildCinematicPrompt(sceneDescription.trim(), personStyle)

  if (process.env.RUNWAY_API_KEY) {
    try {
      const data = await callRunwayText({ prompt, duration })
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
      console.warn('[cinematic] Runway text2video failed, falling back to Pika:', err.message)
    }
  }

  const falKey = process.env.FAL_API_KEY || process.env.FALAI_API_KEY
  if (!falKey) {
    return Response.json({ error: 'No video generation provider configured' }, { status: 500 })
  }

  try {
    const data = await callPika({ prompt, duration: Math.min(duration, 10) })
    if (!data.url) return Response.json({ error: 'Pika returned no URL' }, { status: 500 })
    // Sync Pika confirmed — deduct now
    const credit = await deductCredits(user.id, creditAction)
    return Response.json({
      provider: 'pika',
      jobId: null,
      status: 'complete',
      url: data.url,
      balance: credit.remaining,
    })
  } catch (err) {
    console.error('[cinematic] Pika failed:', err.message)
    return Response.json({ error: 'Cinematic generation failed', detail: err.message }, { status: 500 })
  }
}
