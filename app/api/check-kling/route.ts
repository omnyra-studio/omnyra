import crypto from 'crypto'

function generateKlingToken(accessKey: string, secretKey: string) {
  const now = Math.floor(Date.now() / 1000)
  const payload = { iss: accessKey, exp: now + 1800, nbf: now - 5 }
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', secretKey).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const task_id = searchParams.get('task_id')

  if (!task_id) {
    return Response.json({ error: 'No task_id provided' }, { status: 400 })
  }

  if (!process.env.KLING_ACCESS_KEY || !process.env.KLING_SECRET_KEY) {
    return Response.json({ error: 'Kling credentials not configured' }, { status: 500 })
  }

  const token = generateKlingToken(process.env.KLING_ACCESS_KEY, process.env.KLING_SECRET_KEY)

  const res = await fetch(`https://api.klingai.com/v1/videos/text2video/${task_id}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  })

  const { data } = await res.json()

  return Response.json({
    status: data.task_status,
    video_url: data.task_result?.videos?.[0]?.url || null,
  })
}
