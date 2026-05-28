import crypto from 'crypto'

export const maxDuration = 60

function generateKlingToken(accessKey: string, secretKey: string) {
  const now = Math.floor(Date.now() / 1000)
  const payload = { iss: accessKey, exp: now + 1800, nbf: now - 5 }
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', secretKey).update(`${header}.${body}`).digest('base64url')
  return `${header}.${body}.${sig}`
}

export async function POST(req: Request) {
  const { prompt, image_url, duration = '5', aspect_ratio = '9:16', quality = 'high' } = await req.json()

  if (!process.env.KLING_ACCESS_KEY || !process.env.KLING_SECRET_KEY) {
    return Response.json({ error: 'Kling credentials not configured' }, { status: 500 })
  }

  const token = generateKlingToken(process.env.KLING_ACCESS_KEY, process.env.KLING_SECRET_KEY)
  const model = quality === 'high' ? 'kling-v1-6' : 'kling-v1'

  const endpoint = image_url
    ? 'https://api.klingai.com/v1/videos/image2video'
    : 'https://api.klingai.com/v1/videos/text2video'

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model_name: model,
      ...(image_url ? { image_url } : {}),
      prompt,
      negative_prompt: 'blurry, low quality, distorted, watermark, text overlay, ugly',
      cfg_scale: 0.5,
      mode: quality === 'high' ? 'pro' : 'std',
      duration,
      aspect_ratio,
    }),
  })

  if (!res.ok) {
    const err = await res.json()
    return Response.json({ error: 'Kling submission failed', detail: err }, { status: 500 })
  }

  const { data } = await res.json()
  return Response.json({ task_id: data.task_id })
}
