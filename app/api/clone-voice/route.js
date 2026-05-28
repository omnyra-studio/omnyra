import { createClient } from '@supabase/supabase-js'
import { getUserAndPlan } from '../../../lib/auth'

function getDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
}

export async function POST(req) {
  try {
    const { user } = await getUserAndPlan(req)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const formData = await req.formData()
    const audioFile = formData.get('audio')
    const userName = formData.get('name') || 'My Voice'

    const elFormData = new FormData()
    elFormData.append('name', `${userName} — Omnyra`)
    elFormData.append('files', audioFile)
    elFormData.append('description', 'Voice clone created via Omnyra AI')

    const res = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
      body: elFormData,
    })

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}))
      const detail = errBody?.detail
      const msg = typeof detail === 'string' ? detail : (detail?.message ?? JSON.stringify(detail) ?? 'Clone failed')
      console.error('ElevenLabs clone error:', msg, errBody)
      return Response.json({ error: msg }, { status: 400 })
    }

    const { voice_id } = await res.json()
    const db = getDb()

    await db.from('profiles').update({
      voice_id,
      voice_name: userName,
      has_voice_clone: true,
      voice_type: 'clone',
    }).eq('id', user.id)

    return Response.json({ voice_id, success: true })
  } catch (err) {
    console.error('Clone error:', err.message, err.body)
    return Response.json({ error: err.message || 'Clone failed' }, { status: 500 })
  }
}
