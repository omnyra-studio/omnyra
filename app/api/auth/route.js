import { NextResponse } from 'next/server'

// This combined action endpoint is retired.
// Use the dedicated routes:
//   POST /api/auth/signup  — create account (admin-confirmed, no email step)
//   POST /api/auth/signout — clear session
// Client-side sign-in uses supabase.auth.signInWithPassword() directly.
export async function POST() {
  return NextResponse.json(
    { error: 'This endpoint is retired. Use /api/auth/signup or /api/auth/signout.' },
    { status: 410 }
  )
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 })
}
