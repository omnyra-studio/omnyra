import { getUserAndPlan } from '../../../lib/auth'
import { refundCredits } from '../../../lib/credits'
import { pollKling, pollRunway, pollDID, pollSyncLabs } from '../../../lib/providers'

function normaliseKling(data) {
  const s = data.data?.task_status
  return {
    status: s === 'succeed' ? 'complete' : s === 'failed' ? 'failed' : 'processing',
    url: data.data?.task_result?.videos?.[0]?.url ?? null,
  }
}

function normaliseRunway(data) {
  return {
    status: data.status === 'SUCCEEDED' ? 'complete' : data.status === 'FAILED' ? 'failed' : 'processing',
    url: data.output?.[0] ?? null,
  }
}

function normaliseDID(data) {
  return {
    status: data.status === 'done' ? 'complete' : data.status === 'error' ? 'failed' : 'processing',
    url: data.result_url ?? null,
  }
}

function normaliseSyncLabs(data) {
  return {
    status: data.status === 'completed' ? 'complete' : data.status === 'failed' ? 'failed' : 'processing',
    url: data.url ?? null,
  }
}

export async function GET(request) {
  const { user } = await getUserAndPlan(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const jobId       = searchParams.get('jobId')
  const provider    = searchParams.get('provider')
  const subtype     = searchParams.get('subtype') ?? 'text2video'
  // creditAction is passed by the client from the original submit response
  // so failed jobs can be refunded automatically
  const creditAction = searchParams.get('creditAction') ?? null

  if (!jobId || !provider) {
    return Response.json({ error: 'jobId and provider required' }, { status: 400 })
  }

  try {
    let raw, normalised

    switch (provider) {
      case 'kling':
        raw = await pollKling(jobId, subtype)
        normalised = normaliseKling(raw)
        break
      case 'runway':
        raw = await pollRunway(jobId)
        normalised = normaliseRunway(raw)
        break
      case 'did':
        raw = await pollDID(jobId)
        normalised = normaliseDID(raw)
        break
      case 'synclabs':
        raw = await pollSyncLabs(jobId)
        normalised = normaliseSyncLabs(raw)
        break
      default:
        return Response.json({ error: `Unknown provider: ${provider}` }, { status: 400 })
    }

    // Auto-refund credits when job fails — client must stop polling after receiving this
    if (normalised.status === 'failed' && creditAction) {
      await refundCredits(user.id, creditAction, `${provider} job ${jobId} failed`)
      normalised.refundedCredits = true
      normalised.creditAction    = creditAction
    }

    return Response.json(normalised)

  } catch (err) {
    console.error('Status poll error:', err.message)
    return Response.json({ error: 'Status check failed', detail: err.message }, { status: 500 })
  }
}
