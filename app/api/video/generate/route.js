import { NextResponse } from 'next/server'
import { getUserAndPlan } from '../../../../lib/auth'
import { deductCredits } from '../../../../lib/credits'

export const maxDuration = 60

function cleanScriptForSpeech(script) {
  return script
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/SCENE\s*\d+[:\s]*/gi, '')
    .replace(/HOOK[:\s]*/gi, '')
    .replace(/MAIN CONTENT[:\s]*/gi, '')
    .replace(/CALL TO ACTION[:\s]*/gi, '')
    .replace(/CTA[:\s]*/gi, '')
    .replace(/🎣|📖|🎯|✨|💡|🎬/g, '')
    .replace(/^\s*[-*#]+\s*/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function POST(request) {
  const { user } = await getUserAndPlan(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { script, avatarId, voiceId, backgroundUrl, duration = 30 } = body
  if (!script?.trim()) return NextResponse.json({ error: 'Script required' }, { status: 400 })

  if (!process.env.HEYGEN_API_KEY) {
    return NextResponse.json({ error: 'HeyGen is not configured' }, { status: 500 })
  }

  const creditAction = duration <= 30 ? 'avatar_30s' : 'avatar_60s'
  const credit = await deductCredits(user.id, creditAction)
  if (!credit.success) {
    return NextResponse.json({ error: credit.error, balance: credit.balance }, { status: 402 })
  }

  const cleanScript = cleanScriptForSpeech(script).slice(0, 1500)

  // Support both image and video backgrounds behind the avatar
  let background
  if (backgroundUrl) {
    const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(backgroundUrl)
    background = { type: isVideo ? 'video' : 'image', url: backgroundUrl }
  } else {
    background = { type: 'color', value: '#000000' }
  }

  try {
    const res = await fetch('https://api.heygen.com/v2/video/generate', {
      method: 'POST',
      headers: {
        'X-Api-Key': process.env.HEYGEN_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        video_inputs: [{
          character: {
            type: 'avatar',
            avatar_id: avatarId || 'Daisy-inskirt-20220818',
            avatar_style: 'normal',
          },
          voice: {
            type: 'text',
            input_text: cleanScript,
            voice_id: voiceId || '2d5b0e6cf36f460aa7fc47e3eee4ba54',
            speed: 1.1,
          },
          background,
        }],
        dimension: { width: 1280, height: 720 },
        aspect_ratio: '16:9',
      }),
    })

    const data = await res.json()
    if (!res.ok || data.error) {
      console.error('[video/generate] HeyGen error:', JSON.stringify(data))
      return NextResponse.json({ error: data.error?.message || 'HeyGen generation failed' }, { status: 500 })
    }

    return NextResponse.json({ videoId: data.data?.video_id, balance: credit.remaining })
  } catch (err) {
    console.error('[video/generate] unhandled:', err.message)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
