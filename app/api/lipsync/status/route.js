import { getUserAndPlan } from '../../../../lib/auth'
import { refundCredits } from '../../../../lib/credits'
import { pollSyncLabs } from '../../../../lib/providers'

export async function GET(request) {
  const { user } = await getUserAndPlan(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const jobId        = searchParams.get('jobId')
  const provider     = searchParams.get('provider')
  const creditAction = searchParams.get('creditAction') ?? null

  if (!jobId || !provider) {
    return Response.json({ error: 'jobId and provider required' }, { status: 400 })
  }

  if (provider !== 'synclabs') {
    return Response.json({ error: `Unknown provider: ${provider}` }, { status: 400 })
  }

  try {
    const data = await pollSyncLabs(jobId)
    const done   = data.status === 'completed'
    const failed = data.status === 'failed' || data.status === 'error'
    if (failed && creditAction) {
      await refundCredits(user.id, creditAction, `SyncLabs job ${jobId} failed`)
    }
    return Response.json({
      status: done ? 'complete' : failed ? 'failed' : 'processing',
      url: data.url ?? data.videoUrl ?? null,
      refundedCredits: failed && !!creditAction,
    })
  } catch (err) {
    console.error('[lipsync/status]', err.message)
    return Response.json({ error: 'Status check failed', detail: err.message }, { status: 500 })
  }
}
