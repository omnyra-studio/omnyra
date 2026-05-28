/**
 * Schema artifact loader.
 *
 * The compiler NEVER reads the live DB. It reads ONLY the frozen artifact
 * written by `npm run freeze-schema`. This makes graph validation fully
 * offline and deterministic — the same artifact produces the same decisions
 * regardless of DB state at the time of compilation.
 *
 * In CI: freeze-schema runs before build, artifact is committed.
 * At runtime: artifact is loaded once and cached in module scope.
 */

import type { SchemaArtifact } from "./types";

let _cached: SchemaArtifact | null = null;

export function loadSchemaArtifact(): SchemaArtifact {
  if (_cached) return _cached;

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const artifact = require("../../../artifacts/schema.json") as SchemaArtifact;
    _cached = Object.freeze(artifact);
    return _cached;
  } catch {
    throw new Error(
      "[SCHEMA ARTIFACT MISSING] Run `npm run freeze-schema` before compiling graphs. " +
      "The compiler requires artifacts/schema.json to validate DAG nodes.",
    );
  }
}
