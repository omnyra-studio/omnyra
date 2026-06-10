/**
 * POST /api/cinematic-jobs
 *
 * Creates a cinematic_jobs row, reserves credits atomically, and fires the background worker.
 * Returns { jobId } in < 1s — caller never waits for generation.
 *
 * Credit flow:
 *   - Reserve 40 credits here (reject immediately if balance insufficient)
 *   - run-cinematic commits the reservation on success, rolls back on failure
 */

import { createServerClient }  from "@supabase/ssr";
import { cookies }             from "next/headers";
import { NextResponse }        from "next/server";
import { supabaseAdmin }       from "@/lib/supabase/admin";
import { randomUUID }          from "crypto";
import { InsufficientCreditsError } from "@/lib/credits/withCreditState";

export const maxDuration = 30;

const CINEMATIC_CREDIT_COST = 40;

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const input = await req.json() as Record<string, unknown>;

  // ── Reserve credits upfront ───────────────────────────────────────────────
  const txnId = randomUUID();
  const { data: reserveResult, error: reserveErr } = await supabaseAdmin.rpc(
    "credit_reserve_atomic",
    { p_user_id: user.id, p_amount: CINEMATIC_CREDIT_COST, p_txn_id: txnId },
  );

  if (reserveErr) {
    console.error("[cinematic-jobs] credit reserve error:", reserveErr.message);
    return NextResponse.json({ error: "Credit system error — try again" }, { status: 500 });
  }

  if (!reserveResult?.success) {
    const balance = reserveResult?.balance ?? 0;
    return NextResponse.json({
      error: `Not enough credits — this video costs ${CINEMATIC_CREDIT_COST} credits. You have ${balance}.`,
      required: CINEMATIC_CREDIT_COST,
      balance,
    }, { status: 402 });
  }

  console.log(`[cinematic-jobs] reserved ${CINEMATIC_CREDIT_COST} credits txn=${txnId} user=${user.id}`);

  // ── Create job row (include txnId so run-cinematic can commit/rollback) ───
  const { data: job, error: jobErr } = await supabaseAdmin
    .from("cinematic_jobs")
    .insert({
      user_id:    user.id,
      status:     "queued",
      progress:   0,
      input:      { ...input, userId: user.id, creditTxnId: txnId, creditCost: CINEMATIC_CREDIT_COST },
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (jobErr || !job) {
    // Roll back the reservation since we can't create the job
    try { await supabaseAdmin.rpc("credit_rollback_atomic", { p_txn_id: txnId }); } catch { /* ignore */ }
    console.error("[cinematic-jobs] insert error:", jobErr?.message);
    return NextResponse.json({ error: "Failed to create job" }, { status: 500 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://omnyra.studio";
  const secret = process.env.CRON_SECRET ?? "";

  // Fire and forget — do NOT await
  fetch(`${appUrl}/api/run-cinematic`, {
    method:  "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-internal-secret": secret,
    },
    body: JSON.stringify({ jobId: job.id }),
  }).catch((err: unknown) =>
    console.error("[cinematic-jobs] fire-and-forget failed:", (err as Error).message),
  );

  console.log(`[cinematic-jobs] queued job=${job.id} user=${user.id} txn=${txnId}`);
  return NextResponse.json({ jobId: job.id, status: "queued" });
}
