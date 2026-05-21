import { getUserAndPlan } from '../../../lib/auth'

export async function GET(request) {
  const { user } = await getUserAndPlan(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const res = await fetch('https://api.elevenlabs.io/v1/voices', {
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return Response.json({ error: err.detail || 'Failed to fetch voices' }, { status: res.status })
  }

  const data = await res.json()
  const voices = (data.voices ?? []).map(v => ({
    id:          v.voice_id,
    name:        v.name,
    category:    v.category ?? 'premade',
    gender:      v.labels?.gender ?? 'unknown',
    age:         v.labels?.age ?? 'unknown',
    accent:      v.labels?.accent ?? 'unknown',
    description: v.labels?.description ?? '',
    useCase:     v.labels?.use_case ?? '',
    previewUrl:  v.preview_url ?? null,
  }))

  return Response.json({ voices })
}
