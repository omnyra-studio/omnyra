/**
 * POST /api/test-env
 *
 * Pre-deploy environment check. Returns which required env vars are set or missing.
 * Does NOT expose values — only reports presence.
 *
 * Requires: x-admin-secret header matching ADMIN_SECRET env var.
 */

import { type NextRequest } from "next/server";

interface EnvGroup {
  label:   string;
  vars:    string[];
  critical: boolean;
}

const ENV_GROUPS: EnvGroup[] = [
  {
    label:    "Supabase",
    critical: true,
    vars: [
      "NEXT_PUBLIC_SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ],
  },
  {
    label:    "AI — Core",
    critical: true,
    vars: [
      "ANTHROPIC_API_KEY",
      "ELEVENLABS_API_KEY",
      "HEDRA_API_KEY",
    ],
  },
  {
    label:    "AI — Video (Fal/Kling)",
    critical: true,
    vars: [
      "FAL_KEY",
      "FAL_API_KEY",
      "KLING_ACCESS_KEY",
      "KLING_SECRET_KEY",
    ],
  },
  {
    label:    "Stripe",
    critical: true,
    vars: [
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
      "STRIPE_PRICE_STARTER",
      "STRIPE_PRICE_CREATOR",
      "STRIPE_PRICE_STUDIO",
    ],
  },
  {
    label:    "Analytics",
    critical: false,
    vars: [
      "NEXT_PUBLIC_POSTHOG_KEY",
      "NEXT_PUBLIC_POSTHOG_HOST",
    ],
  },
  {
    label:    "Email",
    critical: false,
    vars: [
      "RESEND_API_KEY",
      "ZOHO_EMAIL",
      "ZOHO_PASSWORD",
    ],
  },
  {
    label:    "Admin / Security",
    critical: true,
    vars: [
      "ADMIN_SECRET",
      "ADMIN_EMAIL",
      "CRON_SECRET",
    ],
  },
  {
    label:    "Optional AI providers",
    critical: false,
    vars: [
      "RUNWAY_API_KEY",
      "GETIMG_API_KEY",
      "OPENAI_API_KEY",
      "APIFY_TOKEN",
    ],
  },
];

export async function POST(req: NextRequest) {
  const secret   = process.env.ADMIN_SECRET;
  const provided = req.headers.get("x-admin-secret");

  if (!secret || !provided || provided !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: Record<string, {
    label:    string;
    critical: boolean;
    vars:     Record<string, "SET" | "MISSING">;
    allSet:   boolean;
  }> = {};

  let totalMissing   = 0;
  let criticalFailed = 0;

  for (const group of ENV_GROUPS) {
    const vars: Record<string, "SET" | "MISSING"> = {};
    let allSet = true;

    for (const v of group.vars) {
      const set = !!process.env[v];
      vars[v]   = set ? "SET" : "MISSING";
      if (!set) {
        allSet = false;
        totalMissing++;
        if (group.critical) criticalFailed++;
      }
    }

    results[group.label] = { label: group.label, critical: group.critical, vars, allSet };
  }

  const deployReady = criticalFailed === 0;

  return Response.json({
    deployReady,
    totalMissing,
    criticalFailed,
    groups: results,
    nodeVersion: process.version,
    nodeEnv:     process.env.NODE_ENV,
    vercelRegion: process.env.VERCEL_REGION ?? "local",
  }, { status: deployReady ? 200 : 503 });
}

export async function GET() {
  return Response.json({ status: "Use POST with x-admin-secret header" }, { status: 405 });
}
