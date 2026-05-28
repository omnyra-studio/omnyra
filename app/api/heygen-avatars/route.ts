export async function GET() {
  if (!process.env.HEYGEN_API_KEY) {
    return Response.json({ error: 'HEYGEN_API_KEY not configured' }, { status: 500 })
  }

  const res = await fetch('https://api.heygen.com/v2/avatars', {
    headers: { 'X-Api-Key': process.env.HEYGEN_API_KEY },
  })

  const data = await res.json()
  return Response.json(data)
}
