/**
 * Execution artifact store.
 *
 * Every completed graph execution produces an immutable ExecutionArtifact.
 * Same graphHash → same artifact → identical media output, forever.
 *
 * Current backend: in-process Map (single-instance, ephemeral across deploys).
 * To enable distributed execution or time-travel debugging, replace Map
 * operations with a Supabase table or Redis store — the interface is stable.
 */

import type { ExecutionArtifact } from "./artifact/types";

export class ArtifactNotFoundError extends Error {
  constructor(graphHash: string) {
    super(`[ARTIFACT NOT FOUND] No execution record for graphHash: ${graphHash}`);
    this.name = "ArtifactNotFoundError";
  }
}

const store = new Map<string, ExecutionArtifact>();

export function storeArtifact(artifact: ExecutionArtifact): void {
  store.set(artifact.graphHash, Object.freeze(artifact));
}

export function getArtifact(graphHash: string): ExecutionArtifact | undefined {
  return store.get(graphHash);
}

/** Returns the artifact or throws ArtifactNotFoundError. */
export function replayArtifact(graphHash: string): ExecutionArtifact {
  const artifact = store.get(graphHash);
  if (!artifact) throw new ArtifactNotFoundError(graphHash);
  return artifact;
}

export function listArtifacts(): ReadonlyMap<string, ExecutionArtifact> {
  return store;
}
