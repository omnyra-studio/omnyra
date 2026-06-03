/**
 * POST /api/workers/avatar
 *
 * HTTP adapter for the avatar job orchestrator.
 * Authenticated via X-Worker-Secret header — NOT user session auth.
 *
 * Two modes:
 *   1. Body contains { job_id, input } → run a specific job
 *   2. Body is empty / { claim: true } → claim the next queued job and run it
 *
 * Env vars: WORKER_SECRET (required), HEDRA_API_KEY
 */

import { NextResponse }         from "next/server";
import { randomUUID }           from "crypto";
import { runAvatarJob, claimAndRunNextJob } from "@/lib/avatar/job-orchestrator";
import type { AvatarJobInput }  from "@/lib/avatar/job-orchestrator";

export const maxDuration = 300;

export async function POST(req: Request) {
  // ── Auth ──────────────────────────────────────────────────────────────────────
  const secret = process.env.WORKER_SECRET;
  if (secret && req.headers.get("X-Worker-Secret") !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const workerId = randomUUID();

  // ── Parse body ────────────────────────────────────────────────────────────────
  let body: { job_id?: string; input?: AvatarJobInput; claim?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    // empty body → claim mode
  }

  // ── Mode 1: claim next queued job ─────────────────────────────────────────────
  if (!body.job_id || body.claim) {
    const result = await claimAndRunNextJob(workerId);
    if (!result) {
      return NextResponse.json({ ok: true, claimed: false, message: "No jobs in queue" });
    }
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  }

  // ── Mode 2: run specific job ──────────────────────────────────────────────────
  if (!body.input?.image_url || !body.input?.audio_url) {
    return NextResponse.json({ error: "input.image_url and input.audio_url are required" }, { status: 400 });
  }

  const result = await runAvatarJob(body.job_id, body.input, workerId);
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
