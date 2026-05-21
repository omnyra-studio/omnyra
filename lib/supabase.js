import { createBrowserClient } from '@supabase/ssr'

let _client = null

export function getSupabaseClient() {
  if (_client) return _client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    console.error('[supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
    return null
  }

  // Detect service role key accidentally placed in the anon key slot.
  // Must catch this BEFORE calling createBrowserClient or Supabase throws
  // "Forbidden use of secret API key in browser" in the console.
  try {
    const part = key.split('.')[1] ?? ''
    // Pad to valid base64 length
    const padded = part + '==='.slice((part.length % 4) || 4)
    const payload = JSON.parse(atob(padded))
    if (payload?.role === 'service_role') {
      console.error(
        '[supabase] CRITICAL: NEXT_PUBLIC_SUPABASE_ANON_KEY is a service_role key — ' +
        'go to Vercel → Settings → Environment Variables → NEXT_PUBLIC_SUPABASE_ANON_KEY ' +
        'and replace it with your project anon/public key (not the service_role key).'
      )
      return null
    }
  } catch { /* malformed key — let createBrowserClient handle it */ }

  try {
    _client = createBrowserClient(url, key)
    return _client
  } catch (err) {
    console.error('[supabase] createBrowserClient failed:', err.message)
    return null
  }
}

export const supabase = new Proxy({}, {
  get(_, prop) {
    const client = getSupabaseClient()
    return client ? client[prop] : undefined
  },
})
