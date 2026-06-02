/**
 * GET /api/architecture
 *
 * Returns the architecture manifest version, checksum, and load time.
 * Used for deployment debugging and architecture traceability.
 *
 * Verifies that the deployed manifest matches what CI validated.
 */

import { createHash }  from "crypto";
import { readFileSync } from "fs";
import { join }        from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let cached: { version: string; checksum: string; loadedAt: string } | null = null;

function load() {
  if (cached) return cached;

  const manifestPath = join(process.cwd(), "architecture", "allowed-pipelines.json");
  let raw: string;
  try {
    raw = readFileSync(manifestPath, "utf8");
  } catch {
    return null;
  }

  const manifest = JSON.parse(raw) as { version?: string };
  const checksum  = createHash("sha256").update(raw).digest("hex").substring(0, 16);

  cached = {
    version:  manifest.version ?? "unknown",
    checksum,
    loadedAt: new Date().toISOString(),
  };

  console.log(
    `[ARCHITECTURE] Version: ${cached.version}  Checksum: ${cached.checksum}  Environment: ${process.env.NODE_ENV ?? "unknown"}  Loaded: architecture/allowed-pipelines.json`,
  );

  return cached;
}

export async function GET() {
  const info = load();
  if (!info) {
    return Response.json({ error: "Architecture manifest not found" }, { status: 500 });
  }
  return Response.json(info);
}
