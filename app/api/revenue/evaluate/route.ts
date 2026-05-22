/* POST /api/revenue/evaluate
 *
 * Evaluate revenue opportunity for the authenticated user. Returns the
 * server's recommended action (and pricing variant). All monetisation
 * decisions originate here — clients NEVER decide what to show.
 *
 * Body:
 *   { trigger?: "login" | "render_complete" | "third_video" | "manual" }
 *
 * Triggers come from the client (e.g. on login event, after render
 * completes). The server validates the session, runs the decision
 * engine, logs the result, and returns the action.
 */

import { getUserAndPlan } from "../../../../lib/auth";
import {
  evaluateRevenueOpportunity,
  type RevenueTrigger,
} from "../../../../lib/revenue/decisions";

export const dynamic = "force-dynamic";

const ALLOWED_TRIGGERS: ReadonlySet<RevenueTrigger> = new Set<RevenueTrigger>([
  "login",
  "render_complete",
  "credit_low",
  "inactivity",
  "third_video",
  "sweep",
  "manual",
]);

interface Body {
  trigger?: string;
}

export async function POST(request: Request) {
  const { user } = await getUserAndPlan(request);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    // empty body is fine
  }

  const trigger: RevenueTrigger = (body.trigger && ALLOWED_TRIGGERS.has(body.trigger as RevenueTrigger))
    ? (body.trigger as RevenueTrigger)
    : "manual";

  const action = await evaluateRevenueOpportunity(user.id, { trigger });
  return Response.json({ ok: true, action });
}
