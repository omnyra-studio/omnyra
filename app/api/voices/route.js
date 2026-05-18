export async function GET() {
  const response = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: {
      'xi-api-key': process.env.ELEVENLABS_API_KEY,
    }
  })

  const data = await response.json()
  return Response.json({ voices: data.voices })
}