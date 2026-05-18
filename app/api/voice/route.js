import { getUserAndPlan } from '../../../lib/auth'
import { deductCredits } from '../../../lib/credits'

// Pro/Studio get the higher-quality, slower model
const MODEL_BY_PLAN = {
  free:    'eleven_turbo_v2',
  creator: 'eleven_turbo_v2',
  pro:     'eleven_multilingual_v2',
  studio:  'eleven_multilingual_v2',
}

export async function POST(request) {
  const { user, plan } = await getUserAndPlan(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { text, voiceId = 'JBFqnCBsd6RMkjVDRZzb' } = await request.json()
  if (!text?.trim()) return Response.json({ error: 'No text provided' }, { status: 400 })

  // Longer text → higher credit cost
  const creditAction = text.length > 500 ? 'voice_1min' : 'voice_30s'
  const credit = await deductCredits(user.id, creditAction)
  if (!credit.success) {
    return Response.json({ error: credit.error, balance: credit.balance }, { status: 402 })
  }

  const model = MODEL_BY_PLAN[plan] ?? 'eleven_turbo_v2'

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    }
  )

  if (!response.ok) {
    return Response.json({ error: 'ElevenLabs error' }, { status: 500 })
  }

  const audioBuffer = await response.arrayBuffer()
  // Return new balance in a header so the client can update the display
  return new Response(audioBuffer, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'X-Credits-Remaining': String(credit.remaining),
    },
  })
}
