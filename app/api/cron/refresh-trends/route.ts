import { refreshNiche } from "@/lib/trends/trendIngestion";

// Scheduled niches — add more as needed
const NICHES = [
  "fitness", "finance", "mindset", "business", "marketing",
  "relationships", "food", "travel", "tech", "education",
  "beauty", "fashion", "entertainment", "gaming", "health",
];

export async function GET(req: Request) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await Promise.allSettled(
    NICHES.map(niche => refreshNiche(niche)),
  );

  const failed = results.filter(r => r.status === "rejected").length;

  return Response.json({
    ok: true,
    refreshed: NICHES.length - failed,
    failed,
    niches: NICHES.length,
  });
}
