export const maxDuration = 120

export async function POST(req: Request) {
  const { video_url, audio_url, script, voice_id } = await req.json()

  if (!process.env.SYNCLABS_API_KEY) {
    return Response.json({ error: 'SYNCLABS_API_KEY not configured' }, { status: 500 })
  }

  // If no pre-rendered video, we use lipsync on a provided video URL
  const res = await fetch('https://api.synclabs.so/video', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.SYNCLABS_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      audioUrl: audio_url,
      videoUrl: video_url,
      synergize: true,
      maxCredits: 120,
      webhookUrl: null,
    }),
  })

  if (!res.ok) {
    const err = await res.json()
    console.error('Sync Labs error:', err)
    return Response.json({ error: 'Sync Labs submission failed', detail: err }, { status: 500 })
  }

  const data = await res.json()
  return Response.json({ video_id: data.id })
}
