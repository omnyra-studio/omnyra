import { createBrowserClient } from '@supabase/ssr'

let _client = null
export function getSupabaseClient() {
  if (!_client) {
    _client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )
  }
  return _client
}

export const supabase = new Proxy({}, {
  get(_, prop) {
    return getSupabaseClient()[prop]
  },
})
