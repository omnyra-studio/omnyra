"use client";

import { createBrowserClient } from "@supabase/ssr";

function cleanEnv(val: string | undefined): string {
  return (val || "").replace(/[^\x20-\x7E]/g, "").trim();
}

export function createClient() {
  return createBrowserClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}
