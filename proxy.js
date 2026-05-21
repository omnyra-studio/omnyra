import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function proxy(request) {
  const { pathname } = request.nextUrl
  const isDashboard = pathname.startsWith('/dashboard')
  let response = NextResponse.next({ request })

  // Root always serves landing page — no redirect
  if (pathname === '/') return response

  // Auth pages always accessible
  if (pathname === '/signin' || pathname === '/signup') return response

  if (!isDashboard) return response

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    console.error('[proxy] Missing Supabase env vars')
    return NextResponse.redirect(new URL('/signin', request.url))
  }

  try {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    })

    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.redirect(new URL('/signin', request.url))
    }
  } catch (err) {
    console.error('[proxy] auth check failed:', err.message)
    return NextResponse.redirect(new URL('/signin', request.url))
  }

  return response
}

export const config = {
  matcher: ['/dashboard', '/dashboard/:path*'],
}
