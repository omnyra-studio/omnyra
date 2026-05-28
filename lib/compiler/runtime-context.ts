import type { SchemaArtifact } from "./artifact/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface RuntimeContext {
  readonly schema:    SchemaArtifact;
  readonly projectId: string;
  readonly db?:       SupabaseClient;
}
