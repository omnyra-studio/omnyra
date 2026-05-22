import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

/* Edge-safe middleware.
 *
 * - Uses ONLY the public anon key (never service_role).
 * - Refreshes Supabase session cookies on every request.
 * - Redirects unauthenticated requests to /signin for protected routes.
 * - Always allows the Stripe webhook through.
 */

const PROTECTED_PREFIXES: readonly string[] = [
  "/dashboard",
  "/create",
  "/studio",
  "/welcome",
  "/api/pipeline",
  "/api/voice",
  "/api/video",
  "/api/lipsync",
];

const ALWAYS_ALLOW: readonly string[] = [
  "/api/stripe/webhook",
];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function isAlwaysAllowed(pathname: string): boolean {
  return ALWAYS_ALLOW.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isAlwaysAllowed(pathname)) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    },
  );

  // getUser() refreshes the session cookie when needed (Edge-safe).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isProtected(pathname)) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/signin";
    redirectUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(redirectUrl);
  }

  return response;
}

export const config = {
  matcher: [
    /* Exclude Next internals, static assets, and the favicon so middleware
     * runs only on real page + API requests.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?|ttf|otf|css|js)$).*)",
  ],
};
