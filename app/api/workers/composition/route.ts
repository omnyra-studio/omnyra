/**
 * POST /api/workers/composition
 * HTTP adapter for the composition worker.
 * Authenticated via X-Worker-Secret header.
 */

import { NextResponse } from "next/server";
import { processCompositionJob } from "@/lib/workers/composition-worker";
import type { ComposeVideoJob } from "@/lib/workers/types";

export const maxDuration = 300;

export async function POST(request: Request) {
  const secret = process.env.WORKER_SECRET;
  if (secret && request.headers.get("X-Worker-Secret") !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let job: ComposeVideoJob;
  try {
    job = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!job.planId || !job.projectId || !job.userId) {
    return NextResponse.json({ error: "Missing job fields" }, { status: 400 });
  }

  const result = await processCompositionJob(job);
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}
