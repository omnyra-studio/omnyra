export const maxDuration = 60

export async function POST(req: Request) {
  const { script, voice_id, avatar_id, background_image } = await req.json()

  if (!process.env.HEYGEN_API_KEY) {
    return Response.json({ error: 'HEYGEN_API_KEY not configured' }, { status: 500 })
  }

  // Step 1 — Generate voiceover via ElevenLabs
  const elevenVoiceId = voice_id || 'EXAVITQu4vr4xnSDxMaL'
  const voiceRes = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${elevenVoiceId}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: script,
        model_id: 'eleven_turbo_v2',
        voice_settings: { stability: 0.35, similarity_boost: 0.75, style: 0.65, speed: 1.08 },
      }),
    }
  )

  if (!voiceRes.ok) {
    const err = await voiceRes.text()
    console.error('ElevenLabs error:', err)
    return Response.json({ error: 'Voice generation failed' }, { status: 500 })
  }

  // Step 2 — Upload audio to HeyGen asset store
  const audioBuffer = await voiceRes.arrayBuffer()
  const audioBase64 = Buffer.from(audioBuffer).toString('base64')

  const uploadRes = await fetch('https://upload.heygen.com/v1/asset', {
    method: 'POST',
    headers: {
      'X-Api-Key': process.env.HEYGEN_API_KEY,
      'Content-Type': 'audio/mpeg',
    },
    body: Buffer.from(audioBuffer),
  })

  let audioAssetId: string | null = null
  if (uploadRes.ok) {
    const uploadData = await uploadRes.json()
    audioAssetId = uploadData.data?.id ?? null
  }

  // Step 3 — Submit to HeyGen video generation
  const voiceConfig = audioAssetId
    ? { type: 'audio', audio_asset_id: audioAssetId }
    : { type: 'text', input_text: script.slice(0, 1500), voice_id: elevenVoiceId }

  const heygenRes = await fetch('https://api.heygen.com/v2/video/generate', {
    method: 'POST',
    headers: {
      'X-Api-Key': process.env.HEYGEN_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      video_inputs: [
        {
          character: {
            type: 'avatar',
            avatar_id: avatar_id || 'Daisy-inskirt-20220818',
            avatar_style: 'normal',
            // Force maximum natural motion — never let these default to "none" or "minimal"
            motion_config: {
              idle_motion:             'micro_movements',  // NEVER "none" — kills all life
              gesture_intensity:        0.7,               // hand/body movement 0–1
              expression_amplification: 0.6,               // makes emotion readable on camera
              head_movement:           'natural',          // NOT "minimal"
              auto_gesture_alignment:   true,              // matches gestures to script emotion
              eye_contact_variance:     0.2,               // slight natural looking away
            },
            camera_config: {
              framing:       'medium_close_up',
              zoom_pattern:  'slow_push_in',  // NEVER "static" — kills forward momentum
              depth_of_field: 0.3,            // subtle background blur
            },
          },
          voice: voiceConfig,
          background: background_image
            ? { type: 'image', url: background_image }
            : { type: 'color', value: '#1a0a2e' },
        },
      ],
      dimension: { width: 1080, height: 1920 },
      aspect_ratio: '9:16',
    }),
  })

  if (!heygenRes.ok) {
    const err = await heygenRes.json()
    console.error('HeyGen error:', err)
    return Response.json({ error: 'Video submission failed', detail: err }, { status: 500 })
  }

  const { data } = await heygenRes.json()
  return Response.json({ video_id: data.video_id })
}
