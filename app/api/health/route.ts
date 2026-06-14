/**
 * GET /api/health
 *
 * Lightweight liveness + readiness probe.
 * Returns 200 when the service is up and DB is reachable.
 * Returns 503 when a critical dependency is unavailable.
 *
 * No auth required — safe to call from uptime monitors.
 * Does NOT expose env var values.
 */

import { NextResponse }  from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ANTHROPIC_API_KEY",
  "ELEVENLABS_API_KEY",
  "HEDRA_API_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
];

export async function GET() {
  const startMs = Date.now();

  // ── 1. Env var check ─────────────────────────────────────────────────────────
  const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);

  // ── 2. DB liveness check ──────────────────────────────────────────────────────
  let dbOk    = false;
  let dbError = "";
  try {
    const { error } = await supabaseAdmin
      .from("renders")
      .select("id")
      .limit(1)
      .maybeSingle();

    dbOk    = !error;
    dbError = error?.message ?? "";
  } catch (err) {
    dbError = String(err);
  }

  const latencyMs  = Date.now() - startMs;
  const healthy    = missingEnv.length === 0 && dbOk;

  const body = {
    status:      healthy ? "ok" : "degraded",
    db:          dbOk ? "ok" : "error",
    dbError:     dbError || undefined,
    missingEnv:  missingEnv.length ? missingEnv : undefined,
    latencyMs,
    version:     process.env.VERCEL_DEPLOYMENT_ID ?? "local",
    region:      process.env.VERCEL_REGION         ?? "local",
    nodeEnv:     process.env.NODE_ENV,
    ts:          new Date().toISOString(),
  };

  return NextResponse.json(body, { status: healthy ? 200 : 503 });
}
