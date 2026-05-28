/* Backward-compat shim.
 *
 * New code should import directly:
 *   - Client components: import { createClient } from "@/lib/supabase/client"
 *   - Server components: import { createClient } from "@/lib/supabase/server"
 *   - API routes (admin): import { supabaseAdmin } from "@/lib/supabase/admin"
 *
 * This file preserves the legacy `supabase` proxy export used by the
 * existing client-side code paths so we don't break in-flight auth.
 * It only ever uses the public anon key.
 */

import { createBrowserClient } from "@supabase/ssr";

// Strip BOM (U+FEFF) and other invisible chars that corrupt fetch ByteString headers
function cleanEnvVar(str) {
  if (!str) return '';
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c <= 127 && c >= 32) out += str[i];
  }
  return out.trim();
}

let _client = null;

export function getSupabaseClient() {
  if (_client) return _client;
  const url = cleanEnvVar(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = cleanEnvVar(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  if (!url || !key) {
    if (typeof console !== "undefined") {
      console.warn("[supabase] Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
    }
    return null;
  }
  try {
    _client = createBrowserClient(url, key);
    return _client;
  } catch (err) {
    if (typeof console !== "undefined") {
      console.error("[supabase] Failed to initialise:", err.message);
    }
    return null;
  }
}

export const supabase = new Proxy({}, {
  get(_, prop) {
    const client = getSupabaseClient();
    return client ? client[prop] : undefined;
  },
});
