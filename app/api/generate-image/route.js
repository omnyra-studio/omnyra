import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getBrandProfile, getBrandSystemPrompt } from "../../../lib/brand";
import { checkCache, saveCache, logUsageEvent } from "../../../lib/cache";

export const maxDuration = 60

const QUALITY_PROMPTS = {
  product:   'professional product photography, studio lighting, clean background, sharp focus, commercial grade, 8K resolution',
  lifestyle: 'lifestyle photography, natural lighting, authentic, candid, shallow depth of field, warm tones',
  thumbnail: 'eye-catching thumbnail, bold colors, high contrast, dynamic composition, viral aesthetic',
  portrait:  'professional portrait, soft key light, bokeh background, teal and orange grade, film grain 0.08',
  ugc:       'authentic UGC style, handheld camera feel, natural lighting, real person, relatable aesthetic',
}

const NEGATIVE_PROMPT =
  'blurry, low quality, distorted, watermark, text overlay, ugly, deformed, bad anatomy, artificial looking, plastic, stock photo'

export async function POST(req) {
  const {
    prompt,
    niche,
    style = 'lifestyle',
    quality = 'pro',
    aspect_ratio = '9:16',
    num_images = 4,
    seed,
  } = await req.json()

  if (!prompt?.trim()) {
    return Response.json({ error: 'prompt required' }, { status: 400 })
  }

  const falKey = process.env.FAL_API_KEY || process.env.FALAI_API_KEY
  if (!falKey) {
    return Response.json({ error: 'FAL_API_KEY not configured' }, { status: 500 })
  }

  // Optional auth — brand/cache only when user is available
  let userId = null
  let brandSuffix = ''
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    )
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      userId = user.id
      const brand = await getBrandProfile(userId)
      const ctx = getBrandSystemPrompt(brand)
      if (ctx && brand?.style_preset) brandSuffix = `, ${brand.style_preset} visual style`
      else if (ctx && brand?.niche) brandSuffix = `, aligned with ${brand.niche} brand aesthetic`
    }
  } catch { /* brand injection is optional */ }

  const cacheInput = JSON.stringify({ prompt, niche, style, quality, aspect_ratio, num_images })
  if (userId) {
    const cached = await checkCache(userId, 'generate-image', cacheInput)
    if (cached) {
      try { return Response.json({ ...JSON.parse(cached), cached: true }) } catch { /* regenerate */ }
    }
  }

  const isAnimated = ['Animation', 'Motion Content'].includes(niche ?? '')
  const qualityPrompt = QUALITY_PROMPTS[style] ?? QUALITY_PROMPTS.lifestyle
  const animationPrefix = isAnimated ? 'anime illustration style, 2D animated, vibrant cel-shaded colors, ' : ''
  const enhancedPrompt = `${animationPrefix}${prompt.trim()}, ${qualityPrompt}${brandSuffix}`

  const model = quality === 'pro' ? 'fal-ai/flux-pro' : 'fal-ai/flux/schnell'

  let imageSize
  if (aspect_ratio === '9:16')       imageSize = { width: 1080, height: 1920 }
  else if (aspect_ratio === '16:9')  imageSize = { width: 1920, height: 1080 }
  else                               imageSize = { width: 1080, height: 1080 }

  const body = {
    prompt: enhancedPrompt,
    num_images,
    image_size: imageSize,
    ...(seed != null ? { seed } : {}),
    ...(quality === 'pro'
      ? { safety_tolerance: '2' }
      : {
          num_inference_steps: 4,
          enable_safety_checker: true,
        }
    ),
  }

  try {
    const res = await fetch(`https://fal.run/${model}`, {
      method: 'POST',
      headers: {
        Authorization: `Key ${falKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error('[generate-image] fal error:', errText)
      return Response.json({ error: 'Image generation failed' }, { status: 500 })
    }

    const data = await res.json()
    const images = (data.images ?? []).map(img => img.url)

    const result = { images, seed: data.seed ?? null }
    if (userId) {
      saveCache(userId, 'generate-image', cacheInput, JSON.stringify(result))
      logUsageEvent(userId, 'generate-image', 'generate', 2 * num_images, { style, quality, niche })
    }
    return Response.json(result)
  } catch (err) {
    console.error('[generate-image]', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
