import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function middleware(request) {
  const isDashboard = request.nextUrl.pathname.startsWith('/dashboard')
  let response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    console.error('[middleware] Missing Supabase env vars')
    return isDashboard
      ? NextResponse.redirect(new URL('/signin', request.url))
      : response
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

    // getUser() validates the JWT server-side; getSession() trusts cookie without verification
    const { data: { user } } = await supabase.auth.getUser()

    if (!user && isDashboard) {
      return NextResponse.redirect(new URL('/signin', request.url))
    }
  } catch (err) {
    console.error('[middleware] Supabase auth check failed:', err.message)
    // Fail safe: block dashboard if we cannot verify session
    if (isDashboard) {
      return NextResponse.redirect(new URL('/signin', request.url))
    }
  }

  return response
}

export const config = {
  matcher: ['/dashboard/:path*'],
}
