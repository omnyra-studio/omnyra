import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { cleanEnv } from "@/lib/supabase/admin";

export interface AnalyticsData {
  credits_used_this_month: number;
  credits_remaining: number | null;
  top_tools: Array<{ tool: string; count: number }>;
  recent_events: Array<{
    id: string;
    event_type: string;
    credits_used: number;
    metadata: Record<string, unknown> | null;
    created_at: string;
  }>;
}

export async function GET() {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createClient(
    cleanEnv(process.env.NEXT_PUBLIC_SUPABASE_URL),
    cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY),
  );

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [eventsRes, recentRes, profileRes] = await Promise.allSettled([
    admin
      .from("usage_events")
      .select("event_type, credits_used")
      .eq("user_id", user.id)
      .gte("created_at", monthStart.toISOString()),
    admin
      .from("usage_events")
      .select("id, event_type, credits_used, metadata, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5),
    admin
      .from("profiles")
      .select("credits")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  const monthEvents =
    eventsRes.status === "fulfilled" && !eventsRes.value.error
      ? (eventsRes.value.data ?? [])
      : [];

  const recentEvents =
    recentRes.status === "fulfilled" && !recentRes.value.error
      ? (recentRes.value.data ?? [])
      : [];

  const credits =
    profileRes.status === "fulfilled" && !profileRes.value.error
      ? ((profileRes.value.data as { credits?: number } | null)?.credits ?? null)
      : null;

  const creditsUsed = monthEvents.reduce(
    (sum: number, e: { credits_used?: number }) => sum + (e.credits_used ?? 0),
    0,
  );

  // Top tools by usage count
  const toolCounts: Record<string, number> = {};
  for (const e of monthEvents as { event_type?: string }[]) {
    if (!e.event_type) continue;
    toolCounts[e.event_type] = (toolCounts[e.event_type] ?? 0) + 1;
  }
  const topTools = Object.entries(toolCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([tool, count]) => ({ tool, count }));

  const payload: AnalyticsData = {
    credits_used_this_month: creditsUsed,
    credits_remaining: credits,
    top_tools: topTools,
    recent_events: recentEvents as AnalyticsData["recent_events"],
  };

  return Response.json(payload);
}
