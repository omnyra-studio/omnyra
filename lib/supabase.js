import { createBrowserClient } from '@supabase/ssr'

// Emitted once at module load so startup logs show immediately
if (typeof window !== 'undefined') {
  console.log('[supabase-check]', {
    hasUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    hasKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  })
}

let _client = null
export function getSupabaseClient() {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    console.error('[supabase] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY — auth calls will be no-ops')
    return null
  }
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
