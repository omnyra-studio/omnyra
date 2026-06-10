// GET /api/render-progress?planId=xxx
//
// Server-sent events stream for parallel render progress.
// Subscribes to orchestration_events via Supabase Realtime, forwarding
// typed events to the client as they arrive.
//
// Client usage:
//   const es = new EventSource(`/api/render-progress?planId=${planId}`);
//   es.addEventListener('KLING_CLIP_READY', e => { ... });
//   es.addEventListener('HEDRA_CLIP_READY', e => { ... });
//   es.addEventListener('PARALLEL_ENGINE_COMPLETE', e => { es.close(); });

import { createServerClient } from "@supabase/ssr";
import { createClient }       from "@supabase/supabase-js";
import { cookies }            from "next/headers";
import { NextRequest }        from "next/server";

export const dynamic    = "force-dynamic";
export const maxDuration = 300;

// Progress event names emitted by parallel-engine.ts
const TERMINAL_EVENTS = new Set([
  "PARALLEL_ENGINE_COMPLETE",
  "PARALLEL_ENGINE_FAILED",
]);

export async function GET(req: NextRequest) {
  const planId = req.nextUrl.searchParams.get("planId");
  if (!planId) {
    return new Response("Missing planId", { status: 400 });
  }

  // Auth check
  const cookieStore = await cookies();
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await supabaseAuth.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  // Verify plan belongs to user (service role for RLS bypass)
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: plan } = await supabaseAdmin
    .from("shot_plans")
    .select("id, scripts!inner(user_id)")
    .eq("id", planId)
    .maybeSingle();

  // Supabase returns scripts as array from the join — coerce safely
  const planWithScript = plan as { id: string; scripts: { user_id: string } | { user_id: string }[] } | null;
  const scriptUserId = planWithScript
    ? (Array.isArray(planWithScript.scripts)
        ? (planWithScript.scripts[0] as { user_id: string } | undefined)?.user_id
        : planWithScript.scripts?.user_id)
    : undefined;
  if (!planWithScript || scriptUserId !== user.id) {
    return new Response("Not found", { status: 404 });
  }

  // ── SSE stream ──────────────────────────────────────────────────────────────
  const stream = new TransformStream<Uint8Array, Uint8Array>();
  const writer = stream.writable.getWriter();
  const enc    = new TextEncoder();

  const send = (eventType: string, data: unknown) => {
    try {
      writer.write(enc.encode(`event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`));
    } catch { /* client disconnected */ }
  };

  // Send heartbeat immediately so the connection is established
  send("connected", { planId, ts: Date.now() });

  // Pull any existing events for this plan (catch-up for reconnects)
  const { data: existing } = await supabaseAdmin
    .from("orchestration_events")
    .select("type, payload, created_at")
    .eq("correlation_id", planId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (existing?.length) {
    for (const ev of existing) {
      send(ev.type as string, { ...(ev.payload as object), _replay: true });
      if (TERMINAL_EVENTS.has(ev.type as string)) {
        writer.close();
        return new Response(stream.readable, {
          headers: {
            "Content-Type":  "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection":    "keep-alive",
          },
        });
      }
    }
  }

  // Subscribe to new events via Realtime
  const channel = supabaseAdmin
    .channel(`render_progress_${planId}`)
    .on(
      "postgres_changes",
      {
        event:  "INSERT",
        schema: "public",
        table:  "orchestration_events",
        filter: `correlation_id=eq.${planId}`,
      },
      (payload) => {
        const row = payload.new as { type: string; payload: unknown };
        send(row.type, row.payload);
        if (TERMINAL_EVENTS.has(row.type)) {
          channel.unsubscribe();
          writer.close().catch(() => {});
        }
      },
    )
    .subscribe();

  req.signal.addEventListener("abort", () => {
    channel.unsubscribe();
    writer.close().catch(() => {});
  });

  return new Response(stream.readable, {
    headers: {
      "Content-Type":  "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection":    "keep-alive",
    },
  });
}
