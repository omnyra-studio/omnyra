/**
 * Auto-Healing Worker
 *
 * When a rendered clip fails the drift gate (overallDrift >= 0.08),
 * this worker repairs ONLY the broken scene — never cascade-rebuilds the chain.
 *
 * Rule: isolated repair. One scene breaks → one scene regenerates.
 */

import type { ContinuitySnapshot } from "@/lib/types/continuity";
import { buildNextScene, validate as validateContinuity, detectDrift } from "@/lib/services/continuity-engine";
import { buildHardModePrompt } from "@/lib/services/hard-mode-compiler";
import { saveSnapshot } from "@/lib/services/snapshot-replay";

export const DRIFT_THRESHOLD  = 0.08;
export const MAX_HEAL_ATTEMPTS = 2;

export interface HealJob {
  projectId:     string;
  sceneIndex:    number;
  snapshot:      ContinuitySnapshot;
  /** Text description of the previous render (camera movement, character description, etc.) */
  previousRenderDescription: string;
  renderFn: (prompt: string, referenceFrameUrl: string | null) => Promise<{ videoUrl: string; lastFrameUrl: string | null }>;
}

export interface HealResult {
  videoUrl:      string;
  lastFrameUrl:  string | null;
  wasRepaired:   boolean;
  driftScore:    number;
  attempts:      number;
}

/**
 * Process a single scene render through the auto-heal loop.
 *
 * If the existing render is within tolerance it is returned immediately.
 * If it drifts, the snapshot is hardened and re-rendered (max MAX_HEAL_ATTEMPTS).
 */
export async function processWithAutoHeal(job: HealJob): Promise<HealResult> {
  const label = `[HEAL project=${job.projectId} scene=${job.sceneIndex}]`;

  for (let attempt = 1; attempt <= MAX_HEAL_ATTEMPTS; attempt++) {
    const snapshot = attempt === 1
      ? job.snapshot
      : buildNextScene(job.snapshot);

    const validation = validateContinuity(snapshot);
    // Use the text-heuristic drift detector with the previous render description
    const drift = detectDrift(snapshot, {
      characterDescription: job.previousRenderDescription,
      cameraMovement:       snapshot.camera.movement,
    });

    if (drift.overallDrift < DRIFT_THRESHOLD) {
      const hardPrompt   = buildHardModePrompt(snapshot);
      const referenceUrl = snapshot.firstFrame?.imageUrl ?? null;

      console.log(`${label} attempt=${attempt} drift=${drift.overallDrift.toFixed(3)} OK → rendering`);
      const result = await job.renderFn(hardPrompt, referenceUrl);

      void saveSnapshot(job.projectId, job.sceneIndex, job.sceneIndex, snapshot);

      return {
        videoUrl:     result.videoUrl,
        lastFrameUrl: result.lastFrameUrl,
        wasRepaired:  attempt > 1,
        driftScore:   drift.overallDrift,
        attempts:     attempt,
      };
    }

    console.warn(
      `${label} attempt=${attempt} drift=${drift.overallDrift.toFixed(3)} >= ${DRIFT_THRESHOLD} — hardening prompt`,
      validation.errors.slice(0, 3),
    );

    const hardenedPrompt = buildHardModePrompt(snapshot);
    const referenceUrl   = snapshot.firstFrame?.imageUrl ?? null;

    const result = await job.renderFn(hardenedPrompt, referenceUrl);

    // Accept on final attempt — better than a dead scene
    if (attempt === MAX_HEAL_ATTEMPTS) {
      console.warn(`${label} max attempts reached — accepting result drift=${drift.overallDrift.toFixed(3)}`);
      void saveSnapshot(job.projectId, job.sceneIndex, job.sceneIndex, snapshot);
      return {
        videoUrl:     result.videoUrl,
        lastFrameUrl: result.lastFrameUrl,
        wasRepaired:  true,
        driftScore:   drift.overallDrift,
        attempts:     attempt,
      };
    }

    console.log(`${label} retrying with hardened snapshot...`);
  }

  // TypeScript unreachable fallback
  throw new Error(`${label} exhausted all heal attempts unexpectedly`);
}
