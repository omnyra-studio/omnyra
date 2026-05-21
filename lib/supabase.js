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

  // Detect service role key accidentally placed in the anon key slot
  try {
    const payload = JSON.parse(atob(key.split('.')[1] ?? ''))
    if (payload?.role === 'service_role') {
      console.error(
        '[supabase] CRITICAL: NEXT_PUBLIC_SUPABASE_ANON_KEY contains a service_role key. ' +
        'Go to Vercel → Settings → Environment Variables and replace it with your anon/public key.'
      )
      return null
    }
  } catch {}

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
