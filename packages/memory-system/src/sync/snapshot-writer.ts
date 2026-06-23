import type { ContinuitySnapshot } from "@omnyra/continuity-engine";

/**
 * Snapshot persistence helpers.
 * In production: writes to Supabase `story_state` table.
 * Thin wrapper — actual DB client injected at call site.
 */

export interface SnapshotRecord {
  project_id:         string;
  scene_index:        number;
  snapshot_json:      string;   // JSON.stringify(ContinuitySnapshot)
  drift_score:        number;
  validation_passed:  boolean;
  created_at:         string;
}

export function serializeSnapshot(snapshot: ContinuitySnapshot): SnapshotRecord {
  return {
    project_id:        snapshot.projectId,
    scene_index:       snapshot.sceneIndex,
    snapshot_json:     JSON.stringify(snapshot),
    drift_score:       snapshot.validation.driftScore,
    validation_passed: snapshot.validation.passed,
    created_at:        new Date(snapshot.timestamps.createdAt).toISOString(),
  };
}

export function deserializeSnapshot(record: SnapshotRecord): ContinuitySnapshot {
  return JSON.parse(record.snapshot_json) as ContinuitySnapshot;
}
