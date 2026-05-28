/**
 * Merge layer — deterministic, stateless final assembly.
 *
 * Stitches pre-executed shard outputs (Supabase URLs) into a single final video.
 * The voiceover is applied once at this stage, over the complete assembled timeline.
 *
 * Design invariants:
 *   - Stateless and purely compositional — no DB reads, no clip logic
 *   - Deterministic: identical shard inputs + identical voiceover → identical output
 *   - assertShardContinuity() must pass before any network I/O begins
 *   - Frame math is read from shards (precomputed by contract) — never recomputed
 *   - Shards are passed to the composer as "clips" — large pre-composed segments
 *     that the composer concatenates with the voiceover applied on top
 *
 * Why two passes (shard execution + merge)?
 *   Pass 1 (shard workers): compose clips → shard video (silent, cached)
 *   Pass 2 (merge layer):   stitch shards + apply voiceover → final video
 *   This split enables: parallel shard execution, cache reuse, deterministic assembly.
 */

import type { RenderShard, MergeResult } from "./types";

export interface MergeOptions {
  readonly composerUrl:  string;
  readonly composerKey:  string;
  readonly voiceoverUrl: string | null;
  readonly fps:          number;
}

// ── Frame continuity guard ────────────────────────────────────────────────────
// Must pass before merge receives control. Called with ALL shards in index order.

export function assertShardContinuity(shards: ReadonlyArray<RenderShard>): void {
  if (shards.length === 0) {
    throw new Error("[merge] Empty shard list — nothing to assemble");
  }

  for (let i = 1; i < shards.length; i++) {
    const prev = shards[i - 1];
    const curr = shards[i];

    if (curr.index !== prev.index + 1) {
      throw new Error(
        `[merge] Shard order violation: shard[${prev.index}] followed by shard[${curr.index}]`,
      );
    }
    if (curr.startFrame !== prev.endFrame) {
      throw new Error(
        `[merge] Frame discontinuity: shard[${prev.index}] ends at frame ${prev.endFrame}, ` +
        `shard[${curr.index}] starts at frame ${curr.startFrame}`,
      );
    }
  }
}

// ── Merge ─────────────────────────────────────────────────────────────────────

export async function mergeShards(
  shards:   ReadonlyArray<RenderShard & { outputUrl: string }>,
  options:  MergeOptions,
  fetchFn:  typeof fetch = fetch,
): Promise<MergeResult> {
  assertShardContinuity(shards);

  // Download shard output blobs + voiceover in parallel
  const [shardBlobs, voiceBlob] = await Promise.all([
    Promise.all(
      shards.map(async (s) => {
        const res = await fetchFn(s.outputUrl, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`[merge] Shard ${s.shardId} unreachable: HTTP ${res.status}`);
        }
        return res.blob();
      }),
    ),
    options.voiceoverUrl
      ? fetchFn(options.voiceoverUrl, { cache: "no-store" }).then(async (res) => {
          if (!res.ok) throw new Error(`[merge] Voiceover unreachable: HTTP ${res.status}`);
          return res.blob();
        })
      : Promise.resolve(null),
  ]);

  // Build form — shards as "clips", voiceover applied to the full assembled video
  const form = new FormData();

  for (let i = 0; i < shards.length; i++) {
    form.append("clips", shardBlobs[i], `shard_${i}.mp4`);
  }
  if (voiceBlob) form.append("voiceover", voiceBlob, "voiceover.mp3");

  // Shot plan for the merge pass.
  // Each shard is a pre-composed segment — no per-clip effects or padding.
  // The composer concatenates segments and lays the voiceover across all.
  const totalDurationS = (shards[shards.length - 1].endFrame - shards[0].startFrame) / options.fps;

  form.append("shot_plan", JSON.stringify({
    shots: shards.map((s) => ({
      duration:            s.durationSeconds,
      energy_curve:        "sustain",
      transition_in:       "hard_cut",
      transition_after:    "cut",
      transition_duration: 0,
      zoom_effect:         false,
      start_frame:         s.startFrame,
      end_frame:           s.endFrame,
      frame_norm: {
        render_frames:  s.endFrame - s.startFrame,
        target_frames:  s.endFrame - s.startFrame,
        padding_frames: 0,
        aligned:        true,
      },
    })),
  }));

  // Call composer with 3-minute ceiling for large final assemblies
  const controller = new AbortController();
  const id         = setTimeout(() => controller.abort(), 180_000);

  let res: Response;
  try {
    res = await fetchFn(`${options.composerUrl}/compose`, {
      method:  "POST",
      headers: { "x-api-key": options.composerKey },
      body:    form,
      signal:  controller.signal,
    });
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "AbortError";
    throw new Error(isTimeout ? "[merge] Composer timed out during final assembly" : `[merge] Composer unreachable: ${err}`);
  } finally {
    clearTimeout(id);
  }

  if (!res.ok) {
    let detail = `Composer HTTP ${res.status}`;
    try {
      const b = await res.json() as { error?: string };
      if (b.error) detail = b.error;
    } catch { /* ignore */ }
    throw new Error(`[merge] Composer error: ${detail}`);
  }

  const result = await res.json() as {
    success:          boolean;
    video_url:        string;
    duration_seconds: number | null;
    error?:           string;
  };

  if (!result.success || !result.video_url) {
    throw new Error(`[merge] Composer reported failure: ${result.error ?? "no reason given"}`);
  }

  return {
    videoUrl:        result.video_url,
    durationSeconds: result.duration_seconds ?? totalDurationS,
  };
}
