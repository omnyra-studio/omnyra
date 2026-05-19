import { getUserAndPlan } from '../../../lib/auth'

export async function GET(request) {
  const { user, plan } = await getUserAndPlan(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (plan !== 'studio') return Response.json({ error: 'Studio plan required' }, { status: 403 })

  if (!process.env.HEYGEN_API_KEY) {
    return Response.json({ avatars: [] })
  }

  try {
    const res = await fetch('https://api.heygen.com/v2/avatars', {
      headers: {
        'X-Api-Key': process.env.HEYGEN_API_KEY,
        'accept': 'application/json',
      },
    })

    if (!res.ok) {
      console.error('HeyGen avatars error:', res.status, await res.text())
      return Response.json({ avatars: [] })
    }

    const data = await res.json()
    const avatars = (data.data?.avatars ?? []).map(a => ({
      id:            a.avatar_id,
      name:          a.avatar_name,
      gender:        a.gender ?? null,
      thumbnail_url: a.preview_image_url ?? null,
      preview_url:   a.preview_video_url ?? null,
    }))

    return Response.json({ avatars })
  } catch (err) {
    console.error('HeyGen avatars fetch failed:', err.message)
    return Response.json({ avatars: [] })
  }
}
