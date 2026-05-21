import { getUserAndPlan } from '../../../lib/auth'
import { checkBalance, deductCredits } from '../../../lib/credits'
import { generateKlingJWT } from '../../../lib/kling'

export const maxDuration = 60

export async function POST(request) {
  const { user } = await getUserAndPlan(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let body
  try { body = await request.json() } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { photoUrl, prompt, duration = 5 } = body
  if (!photoUrl) return Response.json({ error: 'photoUrl required' }, { status: 400 })

  const creditAction = 'video_30s'
  const balCheck = await checkBalance(user.id, creditAction)
  if (!balCheck.ok) {
    return Response.json({ error: 'Insufficient credits', balance: balCheck.balance }, { status: 402 })
  }

  // Try Kling image-to-video first (best full-body motion)
  if (process.env.KLING_ACCESS_KEY && process.env.KLING_SECRET_KEY) {
    try {
      const jwt = generateKlingJWT()
      const res = await fetch('https://api.klingai.com/v1/videos/image2video', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${jwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_name: 'kling-v1-6',
          image: photoUrl,
          prompt: prompt || 'person walking confidently toward camera, natural movement, cinematic',
          negative_prompt: 'static, frozen, blurry, distorted face',
          duration,
          mode: 'pro',
          aspect_ratio: '9:16',
        }),
      })
      const data = await res.json()
      if (data.data?.task_id) {
        const credit = await deductCredits(user.id, creditAction)
        return Response.json({
          provider: 'kling',
          jobId: data.data.task_id,
          status: 'processing',
          creditAction,
          balance: credit.remaining,
          message: 'Animating your photo — ready in 2-3 minutes',
        })
      }
    } catch (err) {
      console.warn('[photo-animate] Kling failed, trying D-ID:', err.message)
    }
  }

  // Fall back to D-ID animations
  if (process.env.DID_API_KEY) {
    try {
      const res = await fetch('https://api.d-id.com/animations', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${process.env.DID_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          source_url: photoUrl,
          driver_url: 'bank://natural/driver-06',
          config: { motion_factor: 1.0, align_expand_factor: 0.3 },
        }),
      })
      const data = await res.json()
      if (data.id) {
        const credit = await deductCredits(user.id, creditAction)
        return Response.json({
          provider: 'did',
          jobId: data.id,
          status: 'processing',
          creditAction,
          balance: credit.remaining,
          message: 'Animating your photo — ready in 60 seconds',
        })
      }
    } catch (err) {
      console.error('[photo-animate] D-ID failed:', err.message)
    }
  }

  return Response.json({ error: 'No photo animation provider available' }, { status: 503 })
}
