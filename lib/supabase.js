import { createBrowserClient } from "@supabase/ssr";

let _client = null;

export function getSupabaseClient() {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.warn("[supabase] Missing env vars");
    return null;
  }
  try {
    _client = createBrowserClient(url, key);
    return _client;
  } catch (err) {
    console.error("[supabase] Failed:", err.message);
    return null;
  }
}

export const supabase = new Proxy({}, {
  get(_, prop) {
    const client = getSupabaseClient();
    return client ? client[prop] : undefined;
  },
});
