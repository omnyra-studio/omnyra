import { getUserAndPlan } from '../../../lib/auth'
import { checkBalance, deductCredits } from '../../../lib/credits'
import { callSyncLabs, callSyncSo } from '../../../lib/providers'

export const maxDuration = 60

export async function POST(request) {
  const { user } = await getUserAndPlan(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { videoUrl, audioUrl } = await request.json()
  if (!videoUrl || !audioUrl) {
    return Response.json({ error: 'videoUrl and audioUrl are required' }, { status: 400 })
  }

  const creditAction = 'sync_regen'

  // Balance check before calling lip sync APIs
  const balCheck = await checkBalance(user.id, creditAction)
  if (!balCheck.ok) {
    return Response.json({ error: 'Insufficient credits', balance: balCheck.balance }, { status: 402 })
  }

  if (process.env.SYNCLABS_API_KEY) {
    try {
      const data = await callSyncLabs({ videoUrl, audioUrl })
      if (data.id) {
        const credit = await deductCredits(user.id, creditAction)
        return Response.json({ jobId: data.id, status: data.status ?? 'processing', provider: 'synclabs', creditAction, balance: credit.remaining })
      }
    } catch (err) {
      console.warn('[lipsync] SyncLabs failed, trying SyncSo:', err.message)
    }
  }

  if (process.env.SYNCSO_API_KEY) {
    try {
      const data = await callSyncSo({ videoUrl, audioUrl })
      if (data.id) {
        const credit = await deductCredits(user.id, creditAction)
        return Response.json({ jobId: data.id, status: data.status ?? 'processing', provider: 'syncso', creditAction, balance: credit.remaining })
      }
    } catch (err) {
      console.error('[lipsync] SyncSo failed:', err.message)
      return Response.json({ error: 'Lip sync failed', detail: err.message }, { status: 500 })
    }
  }

  return Response.json({ error: 'No lip sync provider configured (SYNCLABS_API_KEY or SYNCSO_API_KEY required)' }, { status: 500 })
}
