/**
 * GET /api/templates/list
 * Returns all public templates (internal prompt fields stripped).
 * Safe to call from the client — video_prompt, negative_prompt,
 * scene_structure, reference_guide are never included.
 */

import { templates, toPublicTemplate } from "@/lib/templates";

export const dynamic = "force-static";

export async function GET() {
  const primary = templates.filter(t => !t.id.startsWith("ugc") && !t.id.startsWith("storytime") && !t.id.startsWith("influencer") && !t.id.startsWith("product-launch") && !t.id.startsWith("faceless"));
  const legacy  = templates.filter(t => !primary.includes(t));

  return Response.json({
    primary: primary.map(toPublicTemplate),
    legacy:  legacy.map(toPublicTemplate),
  }, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
