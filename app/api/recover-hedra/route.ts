import { createClient } from '@supabase/supabase-js'
import { cleanEnv } from '@/lib/supabase/admin'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const generation_id = searchParams.get('id')
  const job_id = searchParams.get('job_id')

  if (!generation_id) {
    return Response.json({ error: 'Missing id param' }, { status: 400 })
  }

  const apiKey = cleanEnv(process.env.HEDRA_API_KEY)
  const apiBase = (cleanEnv(process.env.HEDRA_API_BASE) || 'https://api.hedra.com/web-app/public').replace(/\/$/, '')
  const supabase = createClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL)!,
    cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY)!
  )

  try {
    // Step 1 — Get generation status from Hedra
    const hedraRes = await fetch(`${apiBase}/generations/${generation_id}/status`, {
      headers: { 'X-API-Key': apiKey! },
      signal: AbortSignal.timeout(15_000),
    })
    const generation = await hedraRes.json()

    if (generation.status !== 'complete' || !generation.url) {
      return Response.json({
        ready: false,
        status: generation.status,
        generation_id,
      })
    }

    // Status-check only mode — no job_id provided
    if (!job_id) {
      return Response.json({
        ready: true,
        status: generation.status,
        generation_id,
        url: generation.url,
      })
    }

    console.log('[RECOVER] Generation complete, downloading from S3...')

    // Step 2 — Download video from S3
    const videoRes = await fetch(generation.url, { signal: AbortSignal.timeout(120_000) })
    if (!videoRes.ok) throw new Error(`S3 download failed: ${videoRes.status}`)

    const videoBuffer = await videoRes.arrayBuffer()
    const videoBytes = new Uint8Array(videoBuffer)
    console.log('[RECOVER] Downloaded bytes:', videoBytes.length)

    // Step 3 — Upload to Supabase renders bucket
    const storagePath = `${job_id}/final/hedra-avatar.mp4`
    const { error: uploadError } = await supabase.storage
      .from('renders')
      .upload(storagePath, videoBytes, {
        contentType: 'video/mp4',
        upsert: true
      })

    if (uploadError) throw new Error(`Supabase upload failed: ${uploadError.message}`)

    // Step 4 — Get public URL
    const { data: urlData } = supabase.storage
      .from('renders')
      .getPublicUrl(storagePath)

    const publicUrl = urlData.publicUrl
    console.log('[RECOVER] Uploaded to Supabase:', publicUrl.substring(0, 80))

    // Step 5 — Update job as complete in avatar_jobs
    const { error: updateError } = await supabase
      .from('avatar_jobs')
      .update({
        status: 'completed',
        result_url: publicUrl,
        animated_video_url: publicUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', job_id)

    if (updateError) {
      console.error('[RECOVER] avatar_jobs update error:', updateError.message)
      // Non-fatal — video is already in Supabase, return URL regardless
    }

    console.log('[RECOVER] Job marked complete:', job_id)

    return Response.json({
      success: true,
      job_id,
      video_url: publicUrl,
      bytes: videoBytes.length
    })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[RECOVER] Error:', msg)
    return Response.json({ error: msg }, { status: 500 })
  }
}
