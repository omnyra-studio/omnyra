/**
 * Centralised environment variable validation.
 *
 * Use requireEnv() at the top of any route that has a hard dependency on an
 * env var — the route will fail immediately with a clear message rather than
 * propagating a confusing undefined further down the call stack.
 *
 * Intentional non-users:
 *   - Stripe webhook / OAuth routes: they already guard inline and have
 *     specific error contracts with external systems.
 */

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[env] Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Validate a group of env vars at once. Throws with ALL missing names listed
 * so a deploy misconfiguration is diagnosed in a single error.
 */
export function requireEnvGroup(names: string[]): Record<string, string> {
  const missing = names.filter(n => !process.env[n]);
  if (missing.length > 0) {
    throw new Error(`[env] Missing required environment variables: ${missing.join(', ')}`);
  }
  return Object.fromEntries(names.map(n => [n, process.env[n] as string]));
}
