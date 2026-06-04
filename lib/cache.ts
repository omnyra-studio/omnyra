import { createHash } from "crypto";
import { createClient } from "@supabase/supabase-js";
import { cleanEnv } from "@/lib/supabase/admin";

function adminClient() {
  return createClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY),
  );
}

function cacheKey(toolName: string, prompt: string): string {
  return createHash("md5").update(`${toolName}:${prompt}`).digest("hex");
}

export async function checkCache(
  userId: string,
  toolName: string,
  prompt: string,
): Promise<string | null> {
  try {
    const db = adminClient();
    const { data } = await db
      .from("generation_cache")
      .select("payload")
      .eq("user_id", userId)
      .eq("cache_key", cacheKey(toolName, prompt))
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!data?.payload) return null;
    return (data.payload as { output?: string }).output ?? null;
  } catch (err) {
    console.warn("[cache] checkCache error:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function saveCache(
  userId: string,
  toolName: string,
  prompt: string,
  output: string,
): Promise<void> {
  try {
    const db = adminClient();
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    await db.from("generation_cache").upsert(
      {
        user_id: userId,
        cache_key: cacheKey(toolName, prompt),
        payload: { output, tool: toolName },
        expires_at: expiresAt,
      },
      { onConflict: "user_id,cache_key" },
    );
  } catch (err) {
    console.warn("[cache] saveCache error:", err instanceof Error ? err.message : err);
  }
}

export async function logUsageEvent(
  userId: string,
  toolName: string,
  action: string,
  creditsUsed: number,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const db = adminClient();
    await db.from("usage_events").insert({
      user_id: userId,
      event_type: toolName,
      credits_used: creditsUsed,
      metadata: { action, ...metadata },
    });
  } catch (err) {
    console.warn("[cache] logUsageEvent error:", err instanceof Error ? err.message : err);
  }
}
