import { createClient } from '@supabase/supabase-js'
import { getUserAndPlan } from '../../../lib/auth'

export async function POST(request) {
  const { user } = await getUserAndPlan(request)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    )

    const form = await request.formData()
    const file = form.get('file')
    if (!file) return Response.json({ error: 'No file provided' }, { status: 400 })

    const bytes  = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const ext    = (file.name ?? 'bin').split('.').pop()
    const path   = `uploads/${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`

    // Try media bucket first, fall back to lipsync-media (guaranteed to exist)
    let bucket = 'media'
    let { error } = await supabase.storage
      .from(bucket)
      .upload(path, buffer, { contentType: file.type || 'application/octet-stream', upsert: false })

    if (error?.message?.includes('not found') || error?.message?.includes('does not exist')) {
      bucket = 'lipsync-media'
      const fallback = await supabase.storage
        .from(bucket)
        .upload(path, buffer, { contentType: file.type || 'application/octet-stream', upsert: false })
      error = fallback.error
    }

    if (error) throw error

    const { data: { publicUrl } } = supabase.storage.from(bucket).getPublicUrl(path)
    return Response.json({ url: publicUrl })
  } catch (err) {
    console.error('[upload]', err.message)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
