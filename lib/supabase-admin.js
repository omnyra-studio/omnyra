/* Backward-compat shim — delegates to lib/supabase/admin.ts
 *
 * Server-only. NEVER import from a client component.
 *
 * New code should:
 *   import { supabaseAdmin } from "@/lib/supabase/admin";
 */

export { supabaseAdmin } from "./supabase/admin";
