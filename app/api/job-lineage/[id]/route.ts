/**
 * GET /api/job-lineage/[id]
 *
 * Assembles a complete reconstruction of a job from data already stored across
 * three existing tables — no new schema needed.
 *
 * Returns:
 *   - original intent (script, voice, image, plan, character)
 *   - Director Core scene plan (scene_specs from stage_outputs)
 *   - all intermediate asset URLs (audio per scene, Kling clips, lipsynced clips)
 *   - per-stage latency from avatar_stage_ledger
 *   - per-stage cost from external_api_cost_ledger
 *   - final output URL
 *
 * Auth: owner-only — returns 404 (not 403) on id mismatch to avoid enumeration.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const maxDuration = 15;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: jobId } = await params;

  // Auth — use anon client to get the caller's identity
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch in parallel — ownership check via user_id match
  const [jobResult, ledgerResult, costResult] = await Promise.all([
    supabaseAdmin
      .from("avatar_jobs")
      .select("id, user_id, status, stage, input, stage_outputs, result_url, animated_video_url, error, retry_count, created_at, updated_at")
      .eq("id", jobId)
      .single(),

    supabaseAdmin
      .from("avatar_stage_ledger")
      .select("stage, status, created_at, updated_at")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true }),

    supabaseAdmin
      .from("external_api_cost_ledger")
      .select("provider, stage, cost_estimate, status")
      .eq("job_id", jobId),
  ]);

  const job = jobResult.data;
  if (!job || job.user_id !== user.id) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  // Parse stage_outputs JSONB
  const outputs = (job.stage_outputs ?? {}) as Record<string, string>;

  const sceneSpecs = outputs.scene_specs
    ? tryParse<object[]>(outputs.scene_specs) ?? []
    : [];

  const audioSegments = outputs.audio_segments
    ? tryParse<Array<{ index: number; text: string; audio_url: string; char_count: number }>>(outputs.audio_segments) ?? []
    : outputs.audio_url
      ? [{ index: 0, text: "", audio_url: outputs.audio_url, char_count: 0 }]
      : [];

  const klingClipUrls: string[] = outputs.scene_video_urls
    ? tryParse<string[]>(outputs.scene_video_urls) ?? []
    : outputs.animated_video_url
      ? [outputs.animated_video_url]
      : [];

  const lipsyncClipUrls: string[] = outputs.lipsync_scene_urls
    ? tryParse<string[]>(outputs.lipsync_scene_urls) ?? []
    : [];

  // Stage latency breakdown
  const stageLatencies = (ledgerResult.data ?? []).map(l => ({
    stage:      l.stage,
    status:     l.status,
    latency_ms: Math.max(0, new Date(l.updated_at).getTime() - new Date(l.created_at).getTime()),
    started_at: l.created_at,
    ended_at:   l.updated_at,
  }));

  // Cost breakdown
  const stageCosts = (costResult.data ?? []).map(c => ({
    provider:      c.provider,
    stage:         c.stage,
    credits:       Number(c.cost_estimate ?? 0),
    status:        c.status,
  }));
  const totalCreditsCost = stageCosts
    .filter(c => c.status === "charged")
    .reduce((sum, c) => sum + c.credits, 0);

  const totalMs = new Date(job.updated_at).getTime() - new Date(job.created_at).getTime();

  return Response.json({
    job_id:    job.id,
    status:    job.status,

    intent: {
      script:       (job.input as Record<string, unknown>)?.script ?? null,
      voice_id:     (job.input as Record<string, unknown>)?.voice_id ?? null,
      image_url:    (job.input as Record<string, unknown>)?.image_url ?? null,
      plan:         (job.input as Record<string, unknown>)?.plan ?? null,
      character_id: (job.input as Record<string, unknown>)?.character_id ?? null,
    },

    director_output: {
      scene_count: sceneSpecs.length,
      scenes:      sceneSpecs,
    },

    intermediate_assets: {
      audio_segments:   audioSegments,
      kling_clips:      klingClipUrls,
      lipsynced_clips:  lipsyncClipUrls,
    },

    final_output_url: job.result_url ?? null,

    execution: {
      total_ms:      Math.max(0, totalMs),
      stage_latency: stageLatencies,
      stage_costs:   stageCosts,
      total_credits: Math.round(totalCreditsCost),
      retry_count:   job.retry_count ?? 0,
      error:         job.error ?? null,
    },

    created_at: job.created_at,
  });
}

function tryParse<T>(json: string): T | null {
  try { return JSON.parse(json) as T; }
  catch { return null; }
}
