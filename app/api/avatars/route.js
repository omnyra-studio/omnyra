export async function GET() {
  if (!process.env.DID_API_KEY) {
    return Response.json({ presenters: [] })
  }

  try {
    const res = await fetch('https://api.d-id.com/presenters', {
      headers: {
        'Authorization': `Basic ${process.env.DID_API_KEY}`,
        'accept': 'application/json',
      },
    })

    if (!res.ok) {
      console.error('D-ID presenters error:', res.status, await res.text())
      return Response.json({ presenters: [] })
    }

    const data = await res.json()
    const presenters = (data.presenters ?? data ?? []).map(p => ({
      id:            p.id,
      name:          p.name,
      gender:        p.gender ?? null,
      thumbnail_url: p.thumbnail_url ?? null,
      preview_url:   p.talking_preview_url ?? null,
    }))

    return Response.json({ presenters })
  } catch (err) {
    console.error('D-ID presenters fetch failed:', err.message)
    return Response.json({ presenters: [] })
  }
}
