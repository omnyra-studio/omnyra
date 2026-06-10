// Supabase SSR session refresh middleware.
//
// Refreshes the access token on every request so it doesn't expire mid-session.
// Must run on all routes EXCEPT Next.js internals and static assets.
// Does NOT block unauthenticated requests here — individual API routes handle auth.

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Routes that must never be accessible in production (debug/test endpoints)
const BLOCKED_IN_PRODUCTION = [
  '/api/test-claude',
  '/api/test-hedra',
  '/api/test-voice',
];

// Generation endpoints that get per-IP rate limiting at the edge.
// More precise per-user limiting happens inside each route via tier-limiter.ts.
// These limits are intentionally generous — just block obvious abuse/scraping.
const GENERATION_ROUTES = [
  '/api/generate-cinematic-sequence',
  '/api/avatar',
  '/api/clone',
  '/api/clone-voice',
  '/api/continue-story',
];

const GENERATION_RATE_LIMIT = 20; // requests per 60-second window per IP

// Simple in-memory IP rate limiter for edge (not shared across instances,
// but each instance enforces independently which is sufficient for abuse prevention).
const ipHits = new Map<string, { count: number; resetAt: number }>();

function checkIpRateLimit(ip: string): boolean {
  const now   = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || now > entry.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= GENERATION_RATE_LIMIT) return false;
  entry.count++;
  return true;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const path = request.nextUrl.pathname;

  // Block debug routes in production
  if (process.env.NODE_ENV === 'production') {
    if (BLOCKED_IN_PRODUCTION.some(blocked => path.startsWith(blocked))) {
      return new NextResponse(null, { status: 404 });
    }
  }

  // IP-based rate limiting on generation endpoints
  if (GENERATION_ROUTES.some(route => path.startsWith(route))) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
           ?? request.headers.get("x-real-ip")
           ?? "unknown";
    if (!checkIpRateLimit(ip)) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a moment before trying again." },
        { status: 429, headers: { "Retry-After": "60", "X-RateLimit-Limit": String(GENERATION_RATE_LIMIT) } },
      );
    }
  }

  let response = NextResponse.next({ request });

  // Refresh Supabase session — keeps tokens alive across page navigations
  // and SSR fetches without requiring an explicit client-side refresh call.
  const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (supabaseUrl && supabaseAnon) {
    const supabase = createServerClient(supabaseUrl, supabaseAnon, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });

    // Calling getUser() triggers a token refresh when the access token is near expiry.
    // Errors are swallowed — middleware must not block requests on auth service failure.
    await supabase.auth.getUser().catch(() => {});
  }

  return response;
}

export const config = {
  matcher: [
    // Match all routes except Next.js internals and static file extensions
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$).*)',
  ],
};
