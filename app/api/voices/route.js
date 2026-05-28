export const dynamic = 'force-dynamic'

export async function GET() {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) return Response.json([])
  const res = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': key }
  })
  if (!res.ok) return Response.json([])
  const data = await res.json()
  return Response.json(data.voices ?? [])
}
