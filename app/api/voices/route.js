export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
    })

    if (!res.ok) {
      console.error('ElevenLabs error:', res.status, await res.text())
      return Response.json({ voices: [] }, { status: res.status })
    }

    const data = await res.json()
    return Response.json({ voices: data.voices ?? [] })

  } catch (err) {
    console.error('Voices fetch failed:', err)
    return Response.json({ voices: [] }, { status: 500 })
  }
}
