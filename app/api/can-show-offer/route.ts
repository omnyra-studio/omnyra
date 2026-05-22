/* POST /api/can-show-offer
 *
 * Direct probe of the throttle for the authenticated user. Used by:
 *   - The client, to check whether a planned offer surface should
 *     render at all (avoid even fetching the decision engine if
 *     throttled).
 *   - Admin tools, to debug "why did this user not see an offer?"
 *
 * Body:
 *   { offer_type?: "upgrade" | "discount" | "credits" | "reactivation" }
 *
 * Returns the spec's exact shape:
 *   { allowed, reason?, cooldown_remaining? }
 */

import { getUserAndPlan } from "../../../lib/auth";
import { canShowOffer, type OfferType } from "../../../lib/revenue/throttle";

export const dynamic = "force-dynamic";

const ALLOWED_TYPES: ReadonlySet<OfferType> = new Set<OfferType>([
  "upgrade",
  "discount",
  "credits",
  "reactivation",
]);

interface Body {
  offer_type?: string;
}

export async function POST(request: Request) {
  const { user } = await getUserAndPlan(request);
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    // empty body OK
  }

  const offerType: OfferType | undefined =
    body.offer_type && ALLOWED_TYPES.has(body.offer_type as OfferType)
      ? (body.offer_type as OfferType)
      : undefined;

  const result = await canShowOffer(user.id, offerType);

  return Response.json({
    allowed: result.allowed,
    reason: result.allowed ? undefined : result.reason,
    cooldown_remaining: result.cooldown_remaining ?? undefined,
  });
}
