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

// Pro/Studio get higher inference steps for better quality
const STEPS_BY_PLAN = { free: 20, creator: 24, pro: 28, studio: 35 }

export async function POST(request) {
  const { user, plan } = await getUserAndPlan(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { prompt, style = 'realistic' } = await request.json()
  if (!prompt?.trim()) return Response.json({ error: 'No prompt provided' }, { status: 400 })

  // HD quality for Pro and Studio
  const creditAction = (plan === 'pro' || plan === 'studio') ? 'image_hd' : 'image_standard'
  const credit = await deductCredits(user.id, creditAction)
  if (!credit.success) {
    return Response.json({ error: credit.error, balance: credit.balance }, { status: 402 })
  }

  const fullPrompt = prompt.trim() + (STYLE_SUFFIXES[style] ?? '')
  const steps      = STEPS_BY_PLAN[plan] ?? 28

  const response = await fetch('https://fal.run/fal-ai/flux/dev', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${process.env.FALAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: fullPrompt,
      image_size: 'portrait_4_3',
      num_inference_steps: steps,
      num_images: 1,
      enable_safety_checker: true,
    }),
  })

  if (!response.ok) {
    console.error('Fal AI error:', await response.text())
    return Response.json({ error: 'Image generation failed' }, { status: 500 })
  }

  const data     = await response.json()
  const imageUrl = data.images?.[0]?.url

  if (!imageUrl) return Response.json({ error: 'No image returned' }, { status: 500 })

  return Response.json({ url: imageUrl, balance: credit.remaining })
}
