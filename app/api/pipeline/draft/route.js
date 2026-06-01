import { getUserAndPlan } from "../../../../lib/auth";
import { buildMasterPrompt } from "../../../../lib/prompt-engine";
import { buildScenePrompts } from "../../../../lib/scene-engine";
import { guardPipelineRequest } from "../../../../lib/api-guard";
import { getBrandProfile, getBrandSystemPrompt } from "../../../../lib/brand";
import { checkCache, saveCache, logUsageEvent } from "../../../../lib/cache";

export async function POST(request) {
  const { user } = await getUserAndPlan(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const guarded = await guardPipelineRequest({
    userId: user.id,
    endpoint: "/api/pipeline/draft",
    request,
  });
  if (!guarded.ok) {
    return Response.json(guarded.body, { status: guarded.status });
  }
  const inputs = guarded.payload;

  const { product, audience, platform, goal, energy, camera, style, duration } = inputs;

  if (!product?.trim() || !audience?.trim() || !platform || !goal || !duration) {
    return Response.json(
      { error: "Missing required fields: product, audience, platform, goal, duration" },
      { status: 400 }
    );
  }

  const userId = user.id;

  let brandContext = "";
  try {
    const brand = await getBrandProfile(userId);
    brandContext = getBrandSystemPrompt(brand);
  } catch { /* brand injection is optional */ }

  const cacheInput = JSON.stringify({ product, audience, platform, goal, energy, camera, style, duration });
  const cached = await checkCache(userId, "pipeline-draft", cacheInput);
  if (cached) {
    try { return Response.json({ ...JSON.parse(cached), cached: true }); } catch { /* regenerate */ }
  }

  const systemPrompt = buildMasterPrompt({
    product: product.trim(),
    audience: audience.trim(),
    platform,
    goal,
    energy: energy ?? "natural",
    camera: camera ?? "ugc",
    style: style ?? "founder",
    duration: Number(duration),
  }) + brandContext;

  const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Write the ${duration}-second ${platform} script now. Output spoken words only.`,
        },
      ],
    }),
  });

  const anthropicData = await anthropicRes.json();
  if (anthropicData.error) {
    return Response.json({ error: anthropicData.error.message }, { status: 500 });
  }

  const script = anthropicData.content?.[0]?.text ?? "";

  const scenes = buildScenePrompts(
    script,
    { energy: energy ?? null, camera: camera ?? null, style: style ?? null },
    Number(duration)
  );

  const payload = { script, scenes };
  saveCache(userId, "pipeline-draft", cacheInput, JSON.stringify(payload));
  logUsageEvent(userId, "pipeline-draft", "generate", 3, { platform, duration });

  return Response.json(payload);
}
