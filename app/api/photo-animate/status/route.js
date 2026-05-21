import { getUserAndPlan } from '../../../../lib/auth'
import { refundCredits } from '../../../../lib/credits'
import { generateKlingJWT } from '../../../../lib/kling'

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

  try {
    if (provider === 'kling') {
      const jwt = generateKlingJWT()
      const res = await fetch(
        `https://api.klingai.com/v1/videos/image2video/${jobId}`,
        { headers: { 'Authorization': `Bearer ${jwt}` } }
      )
      const data = await res.json()
      const task = data.data
      const done   = task?.task_status === 'succeed'
      const failed = task?.task_status === 'failed'
      if (failed && creditAction) {
        await refundCredits(user.id, creditAction, `Kling photo-animate ${jobId} failed`)
      }
      return Response.json({
        status: done ? 'complete' : failed ? 'failed' : 'processing',
        url: task?.task_result?.videos?.[0]?.url ?? null,
        progress: done ? 1 : 0.5,
        refundedCredits: failed && !!creditAction,
      })
    }

    if (provider === 'did') {
      const res = await fetch(`https://api.d-id.com/animations/${jobId}`, {
        headers: { 'Authorization': `Basic ${process.env.DID_API_KEY}` },
      })
      const data = await res.json()
      const done   = data.status === 'done'
      const failed = data.status === 'error'
      if (failed && creditAction) {
        await refundCredits(user.id, creditAction, `D-ID animation ${jobId} failed`)
      }
      return Response.json({
        status: done ? 'complete' : failed ? 'failed' : 'processing',
        url: data.result_url ?? null,
        refundedCredits: failed && !!creditAction,
      })
    }

    return Response.json({ error: `Unknown provider: ${provider}` }, { status: 400 })
  } catch (err) {
    console.error('[photo-animate/status]', err.message)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
