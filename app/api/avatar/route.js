import { getUserAndPlan } from '../../../lib/auth'
import { checkBalance, deductCredits } from '../../../lib/credits'
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

  // Balance check before calling APIs — do not deduct yet
  const balCheck = await checkBalance(user.id, creditAction)
  if (!balCheck.ok) {
    return Response.json({ error: 'Insufficient credits', balance: balCheck.balance }, { status: 402 })
  }

  const provider = avatarId && AVATAR_PROVIDER[plan] === 'heygen' ? 'heygen' : 'did'

  try {
    let jobId, status

    if (provider === 'heygen') {
      const data = await callHeyGen({ avatarId, scriptText, voiceId })
      jobId  = data.data?.video_id
      status = 'processing'
    } else {
      if (!imageUrl) {
        return Response.json({ error: 'imageUrl required for D-ID avatar' }, { status: 400 })
      }
      const data = await callDID({ imageUrl, scriptText, audioUrl, voiceId })
      jobId  = data.id
      status = data.status ?? 'processing'
    }

    if (!jobId) return Response.json({ error: 'Avatar provider returned no job ID' }, { status: 500 })

    // Job confirmed — deduct now
    const credit = await deductCredits(user.id, creditAction)
    return Response.json({ provider, jobId, status, creditAction, balance: credit.remaining })

  } catch (err) {
    console.error('Avatar generation error:', err.message)
    // No deduction — API call itself failed
    return Response.json({ error: 'Avatar generation failed', detail: err.message }, { status: 500 })
  }
}
