export async function POST(req) {
  const { text, voice_id } = await req.json()

  const apiKey = process.env.ELEVENLABS_API_KEY
  console.log('ElevenLabs key present:', !!apiKey)
  console.log('Voice ID received:', voice_id)
  console.log('Text length:', text?.length)

  if (!apiKey) {
    return Response.json({ error: 'ElevenLabs API key missing' }, { status: 500 })
  }

  if (!voice_id) {
    return Response.json({ error: 'No voice_id provided' }, { status: 400 })
  }

  if (!text) {
    return Response.json({ error: 'No text provided' }, { status: 400 })
  }

  try {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text: text.substring(0, 5000),
          model_id: 'eleven_turbo_v2',
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

    if (!response.ok) {
      const err = await response.text()
      console.error('ElevenLabs error:', response.status, err)
      return Response.json({ error: `ElevenLabs error: ${response.status} ${err}` }, { status: 500 })
    }

    const buffer = await response.arrayBuffer()
    console.log('Voice generated successfully, bytes:', buffer.byteLength)

    return new Response(buffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': buffer.byteLength.toString(),
      },
    })
  } catch (err) {
    console.error('test-voice error:', err.message)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
