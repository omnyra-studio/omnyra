import { getUserAndPlan } from '../../../lib/auth'
import { checkBalance, deductCredits } from '../../../lib/credits'
import { enforceRateLimit } from '../../../lib/api-guard'
import { callSyncLabs } from '../../../lib/providers'

export const maxDuration = 60

export async function POST(request) {
  const { user } = await getUserAndPlan(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const limited = await enforceRateLimit(user.id, '/api/lipsync')
  if (limited) return Response.json(limited.body, { status: limited.status })

  const { videoUrl, audioUrl } = await request.json()
  if (!videoUrl || !audioUrl) {
    return Response.json({ error: 'videoUrl and audioUrl are required' }, { status: 400 })
  }

  const creditAction = 'sync_regen'

  const balCheck = await checkBalance(user.id, creditAction)
  if (!balCheck.ok) {
    return Response.json({ error: 'Insufficient credits', balance: balCheck.balance }, { status: 402 })
  }

  if (!process.env.SYNCLABS_API_KEY) {
    return Response.json({ error: 'SYNCLABS_API_KEY not configured' }, { status: 500 })
  }

  try {
    const data = await callSyncLabs({ videoUrl, audioUrl })
    if (!data.id) throw new Error('SyncLabs returned no job id')
    const credit = await deductCredits(user.id, creditAction)
    return Response.json({ jobId: data.id, status: data.status ?? 'processing', provider: 'synclabs', creditAction, balance: credit.remaining })
  } catch (err) {
    console.error('[lipsync] SyncLabs failed:', err.message)
    return Response.json({ error: 'Lip sync failed', detail: err.message }, { status: 500 })
  }
}
