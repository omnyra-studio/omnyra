/**
 * GET /api/_telemetry
 *
 * Dev-only trace log — returns all in-process AFAF traces collected since
 * server start. Blocked in production.
 *
 * Use this to diagnose API failures without reading server logs:
 *   curl http://localhost:3000/api/_telemetry | jq '.traces[-5:]'
 */

import { getTraceLog, clearTraceLog } from "@/lib/api/autopsy";

export async function GET(): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "not_available_in_production" }, { status: 403 });
  }

  const traces = getTraceLog();

  return Response.json({
    count:    traces.length,
    failures: traces.filter(t => t.status === "FAILURE").length,
    traces:   [...traces].reverse(),  // most-recent first
  });
}

export async function DELETE(): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "not_available_in_production" }, { status: 403 });
  }

  clearTraceLog();
  return Response.json({ ok: true, message: "Trace log cleared" });
}
