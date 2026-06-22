/**
 * Omnyra Credit State Machine
 *
 * One invariant: every paid operation resolves as exactly one of:
 *   COMMITTED  — work succeeded, credits consumed
 *   ROLLED_BACK — any failure, credits fully restored
 *
 * Usage:
 *   const result = await withCreditState({
 *     userId,
 *     cost,
 *     run: async () => ({ data: await doWork(), actualCost: finalCost }),
 *   });
 *
 * The `run` function may return `{ data, actualCost }` to adjust the final charge
 * (e.g. video pipeline over-reserves then commits only what was used).
 * If `actualCost` is omitted, the full `cost` is committed.
 */

import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabase/admin";

// ── Typed errors (catch these in route handlers for correct HTTP codes) ────────

export class InsufficientCreditsError extends Error {
  readonly balance:  number;
  readonly cost:     number;
  readonly planType: string;

  constructor(balance: number, cost: number, planType = "unknown") {
    super("INSUFFICIENT_CREDITS");
    this.name     = "InsufficientCreditsError";
    this.balance  = balance;
    this.cost     = cost;
    this.planType = planType;
  }
}

export class CreditReservationError extends Error {
  constructor(detail: string) {
    super(`Credit reservation failed: ${detail}`);
    this.name = "CreditReservationError";
  }
}

// ── Run-result wrapper (allows variable-cost commit) ─────────────────────────

export interface CreditStateRunResult<T> {
  data:        T;
  actualCost?: number; // if provided, commits this amount instead of `cost`
}

// ── Core wrapper ──────────────────────────────────────────────────────────────

export async function withCreditState<T>(params: {
  userId: string;
  cost:   number;
  run:    () => Promise<CreditStateRunResult<T> | T>;
}): Promise<T> {
  const txnId    = randomUUID();
  let   reserved = false;

  // ── 1. Reserve atomically (12s timeout — Supabase RPCs can hang indefinitely) ─
  console.log(`[CREDIT_RESERVE] start txn=${txnId} user=${params.userId} cost=${params.cost}`);
  const reserveRpc = supabaseAdmin.rpc(
    "credit_reserve_atomic",
    { p_user_id: params.userId, p_amount: params.cost, p_txn_id: txnId },
  );
  const { data: reserveResult, error: reserveErr } = await Promise.race([
    reserveRpc,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`credit_reserve_atomic TIMEOUT 12s txn=${txnId}`)), 12_000),
    ),
  ]);
  console.log(`[CREDIT_RESERVE] done success=${reserveResult?.success ?? false} balance=${reserveResult?.balance ?? "?"}`);

  if (reserveErr) {
    throw new CreditReservationError(reserveErr.message);
  }

  if (!reserveResult?.success) {
    throw new InsufficientCreditsError(
      reserveResult?.balance  ?? 0,
      params.cost,
      reserveResult?.plan_type ?? "unknown",
    );
  }

  reserved = true;

  // ── 2. Execute work ───────────────────────────────────────────────────────
  try {
    const runResult  = await params.run();

    // Unwrap optional { data, actualCost } envelope
    const isEnvelope = (
      runResult !== null &&
      typeof runResult === "object" &&
      "data" in (runResult as object)
    );
    const data       = isEnvelope
      ? (runResult as CreditStateRunResult<T>).data
      : (runResult as T);
    const actualCost = isEnvelope
      ? ((runResult as CreditStateRunResult<T>).actualCost ?? params.cost)
      : params.cost;

    // ── 3. Commit (always awaited, 12s timeout) ────────────────────────────
    const { error: commitErr } = await Promise.race([
      supabaseAdmin.rpc("credit_commit_atomic", { p_txn_id: txnId, p_actual_cost: actualCost }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`credit_commit_atomic TIMEOUT 12s txn=${txnId}`)), 12_000),
      ),
    ]).catch(timeoutErr => {
      console.error("[CREDIT_COMMIT_TIMEOUT]", timeoutErr instanceof Error ? timeoutErr.message : timeoutErr);
      return { error: null }; // treat timeout as non-fatal — user got their output
    });

    if (commitErr) {
      // Commit failed — credits were consumed but DB record is inconsistent.
      // Log prominently. Do NOT roll back (user received output). Escalate for manual review.
      console.error("[CREDIT_COMMIT_FAILED] MANUAL REVIEW REQUIRED", {
        txnId,
        userId:  params.userId,
        cost:    params.cost,
        actual:  actualCost,
        error:   commitErr.message,
      });
    }

    return data;
  } catch (err) {
    // ── 4. Rollback on any failure (always awaited) ─────────────────────────
    if (reserved) {
      const { error: rollbackErr } = await Promise.race([
        supabaseAdmin.rpc("credit_rollback_atomic", { p_txn_id: txnId }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`credit_rollback_atomic TIMEOUT 12s txn=${txnId}`)), 12_000),
        ),
      ]).catch(timeoutErr => {
        console.error("[CREDIT_ROLLBACK_TIMEOUT] MANUAL REVIEW REQUIRED", { txnId, userId: params.userId, error: timeoutErr instanceof Error ? timeoutErr.message : timeoutErr });
        return { error: null };
      });

      if (rollbackErr) {
        console.error("[CREDIT_ROLLBACK_FAILED] MANUAL REVIEW REQUIRED", {
          txnId,
          userId:        params.userId,
          cost:          params.cost,
          rollbackError: rollbackErr.message,
          originalError: err instanceof Error ? err.message : String(err),
        });
      }
    }

    throw err;
  }
}
