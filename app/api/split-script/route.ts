import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getBrandProfile, getBrandSystemPrompt } from "@/lib/brand";
import { logUsageEvent } from "@/lib/cache";

// ── Types ─────────────────────────────────────────────────────────────────────

export type SceneType =
  | "talking_head"
  | "emotional"
  | "educational"
  | "lifestyle_broll"
  | "product_demo"
  | "transition"
  | "background"
  | "cta"
  | "quote";

export interface SplitScene {
  id:           number;
  text:         string;
  type:         SceneType;
  visual_prompt: string;
}

export interface SplitScriptResult {
  scenes:   SplitScene[];
  segments: SplitScene[]; // compat alias
}

const VALID_TYPES = new Set<string>([
  "talking_head", "emotional", "educational", "lifestyle_broll",
  "product_demo", "transition", "background", "cta", "quote",
]);

// ── Safe parser — NEVER throws ────────────────────────────────────────────────

function safeParseSplitScript(input: string): { scenes?: unknown[]; error?: string; raw?: unknown } {
  try {
    const cleaned = input
      .replace(/^```json\s*/m, "")
      .replace(/^```\s*/m, "")
      .replace(/\s*```\s*$/m, "")
      .trim();

    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return { error: "NO_JSON_FOUND", raw: input };

    const parsed = JSON.parse(match[0]) as Record<string, unknown>;

    if (!parsed.scenes || !Array.isArray(parsed.scenes)) {
      return { error: "INVALID_SCHEMA", raw: parsed };
    }

    return { scenes: parsed.scenes as unknown[] };
  } catch (err) {
    return {
      error: "PARSE_FAILURE",
      raw: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Self-healing repair — always returns a usable result ──────────────────────

function repairSplitScript(
  result: ReturnType<typeof safeParseSplitScript>,
  script: string,
  numSegments: number,
): SplitScene[] {
  if (result.error) {
    console.error("[SPLIT_SCRIPT_ERROR]", { error: result.error, raw: result.raw });
  }

  if (result.scenes && Array.isArray(result.scenes) && result.scenes.length > 0) {
    return (result.scenes as unknown[]).map((s: unknown, i: number) => {
      const raw = (s ?? {}) as Record<string, unknown>;
      const type = VALID_TYPES.has(String(raw.type ?? "")) ? raw.type as SceneType : "lifestyle_broll";
      return {
        id:           i + 1,
        text:         String(raw.text ?? ""),
        type,
        visual_prompt: String(raw.visual_prompt ?? raw.text ?? ""),
      };
    });
  }

  // Fallback: split the script evenly across N scenes
  console.warn(`[SPLIT_SCRIPT_REPAIR] producing ${numSegments} fallback scenes from raw script`);
  const words   = script.split(/\s+/);
  const perScene = Math.ceil(words.length / numSegments);
  return Array.from({ length: numSegments }, (_, i): SplitScene => ({
    id:            i + 1,
    text:          words.slice(i * perScene, (i + 1) * perScene).join(" "),
    type:          "lifestyle_broll",
    visual_prompt: words.slice(i * perScene, (i + 1) * perScene).join(" ").substring(0, 200),
  }));
}

// ── Route ─────────────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY missing" }, { status: 500 });
  }

  const { script, hook, num_segments: rawSegments, niche } = await req.json();

  if (!script || !rawSegments) {
    return Response.json({ error: "script and num_segments required" }, { status: 400 });
  }
  const num_segments = Math.min(10, Math.max(1, Number(rawSegments)));

  let brandContext = "";
  let userId: string | null = null;
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      userId = user.id;
      const brand = await getBrandProfile(user.id);
      brandContext = getBrandSystemPrompt(brand);
    }
  } catch { /* brand injection is optional */ }

  // ── System prompt: strict JSON mode ──────────────────────────────────────────

  const systemPrompt = `You are a script segmentation engine for AI video generation.${brandContext}

OUTPUT RULE — CRITICAL: Return ONLY valid JSON. Do NOT use markdown, backticks, code fences, labels, or any text outside the JSON object.

SCENE TYPE RULES — set "type" using best inference:
  talking_head   — presenter speaking to camera, natural head/body movement
  emotional      — embrace, reaction, tears, celebration, high-impact moment
  educational    — concept visualised, diagram, demonstration, tutorial
  lifestyle_broll — people in motion, walking, laughing, dancing, cooking, working
  product_demo   — product being used, handled, demonstrated
  transition     — motion blur, time-lapse, visual cut
  background     — atmospheric environment with no main subject
  cta            — call-to-action with energetic background
  quote          — inspirational text overlay

If unsure: use "lifestyle_broll". NEVER output null, undefined, unknown, or empty string for type.

VISUAL PROMPT RULES — every scene needs a candid photographic motion description:
  - 20–30 words
  - Must include: human action + environmental motion + camera movement
  - Bad: "A person stands at a desk."
  - Good: "A creator leans forward at a standing desk, gesturing confidently. Natural window light shifts. Camera slowly pushes in from medium to close."

IMAGE STYLE RULES — CRITICAL:
  - All images must look like real photographs taken by a human photographer
  - Style: candid photography, natural lighting, shot on iPhone or DSLR
  - NO studio lighting, NO perfect symmetry, NO AI-rendered skin texture
  - NO hyper-realistic portraits, NO fitness model aesthetics unless explicitly requested
  - People must look like ordinary real humans — imperfect, natural, authentic
  - Every visual_prompt MUST include: "candid photo, natural light" or "shot on iPhone" or "documentary style"
  - NEVER describe a person as chiseled, athletic build, perfect, or glowing skin
  - End every visual_prompt with: "35mm candid photography, natural light, authentic, unposed"

HARD CONSTRAINTS:
  Output MUST be parseable by JSON.parse()
  Double quotes only. No trailing commas. No comments. No markdown wrapping.

FAILURE CONDITION: If you cannot comply, output exactly: {"error":"invalid_input"}`;

  // ── User prompt ───────────────────────────────────────────────────────────────

  const userPrompt = `Split this script into exactly ${num_segments} scenes for AI video generation.

Script: ${script}
Hook: ${hook ?? "(none)"}
Niche: ${niche ?? "general"}

Return this exact JSON structure. The first character MUST be { and the last MUST be }:

{
  "scenes": [
    {
      "id": 1,
      "text": "exact script words for this scene",
      "type": "lifestyle_broll",
      "visual_prompt": "20-30 word cinematic motion description with human action + environment + camera"
    }
  ]
}`;

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    const response = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 1800,
      system:     systemPrompt,
      messages:   [{ role: "user", content: userPrompt }],
    });

    const raw = response.content[0]?.type === "text" ? response.content[0].text : "";
    if (!raw) return Response.json({ error: "Empty response from model" }, { status: 500 });

    const parsed  = safeParseSplitScript(raw);
    const scenes  = repairSplitScript(parsed, script, num_segments);

    if (userId) {
      logUsageEvent(userId, "split-script", "generate", 1, { num_segments, niche });
    }

    const result: SplitScriptResult = { scenes, segments: scenes };
    return Response.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[split-script] error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}
