import { getUserAndPlan } from '../../../lib/auth'
import { checkBalance, deductCredits } from '../../../lib/credits'
import { enforceRateLimit } from '../../../lib/api-guard'

const MODEL_BY_PLAN = {
  free:    'eleven_turbo_v2',
  starter: 'eleven_turbo_v2',
  creator: 'eleven_turbo_v2',
  pro:     'eleven_multilingual_v2',
  studio:  'eleven_multilingual_v2',
}

export async function POST(request) {
  // ── Env guard ────────────────────────────────────────────────────────────────
  const elKey = process.env.ELEVENLABS_API_KEY
  console.log('[voice] handler invoked — EL key present:', !!elKey)
  if (!elKey) {
    console.error('[voice] ELEVENLABS_API_KEY is not set')
    return Response.json({ error: 'Voice service not configured — ELEVENLABS_API_KEY missing' }, { status: 503 })
  }

  // ── Auth ──────────────────────────────────────────────────────────────────────
  const { user, plan } = await getUserAndPlan(request)
  if (!user) {
    console.warn('[voice] Unauthorized — no valid session token')
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── Rate limit ────────────────────────────────────────────────────────────────
  const limited = await enforceRateLimit(user.id, '/api/voice')
  if (limited) return Response.json(limited.body, { status: limited.status })

  // ── Parse body ────────────────────────────────────────────────────────────────
  let text, voiceId
  try {
    const body = await request.json()
    text    = body.text
    voiceId = body.voiceId ?? body.voice_id ?? 'JBFqnCBsd6RMkjVDRZzb'
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  console.log('[voice] user:', user.id, 'plan:', plan, 'voiceId:', voiceId, 'text_len:', text?.length)

  if (!text?.trim()) return Response.json({ error: 'No text provided' }, { status: 400 })

  // ── Credits check ─────────────────────────────────────────────────────────────
  const creditAction = text.length > 500 ? 'voice_60s' : 'voice_30s'
  const balCheck = await checkBalance(user.id, creditAction)
  if (!balCheck.ok) {
    return Response.json({ error: 'Insufficient credits', balance: balCheck.balance }, { status: 402 })
  }

  // ── ElevenLabs TTS ───────────────────────────────────────────────────────────
  const model = MODEL_BY_PLAN[plan] ?? 'eleven_turbo_v2'
  console.log('[voice] calling ElevenLabs — model:', model, 'voice:', voiceId)

  const elRes = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': elKey,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: model,
        voice_settings: {
          stability: 0.35,
          similarity_boost: 0.75,
          style: 0.65,
          use_speaker_boost: true,
          speed: 1.08,
        },
      }),
    }
  )

  if (!elRes.ok) {
    const errText = await elRes.text()
    console.error('[voice] ElevenLabs error:', elRes.status, errText)
    return Response.json(
      { error: `ElevenLabs error ${elRes.status}: ${errText}` },
      { status: 502 }
    )
  }

  // ── Deduct credits only after confirmed audio ────────────────────────────────
  const credit = await deductCredits(user.id, creditAction)
  const audioBuffer = await elRes.arrayBuffer()
  console.log('[voice] success — bytes:', audioBuffer.byteLength, 'credits remaining:', credit.remaining)

  return new Response(audioBuffer, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': String(audioBuffer.byteLength),
      'X-Credits-Remaining': String(credit.remaining),
    },
  })
}
