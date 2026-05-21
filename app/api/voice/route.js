import { getUserAndPlan } from '../../../lib/auth'
import { checkBalance, deductCredits } from '../../../lib/credits'

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

  const creditAction = text.length > 500 ? 'voice_1min' : 'voice_30s'

  // Balance check before calling ElevenLabs
  const balCheck = await checkBalance(user.id, creditAction)
  if (!balCheck.ok) {
    return Response.json({ error: 'Insufficient credits', balance: balCheck.balance }, { status: 402 })
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

  // Audio confirmed — deduct only now
  const credit = await deductCredits(user.id, creditAction)
  const audioBuffer = await response.arrayBuffer()

  return new Response(audioBuffer, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'X-Credits-Remaining': String(credit.remaining),
    },
  })
}
