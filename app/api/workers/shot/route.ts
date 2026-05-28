/**
 * POST /api/workers/shot
 * HTTP adapter for the shot render worker.
 * Authenticated via X-Worker-Secret header — NOT user session auth.
 */

import { NextResponse } from "next/server";
import { processShotJob } from "@/lib/workers/shot-worker";
import type { RenderShotJob } from "@/lib/workers/types";

export const maxDuration = 300;

export async function POST(request: Request) {
  const secret = process.env.WORKER_SECRET;
  if (secret && request.headers.get("X-Worker-Secret") !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let job: RenderShotJob;
  try {
    job = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!job.planId || !job.shotDbId || !job.shotId || !job.userId) {
    return NextResponse.json({ error: "Missing job fields" }, { status: 400 });
  }

  const result = await processShotJob(job);
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}
