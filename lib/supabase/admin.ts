/* SERVER ONLY — NEVER IMPORT IN A CLIENT COMPONENT
 *
 * This module holds the Supabase service_role client. The service_role
 * key bypasses Row Level Security and must never reach the browser.
 *
 * Safe to import from:
 *   - app/api/** route handlers
 *   - server-only utilities
 *
 * NOT safe to import from:
 *   - any file with "use client"
 *   - components rendered in the client bundle
 */

import { createClient } from "@supabase/supabase-js";

if (typeof window !== "undefined") {
  throw new Error(
    "[lib/supabase/admin] imported from the browser — service_role must never run client-side",
  );
}

export function cleanEnv(val: string | undefined): string {
  return (val || "").replace(/[^\x20-\x7E]/g, "").trim();
}

export const supabaseAdmin = createClient(
  cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
  cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY),
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);
