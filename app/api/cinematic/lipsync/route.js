import { getUserAndPlan } from '../../../../lib/auth'
import { deductCredits } from '../../../../lib/credits'
import { callSyncLabs, callSyncSo } from '../../../../lib/providers'

export const maxDuration = 60

export async function POST(request) {
  const { user } = await getUserAndPlan(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { videoUrl, audioUrl } = body
  if (!videoUrl || !audioUrl) {
    return Response.json({ error: 'videoUrl and audioUrl are required' }, { status: 400 })
  }

  const credit = await deductCredits(user.id, 'sync_regen')
  if (!credit.success) {
    return Response.json({ error: credit.error, balance: credit.balance }, { status: 402 })
  }

  if (process.env.SYNCLABS_API_KEY) {
    try {
      const data = await callSyncLabs({ videoUrl, audioUrl })
      return Response.json({ jobId: data.id, status: data.status ?? 'processing', provider: 'synclabs', balance: credit.remaining })
    } catch (err) {
      console.warn('[cinematic/lipsync] SyncLabs failed, trying SyncSo:', err.message)
    }
  }

  if (process.env.SYNCSO_API_KEY) {
    try {
      const data = await callSyncSo({ videoUrl, audioUrl })
      return Response.json({ jobId: data.id, status: data.status ?? 'processing', provider: 'syncso', balance: credit.remaining })
    } catch (err) {
      console.error('[cinematic/lipsync] SyncSo failed:', err.message)
      return Response.json({ error: 'Lip sync failed', detail: err.message }, { status: 500 })
    }
  }

  return Response.json({ error: 'No lip sync provider configured' }, { status: 500 })
}
