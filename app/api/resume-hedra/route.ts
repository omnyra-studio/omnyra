function cleanEnv(value?: string): string | undefined {
  return value?.replace(/^﻿/, "").trim();
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const generation_id = searchParams.get('id')

  if (!generation_id) {
    return Response.json({ error: 'No generation_id provided' })
  }

  const apiKey = cleanEnv(process.env.HEDRA_API_KEY)
  const apiBase = (cleanEnv(process.env.HEDRA_API_BASE) ?? 'https://api.hedra.com/web-app/public').replace(/\/$/, '')

  if (!apiKey) {
    return Response.json({ error: 'HEDRA_API_KEY not set', api_base: apiBase })
  }

  let status: number | string = 'fetch_threw'
  let data: unknown = null
  let fetchError = ''

  try {
    const res = await fetch(`${apiBase}/generations/${generation_id}/status`, {
      headers: { 'X-API-Key': apiKey },
      signal: AbortSignal.timeout(15_000),
    })
    status = res.status
    data = await res.json()
    console.log('Hedra generation status:', JSON.stringify(data))
  } catch (e) {
    fetchError = String(e)
    console.error('resume-hedra fetch error:', fetchError)
  }

  return Response.json({ status, generation: data, fetch_error: fetchError || undefined })
}
