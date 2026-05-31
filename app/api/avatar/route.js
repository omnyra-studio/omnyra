import { getUserAndPlan } from '../../../lib/auth'
import { checkBalance, deductCredits } from '../../../lib/credits'
import { callDID } from '../../../lib/providers'

export const maxDuration = 60

export async function POST(request) {
  const { user } = await getUserAndPlan(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { imageUrl, scriptText, audioUrl, voiceId, duration = 30 } = await request.json()

  if (!scriptText && !audioUrl) {
    return Response.json({ error: 'scriptText or audioUrl required' }, { status: 400 })
  }
  if (!imageUrl) {
    return Response.json({ error: 'imageUrl required' }, { status: 400 })
  }

  const creditAction = duration <= 30 ? 'avatar_30s' : 'avatar_60s'

  const balCheck = await checkBalance(user.id, creditAction)
  if (!balCheck.ok) {
    return Response.json({ error: 'Insufficient credits', balance: balCheck.balance }, { status: 402 })
  }

  try {
    const data = await callDID({ imageUrl, scriptText, audioUrl, voiceId })
    const jobId = data.id
    if (!jobId) return Response.json({ error: 'D-ID returned no job ID' }, { status: 500 })

    const credit = await deductCredits(user.id, creditAction)
    return Response.json({ provider: 'did', jobId, status: data.status ?? 'processing', creditAction, balance: credit.remaining })

  } catch (err) {
    console.error('Avatar generation error:', err.message)
    return Response.json({ error: 'Avatar generation failed', detail: err.message }, { status: 500 })
  }
}
