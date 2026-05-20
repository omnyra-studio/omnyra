import { NextResponse } from 'next/server'

// This route is retired. It issued a custom omnyra_token JWT cookie that
// neither the middleware nor lib/auth.js ever validated — a disconnected
// auth system running in parallel with Supabase sessions.
//
// Client-side sign-in: call supabase.auth.signInWithPassword() directly.
// The Supabase session cookie is what middleware.js and lib/auth.js validate.
export async function POST() {
  return NextResponse.json(
    { error: 'This endpoint is retired. Sign in via supabase.auth.signInWithPassword() on the client.' },
    { status: 410 }
  )
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
