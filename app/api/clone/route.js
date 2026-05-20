import { getUserAndPlan } from '../../../lib/auth'

export async function POST(request) {
  try {
    const { user } = await getUserAndPlan(request)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await request.formData()
    const audio = formData.get('audio')
    const name  = formData.get('name') || 'My Cloned Voice'

    if (!audio) return Response.json({ error: 'No audio file provided' }, { status: 400 })

    const elevenForm = new FormData()
    elevenForm.append('name', name)
    elevenForm.append('files', audio)
    elevenForm.append('description', 'Cloned via Omnyra AI')

    const res = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
      body: elevenForm,
    })

    const data = await res.json()
    if (!res.ok) {
      return Response.json({ error: data.detail?.message || 'ElevenLabs error' }, { status: 400 })
    }

    return Response.json({ success: true, voiceId: data.voice_id, name: data.name })
  } catch (err) {
    console.error('[clone] error:', err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
