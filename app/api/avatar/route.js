import { getUserAndPlan } from '../../../lib/auth'
import { deductCredits } from '../../../lib/credits'
import { AVATAR_PROVIDER, callDID, callHeyGen } from '../../../lib/providers'

export const maxDuration = 60

export async function POST(request) {
  const { user, plan } = await getUserAndPlan(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { imageUrl, scriptText, audioUrl, voiceId, avatarId, duration = 30 } = await request.json()

  if (!scriptText && !audioUrl) {
    return Response.json({ error: 'scriptText or audioUrl required' }, { status: 400 })
  }

  const creditAction = duration <= 30 ? 'avatar_30s' : 'avatar_60s'
  const credit = await deductCredits(user.id, creditAction)
  if (!credit.success) {
    return Response.json({ error: credit.error, balance: credit.balance }, { status: 402 })
  }

  // avatarId present = HeyGen preset avatar; imageUrl only = custom image → always D-ID
  const provider = avatarId && AVATAR_PROVIDER[plan] === 'heygen' ? 'heygen' : 'did'

  try {
    let jobId, status

    if (provider === 'heygen') {
      // Studio plan → HeyGen (higher quality, more avatar options)
      const data = await callHeyGen({ avatarId, scriptText, voiceId })
      jobId  = data.data?.video_id
      status = 'processing'

    } else {
      // Free / Creator / Pro → D-ID
      if (!imageUrl) {
        return Response.json({ error: 'imageUrl required for D-ID avatar' }, { status: 400 })
      }
      const data = await callDID({ imageUrl, scriptText, audioUrl, voiceId })
      jobId  = data.id
      status = data.status ?? 'processing'
    }

    return Response.json({ provider, jobId, status, balance: credit.remaining })

  } catch (err) {
    console.error('Avatar generation error:', err.message)
    return Response.json({ error: 'Avatar generation failed', detail: err.message }, { status: 500 })
  }
}
