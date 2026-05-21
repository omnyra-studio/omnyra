import { getUserAndPlan } from '../../../../lib/auth'
import { pollRunway, pollKling } from '../../../../lib/providers'

export async function GET(request) {
  const { user } = await getUserAndPlan(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const provider = searchParams.get('provider')
  const jobId    = searchParams.get('jobId')
  const subtype  = searchParams.get('subtype') ?? 'text2video'

  if (!provider || !jobId) {
    return Response.json({ error: 'provider and jobId are required' }, { status: 400 })
  }

  try {
    if (provider === 'runway') {
      const task = await pollRunway(jobId)
      // Runway statuses: PENDING | RUNNING | SUCCEEDED | FAILED
      if (task.status === 'SUCCEEDED') {
        return Response.json({ status: 'complete', url: task.output?.[0] })
      }
      if (task.status === 'FAILED') {
        return Response.json({ status: 'failed', error: task.failure ?? 'Runway task failed' })
      }
      return Response.json({ status: 'processing', progress: task.progressRatio ?? null })
    }

    if (provider === 'kling') {
      const data = await pollKling(jobId, subtype)
      const task = data.data
      // Kling statuses: submitted | processing | succeed | failed
      if (task?.task_status === 'succeed') {
        const url = task.task_result?.videos?.[0]?.url
        return Response.json({ status: 'complete', url })
      }
      if (task?.task_status === 'failed') {
        return Response.json({ status: 'failed', error: task.task_status_msg ?? 'Kling task failed' })
      }
      return Response.json({ status: 'processing' })
    }

    return Response.json({ error: `Unknown provider: ${provider}` }, { status: 400 })

  } catch (err) {
    console.error('[background/poll]', err.message)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
