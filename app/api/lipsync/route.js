import { getUserAndPlan } from '../../../lib/auth'
import { deductCredits } from '../../../lib/credits'
import { callSyncLabs } from '../../../lib/providers'

export const maxDuration = 60

export async function POST(request) {
  const { user } = await getUserAndPlan(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { videoUrl, audioUrl } = await request.json()
  if (!videoUrl || !audioUrl) {
    return Response.json({ error: 'videoUrl and audioUrl are required' }, { status: 400 })
  }

  const credit = await deductCredits(user.id, 'sync_regen')
  if (!credit.success) {
    return Response.json({ error: credit.error, balance: credit.balance }, { status: 402 })
  }

  try {
    const data = await callSyncLabs({ videoUrl, audioUrl })
    return Response.json({ jobId: data.id, status: data.status ?? 'processing', balance: credit.remaining })
  } catch (err) {
    console.error('SyncLabs error:', err.message)
    return Response.json({ error: 'Lip sync failed', detail: err.message }, { status: 500 })
  }
}
