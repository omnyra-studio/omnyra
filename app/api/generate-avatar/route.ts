/**
 * POST /api/generate-avatar  (request layer)
 *
 * Validates input, creates a queued avatar_jobs record, triggers the worker,
 * and returns { jobId } immediately — never calls external AI APIs directly.
 *
 * The worker at /api/avatar-worker handles ElevenLabs → Storage → Kling → SyncLabs.
 * Poll /api/job-status?id=<jobId> for progress.
 *
 * Body:    { script: string; voice_id?: string; background_image: string }
 * Returns: { jobId, status }  — or { jobId, status: "completed", result_url, animated_video_url }
 *          when idempotency hits an already-finished job.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { after } from "next/server";
import { createOrFindJob } from "@/lib/avatar-queue";

export const maxDuration = 30;

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { script?: string; voice_id?: string; background_image?: string; plan?: string; character_id?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { script, voice_id, background_image, plan, character_id } = body;

  if (!script?.trim()) {
    return Response.json({ error: "script is required" }, { status: 400 });
  }
  if (!background_image?.startsWith("https://")) {
    return Response.json({
      error: "A character image is required. Generate or upload an image first.",
      missing: "background_image",
    }, { status: 400 });
  }

  if (!process.env.ELEVENLABS_API_KEY) {
    return Response.json({ error: "ELEVENLABS_API_KEY not configured" }, { status: 500 });
  }
  if (!process.env.FAL_API_KEY && !process.env.FALAI_API_KEY) {
    return Response.json({ error: "FAL_API_KEY not configured" }, { status: 500 });
  }

  const input = {
    script:       script.trim(),
    voice_id:     voice_id || null,
    image_url:    background_image,
    plan:         (plan === "studio" ? "studio" : "starter") as "starter" | "studio",
    character_id: character_id || null,
  };

  let job;
  try {
    job = await createOrFindJob(user.id, input);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generate-avatar] createOrFindJob failed:", msg);
    return Response.json({ error: "Failed to queue avatar job" }, { status: 500 });
  }

  // Already done — return result immediately (idempotency hit)
  if (job.status === "completed") {
    return Response.json({
      jobId: job.id,
      status: "completed",
      result_url: job.result_url,
      animated_video_url: job.animated_video_url,
    });
  }

  // Already running — just return the jobId so caller can poll
  if (job.status === "processing") {
    return Response.json({ jobId: job.id, status: "processing" });
  }

  // Queued (new or reset) — fire the worker after this response is sent
  const origin = new URL(req.url).origin;
  const workerUrl = `${origin}/api/avatar-worker`;
  const secret = process.env.CRON_SECRET ?? "";
  const jobId = job.id;

  after(() =>
    fetch(workerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-worker-secret": secret },
      body: JSON.stringify({ jobId }),
    }).catch((e) =>
      console.error("[generate-avatar] worker trigger failed:", e?.message)
    )
  );

  return Response.json({ jobId, status: "queued" });
}
