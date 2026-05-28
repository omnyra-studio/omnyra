import { NextResponse } from 'next/server';

/**
 * Thin wrappers that enforce JSON content-type and a consistent error shape
 * across all JSON API routes.
 *
 * Intentional exceptions (do NOT use these):
 *   - Stripe webhook  → plain Response, Stripe doesn't parse the body
 *   - OAuth redirects → browser-navigated, plain text errors are fine
 *   - SSE streams     → streaming Response, not JSON
 */

export function ok<T>(payload: T, status = 200): NextResponse {
  return NextResponse.json(payload, { status });
}

export function fail(error: string, status: number, code?: string): NextResponse {
  return NextResponse.json(code ? { error, code } : { error }, { status });
}
