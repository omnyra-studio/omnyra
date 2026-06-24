export type SceneIndex  = number;
export type ProjectId   = string;
export type CharacterId = string;
export type DriftScore  = number;

export type ContinuityResult = {
  valid:      boolean;
  driftScore: number;
  errors:     string[];
};

/** Versioned wrapper around a snapshot — append-only ledger entry. */
export type SnapshotVersion<T = unknown> = {
  version:       number;
  parentVersion: number | null;
  projectId:     string;
  sceneIndex:    number;
  data:          T;
  createdAt:     number;
};

export const IMMUTABILITY_RULES = {
  snapshot:
    "Snapshots are immutable. Never mutate in place. Always create a new version.",
  workers:
    "Workers must treat snapshots as read-only inputs.",
  storage:
    "Database is append-only for snapshot versions.",
  runtime:
    "Any mutation attempt must throw immediately in development and production.",
} as const;
