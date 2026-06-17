/**
 * POST /api/avatar-worker/recover  (consensus recovery engine — internal only)
 *
 * Delegates all reconciliation to the consensus engine (lib/avatar-consensus.ts),
 * which runs four independent passes:
 *
 *   Pass 1 — Lease recovery
 *     Reclaims jobs stuck in 'processing' with expired leases.
 *     Permanently fails stages that have exhausted per-stage retry caps.
 *
 *   Pass 2 — Cost-ledger reconciliation
 *     Rebuilds execution ledger entries from charged cost records.
 *     Prevents re-execution of API calls that were already paid for.
 *
 *   Pass 3 — Orphaned trigger recovery
 *     Re-triggers jobs stuck in 'queued' (non-initial stage) for > 10 min.
 *     Covers the case where the inter-stage retrigger fetch silently failed.
 *
 *   Pass 4 — DAG repair
 *     Detects and corrects job.stage drift against ledger truth.
 *     Only touches unlocked queued jobs (locked_by IS NULL).
 *
 * Auth: Authorization: Bearer <CRON_SECRET>  OR  x-worker-secret: <CRON_SECRET>
 *
 * Schedule (vercel.json):
 *   { "crons": [{ "path": "/api/avatar-worker/recover", "schedule": "0,10,20,30,40,50 * * * *" }] }
 *
 * Returns: { stats, triggered, reports }
 */

import { after } from "next/server";
import { runSystemConsensus } from "@/lib/avatar-consensus";
import { cleanEnv } from "@/lib/supabase/admin";

export const maxDuration = 60;

// Vercel cron jobs fire GET requests — delegate so the vercel.json entry works.
export async function GET(req: Request) {
  return POST(req);
}

export async function POST(req: Request) {
  const secret = cleanEnv(process.env.CRON_SECRET);
  if (secret) {
    const bearerOk = req.headers.get("authorization") === `Bearer ${secret}`;
    const headerOk = req.headers.get("x-worker-secret") === secret;
    if (!bearerOk && !headerOk) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  // Run all consensus passes synchronously so we can return meaningful stats.
  // Worker triggers fire inside after() — non-blocking to the caller.
  const result = await runSystemConsensus();

  const origin       = new URL(req.url).origin;
  const workerUrl    = `${origin}/api/avatar-worker`;
  const workerSecret = cleanEnv(process.env.CRON_SECRET) ?? "";

  if (result.toTrigger.length > 0) {
    after(async () => {
      for (const jobId of result.toTrigger) {
        try {
          await fetch(workerUrl, {
            method:  "POST",
            headers: {
              "Content-Type":    "application/json",
              "x-worker-secret": workerSecret,
            },
            body: JSON.stringify({ jobId }),
          });
          console.log(`[avatar-recover] triggered worker for job=${jobId}`);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error(`[avatar-recover] trigger failed job=${jobId}: ${msg}`);
        }
      }
    });
  }

  console.log("[avatar-recover] consensus complete", result.stats);

  return Response.json({
    stats:     result.stats,
    triggered: result.toTrigger,
    reports:   result.reports.map(r => ({
      jobId:   r.jobId,
      actions: r.actions.map(a => `[pass${a.pass}] ${a.type}: ${a.detail}`),
    })),
  });
}
