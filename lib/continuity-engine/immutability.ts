/**
 * Immutability enforcement for ContinuitySnapshot.
 *
 * CORE RULE: Snapshots are append-only. Any mutation attempt throws immediately
 * in both development and production.
 */

/** Recursively freeze an object so all mutations throw at runtime. */
export function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== "object") return obj as Readonly<T>;

  Object.getOwnPropertyNames(obj).forEach(prop => {
    const val = (obj as Record<string, unknown>)[prop];
    if (val && typeof val === "object") deepFreeze(val);
  });

  return Object.freeze(obj) as Readonly<T>;
}

/** Shallow freeze (use when deep freeze is too expensive for hot paths). */
export function freezeSnapshot<T>(snapshot: T): Readonly<T> {
  return Object.freeze(snapshot);
}

/**
 * Wraps a snapshot in a Proxy that throws on any write attempt.
 * Use in development to catch illegal mutation before it reaches the engine.
 */
export function detectMutationViolation<T extends object>(
  obj: T,
  label: string,
): T {
  return new Proxy(obj, {
    set(_target, prop) {
      throw new Error(
        `IMMUTABILITY_VIOLATION: attempted set on ${label}.${String(prop)}`,
      );
    },
    deleteProperty(_target, prop) {
      throw new Error(
        `IMMUTABILITY_VIOLATION: attempted delete on ${label}.${String(prop)}`,
      );
    },
  });
}

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
