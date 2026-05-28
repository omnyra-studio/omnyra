/**
 * POST /api/workers/voiceover
 * HTTP adapter for the voiceover generation worker.
 * Authenticated via X-Worker-Secret header.
 */

import { NextResponse } from "next/server";
import { processVoiceoverJob } from "@/lib/workers/voiceover-worker";
import type { GenerateVoiceoverJob } from "@/lib/workers/types";

export const maxDuration = 120;

export async function POST(request: Request) {
  const secret = process.env.WORKER_SECRET;
  if (secret && request.headers.get("X-Worker-Secret") !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let job: GenerateVoiceoverJob;
  try {
    job = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!job.planId || !job.userId) {
    return NextResponse.json({ error: "Missing job fields" }, { status: 400 });
  }

  const result = await processVoiceoverJob(job);
  return NextResponse.json(result, { status: result.success ? 200 : 500 });
}
