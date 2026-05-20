import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// GET /api/debug/auth — live Supabase connectivity check
// Returns boolean presence flags and a live auth probe. Never returns key values.
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY

  const result = {
    env: {
      hasUrl: !!url,
      hasAnonKey: !!anon,
      hasServiceKey: !!service,
      urlValid: !!url && url.startsWith('https://') && url.endsWith('.supabase.co'),
      urlProjectRef: url ? url.replace('https://', '').replace('.supabase.co', '') : null,
    },
    anonKey: { role: null, issuedAt: null, expiresAt: null, expired: null, refMatchesUrl: null },
    connectivity: { status: null, error: null, httpStatus: null },
    adminKey: { role: null, issuedAt: null, expiresAt: null },
  }

  // Decode anon JWT (no verification — just inspect claims)
  if (anon) {
    try {
      const parts = anon.split('.')
      const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
      const now = Math.floor(Date.now() / 1000)
      result.anonKey = {
        role: payload.role,
        issuedAt: new Date(payload.iat * 1000).toISOString(),
        expiresAt: new Date(payload.exp * 1000).toISOString(),
        expired: payload.exp < now,
        refMatchesUrl: result.env.urlProjectRef === payload.ref,
      }
    } catch {
      result.anonKey.role = 'jwt_decode_failed'
    }
  }

  // Decode service role JWT
  if (service) {
    try {
      const payload = JSON.parse(Buffer.from(service.split('.')[1], 'base64url').toString('utf8'))
      result.adminKey = {
        role: payload.role,
        issuedAt: new Date(payload.iat * 1000).toISOString(),
        expiresAt: new Date(payload.exp * 1000).toISOString(),
      }
    } catch {
      result.adminKey.role = 'jwt_decode_failed'
    }
  }

  // Live connectivity probe
  if (url && anon) {
    try {
      const client = createClient(url, anon, { auth: { persistSession: false } })
      const { error } = await client.auth.getSession()
      result.connectivity.status = error ? 'error' : 'ok'
      result.connectivity.error = error?.message ?? null
    } catch (err) {
      result.connectivity.status = 'exception'
      result.connectivity.error = err.message
    }
  } else {
    result.connectivity.status = 'skipped_missing_env'
  }

  return NextResponse.json(result, { status: 200 })
}
