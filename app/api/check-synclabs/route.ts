export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const video_id = searchParams.get('video_id')

  if (!video_id) {
    return Response.json({ error: 'No video_id provided' }, { status: 400 })
  }

  if (!process.env.SYNCLABS_API_KEY) {
    return Response.json({ error: 'SYNCLABS_API_KEY not configured' }, { status: 500 })
  }

  const res = await fetch(`https://api.synclabs.so/video/${video_id}`, {
    headers: { 'x-api-key': process.env.SYNCLABS_API_KEY },
  })

  if (!res.ok) {
    return Response.json({ status: 'failed', video_url: null })
  }

  const data = await res.json()

  return Response.json({
    status: data.status,
    video_url: data.url || null,
  })
}
