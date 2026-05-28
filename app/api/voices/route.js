export async function GET() {
  console.log('EL key present:', !!process.env.ELEVENLABS_API_KEY)

  if (!process.env.ELEVENLABS_API_KEY) {
    return Response.json([])
  }

  const res = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
  })

  if (!res.ok) {
    const errText = await res.text()
    console.error('[voices] ElevenLabs fetch failed:', res.status, errText)
    return Response.json([])
  }

  const data = await res.json()
  return Response.json(data.voices ?? [])
}
