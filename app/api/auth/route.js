import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function POST(request) {
  const { action, email, password } = await request.json()

  if (action === 'signup') {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ user: data.user })
  }

  if (action === 'signin') {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ session: data.session, user: data.user })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}