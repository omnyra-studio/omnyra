import { createClient } from '@supabase/supabase-js'

let _client = null

function getClient() {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new Error('Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)')
    _client = createClient(url, key)
  }
  return _client
}

export const supabaseAdmin = new Proxy({}, {
  get(_, prop) {
    return getClient()[prop]
  },
})