/**
 * GET /api/debug-hedra
 *
 * One-shot connectivity and configuration diagnostic for the Hedra provider.
 * Requires x-worker-secret header (same as avatar-worker) so it is not
 * publicly accessible without the secret.
 *
 * Remove this file once Hedra connectivity is confirmed stable.
 */

export const maxDuration = 30;

interface ProbeResult {
  ok:      boolean;
  status?: number;
  error?:  string;
  code?:   string;
  cause?:  string;
  ms:      number;
}

async function probe(url: string, method = "HEAD"): Promise<ProbeResult> {
  const t0 = Date.now();
  try {
    const r = await fetch(url, { method, signal: AbortSignal.timeout(8_000) });
    return { ok: r.ok, status: r.status, ms: Date.now() - t0 };
  } catch (err) {
    const e    = err instanceof Error ? err : new Error(String(err));
    const node = e as NodeJS.ErrnoException & { cause?: { code?: string; message?: string } };
    return {
      ok:    false,
      error: e.message,
      code:  node.code ?? node.cause?.code,
      cause: node.cause?.message,
      ms:    Date.now() - t0,
    };
  }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("x-worker-secret") !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const hedraBase = (process.env.HEDRA_API_BASE ?? "https://api.hedra.com/web-app/public").replace(/\/$/, "");

  const [hedraRoot, hedraV1, hedraEndpoint, httpbin, supabase] = await Promise.all([
    probe("https://api.hedra.com"),
    probe(`${hedraBase}`),
    probe(`${hedraBase}/generations`, "OPTIONS"),
    probe("https://httpbin.org/get", "GET"),
    probe(`${process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://supabase.co"}`),
  ]);

  const apiKeyPresent = !!process.env.HEDRA_API_KEY;
  const apiKeyPrefix  = process.env.HEDRA_API_KEY
    ? `${process.env.HEDRA_API_KEY.substring(0, 6)}...`
    : "MISSING";

  const result = {
    runtime: {
      platform:     process.platform,
      node_version: process.version,
      region:       process.env.VERCEL_REGION ?? process.env.AWS_REGION ?? "unknown",
    },
    config: {
      hedra_base:        hedraBase,
      api_key_present:   apiKeyPresent,
      api_key_prefix:    apiKeyPrefix,
    },
    connectivity: {
      hedra_root:     hedraRoot,
      hedra_v1_base:  hedraV1,
      hedra_endpoint: hedraEndpoint,
      httpbin_get:    httpbin,
      supabase_root:  supabase,
    },
    diagnosis: (() => {
      if (!apiKeyPresent)          return "HEDRA_API_KEY is missing — set it in Vercel environment variables";
      if (!hedraRoot.ok && httpbin.ok)
        return `Hedra DNS/network failure (${hedraRoot.error ?? hedraRoot.code}) — api.hedra.com unreachable from Vercel but external internet works. Check HEDRA_API_BASE env var or contact Hedra support.`;
      if (!hedraRoot.ok && !httpbin.ok)
        return "All outbound network blocked — possible Vercel network policy or firewall. Check Vercel project network settings.";
      if (hedraRoot.ok && !apiKeyPresent)
        return "Hedra is reachable but API key is missing";
      if (hedraRoot.ok)
        return "Hedra appears reachable — failure is likely URL/payload related, not network. Check signed URLs and payload validation logs.";
      return "Unknown — review raw connectivity results above";
    })(),
    timestamp: new Date().toISOString(),
  };

  return Response.json(result, { status: 200 });
}
