import { getUserAndPlan } from '../../../lib/auth'
import { deductCredits } from '../../../lib/credits'

export const maxDuration = 60

const STYLE_SUFFIXES = {
  realistic:  ', photorealistic, hyperdetailed, 8k resolution',
  cinematic:  ', cinematic lighting, film grain, movie quality, anamorphic lens',
  anime:      ', anime style, vibrant colors, Studio Ghibli inspired',
  cartoon:    ', cartoon style, bold outlines, colorful, flat design',
  futuristic: ', futuristic, cyberpunk, neon lights, sci-fi, high tech',
  meme:       ', meme style, funny, internet culture',
}

const FLUX_MODEL = {
  free:    'fal-ai/flux/schnell',
  creator: 'fal-ai/flux/schnell',
  pro:     'fal-ai/flux/dev',
  studio:  'fal-ai/flux-pro',
}

export async function POST(request) {
  const { user, plan } = await getUserAndPlan(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { prompt, style = 'realistic' } = await request.json()
  if (!prompt?.trim()) return Response.json({ error: 'No prompt provided' }, { status: 400 })

  const creditAction = (plan === 'pro' || plan === 'studio') ? 'image_hd' : 'image_standard'
  const credit = await deductCredits(user.id, creditAction)
  if (!credit.success) {
    return Response.json({ error: credit.error, balance: credit.balance }, { status: 402 })
  }

  const fullPrompt = prompt.trim() + (STYLE_SUFFIXES[style] ?? '')
  const model      = FLUX_MODEL[plan] ?? 'fal-ai/flux/schnell'
  const isPro      = model === 'fal-ai/flux-pro'
  const isSchnell  = model === 'fal-ai/flux/schnell'

  const body = {
    prompt: fullPrompt,
    image_size: 'portrait_4_3',
    num_images: 1,
    ...(isPro
      ? { safety_tolerance: '2' }
      : { num_inference_steps: isSchnell ? 4 : 28, enable_safety_checker: true }
    ),
  }

  const response = await fetch(`https://fal.run/${model}`, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${process.env.FAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    console.error('Fal AI error:', await response.text())
    return Response.json({ error: 'Image generation failed' }, { status: 500 })
  }

  const data     = await response.json()
  const imageUrl = data.images?.[0]?.url

  if (!imageUrl) return Response.json({ error: 'No image returned' }, { status: 500 })

  return Response.json({ url: imageUrl, model, balance: credit.remaining })
}
