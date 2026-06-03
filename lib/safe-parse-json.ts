// Parses JSON from LLM responses that may be wrapped in markdown code fences.
// Drop-in replacement for JSON.parse() on any AI-generated text.

export class JsonParseError extends Error {
  constructor(message: string, public readonly preview: string) {
    super(message);
    this.name = "JsonParseError";
  }
}

/**
 * Strips markdown wrappers and extracts the outermost JSON object/array.
 * Handles:
 *   - ```json ... ``` fences
 *   - ``` ... ``` fences (no language specifier)
 *   - Prose before the first { or [
 *   - Prose after the final } or ]
 */
export function cleanJsonResponse(input: string): string {
  let s = input.trim();

  // Strip ```json ... ``` or ``` ... ``` fences
  s = s.replace(/^```(?:json|JSON)?\s*/m, "");
  s = s.replace(/\s*```\s*$/m, "");
  s = s.trim();

  // Find outermost object
  const objStart = s.indexOf("{");
  const objEnd   = s.lastIndexOf("}");
  // Find outermost array
  const arrStart = s.indexOf("[");
  const arrEnd   = s.lastIndexOf("]");

  // Prefer object if it starts first (or if no array)
  if (objStart !== -1 && objEnd !== -1 && objEnd > objStart) {
    if (arrStart === -1 || objStart <= arrStart) {
      return s.slice(objStart, objEnd + 1).trim();
    }
  }

  // Fall back to array
  if (arrStart !== -1 && arrEnd !== -1 && arrEnd > arrStart) {
    return s.slice(arrStart, arrEnd + 1).trim();
  }

  // Return trimmed if no delimiters found (let JSON.parse produce the error)
  return s;
}

/**
 * Safely parse JSON from an LLM response.
 * Strips markdown fences, extracts the outermost object/array, then parses.
 * Throws JsonParseError with diagnostic info on failure.
 */
export function safeParseJson<T = unknown>(input: string): T {
  const cleaned  = cleanJsonResponse(input);
  const rawLen   = input.length;
  const cleanLen = cleaned.length;

  try {
    return JSON.parse(cleaned) as T;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const preview = cleaned.substring(0, 200);
    console.error(
      `[SAFE_PARSE_JSON] parse failed — ${msg}\n` +
      `rawLength=${rawLen} cleanedLength=${cleanLen}\n` +
      `preview="${preview}"`,
    );
    throw new JsonParseError(`JSON parse failed: ${msg}`, preview);
  }
}

/**
 * Like safeParseJson but returns null instead of throwing.
 * Use where you want a graceful fallback.
 */
export function tryParseJson<T = unknown>(input: string): T | null {
  try {
    return safeParseJson<T>(input);
  } catch {
    return null;
  }
}
