import { NextResponse } from 'next/server'
import { getUserAndPlan } from '../../../../lib/auth'

export async function GET(request) {
  const { user } = await getUserAndPlan(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const videoId = searchParams.get('videoId')
  if (!videoId) return NextResponse.json({ error: 'videoId required' }, { status: 400 })

  if (!process.env.HEYGEN_API_KEY) {
    return NextResponse.json({ error: 'HeyGen is not configured' }, { status: 500 })
  }

  try {
    const res = await fetch(`https://api.heygen.com/v1/video_status.get?video_id=${videoId}`, {
      headers: { 'X-Api-Key': process.env.HEYGEN_API_KEY },
    })
    const data = await res.json()
    return NextResponse.json({
      status:    data.data?.status,
      url:       data.data?.video_url,
      thumbnail: data.data?.thumbnail_url,
      error:     data.data?.error,
    })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
