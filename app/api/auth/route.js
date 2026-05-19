import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { sendWelcomeEmail } from '../../../lib/email.js'

let _supabase = null
function getSupabase() {
  if (!_supabase) _supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )
  return _supabase
}

export async function POST(request) {
  const { action, email, password } = await request.json()

  if (action === 'signup') {
    const { data, error } = await getSupabase().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    sendWelcomeEmail(email).catch(err => console.error('[email] Welcome email failed:', err.message))
    return NextResponse.json({ user: data.user })
  }

  if (action === 'signin') {
    const { data, error } = await getSupabase().auth.signInWithPassword({
      email,
      password,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ session: data.session, user: data.user })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}