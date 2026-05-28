export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const video_id = searchParams.get('video_id')

  if (!video_id) {
    return Response.json({ error: 'No video_id provided' }, { status: 400 })
  }

  if (!process.env.HEYGEN_API_KEY) {
    return Response.json({ error: 'HEYGEN_API_KEY not configured' }, { status: 500 })
  }

  const res = await fetch(
    `https://api.heygen.com/v1/video_status.get?video_id=${video_id}`,
    { headers: { 'X-Api-Key': process.env.HEYGEN_API_KEY } }
  )

  if (!res.ok) {
    return Response.json({ status: 'failed', video_url: null }, { status: 200 })
  }

  const { data } = await res.json()

  return Response.json({
    status: data.status,
    video_url: data.video_url || null,
    thumbnail_url: data.thumbnail_url || null,
  })
}
