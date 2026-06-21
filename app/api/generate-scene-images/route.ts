/**
 * POST /api/generate-scene-images
 *
 * Full pipeline: Claude generates 4 character-consistent, Ghost-Test-compliant
 * image prompts from a script+concept, then calls Fal in parallel to produce
 * all 4 images. Returns 4 image URLs with prompts + descriptions.
 *
 * Body:    { script, concept, hook?, targetAudience?, characterRef? }
 * Returns: { scenes: [{ prompt, description, script_part, image_url }] }
 * Cost:    12 credits (4 × image_standard)
 */

import Anthropic from "@anthropic-ai/sdk";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getBrandProfile, getBrandSystemPrompt } from "@/lib/brand";
import { logUsageEvent } from "@/lib/cache";
import { withCreditState, InsufficientCreditsError } from "@/lib/credits/withCreditState";
import { CREDIT_COSTS } from "@/lib/rules/creditRules";
import { getNicheSettings, detectEra } from "@/lib/config/nicheSettings";

export const maxDuration = 120;

const GHOST_TEST = `GHOST TEST RULE (NEVER BREAK):
You are a ghost floating in the room. You can see and hear everything but cannot read minds or know internal emotions directly.
- Never write "she was furious", "he felt guilty", "she was heartbroken", "he was excited", etc.
- Only describe physical actions, body language, micro-expressions, object interactions, timing, and environmental details.
- Wrong: "She was heartbroken." Right: "She set the mug down slowly, kept her eyes on the table, said nothing for a long moment."
- Apply this rule to every image prompt and scene description.`;

export async function POST(req: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const falKey = process.env.FAL_API_KEY ?? process.env.FALAI_API_KEY;
  if (!falKey) return Response.json({ error: "FAL_API_KEY not configured" }, { status: 503 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
  }

  let body: {
    script?: string;
    concept?: string;
    hook?: string;
    targetAudience?: string;
    characterRef?: string;
    niche?: string;
  };
  try { body = await req.json(); }
  catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { script, concept, hook, targetAudience, characterRef, niche } = body;
  if (!script?.trim()) return Response.json({ error: "script is required" }, { status: 400 });
  if (!concept?.trim()) return Response.json({ error: "concept is required" }, { status: 400 });

  const nicheSettings = getNicheSettings(niche);
  console.log(`[NICHE_RECEIVED] niche="${niche ?? "default"}" imagePrefix="${nicheSettings.imagePromptPrefix.substring(0, 60)}"`);

  let detectedEra: string | null = null;
  if (nicheSettings.eraDetection) {
    const eraSearchText = `${script} ${concept ?? ""}`;
    detectedEra = detectEra(eraSearchText);
    if (detectedEra) console.log(`[ERA_DETECTED] era="${detectedEra}" niche="${niche ?? "default"}"`);
  }

  let brandSuffix = "";
  try {
    const brand = await getBrandProfile(user.id);
    const ctx = getBrandSystemPrompt(brand);
    if (ctx && brand?.style_preset) brandSuffix = `, ${brand.style_preset} visual style`;
    else if (ctx && brand?.niche) brandSuffix = `, aligned with ${brand.niche} brand aesthetic`;
  } catch { /* optional */ }

  const creditCost = CREDIT_COSTS.image_standard * 4;

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  type Scene = { prompt: string; description: string; script_part: string; image_url: string };

  try {
    const result = await withCreditState<{ scenes: Scene[] }>({
      userId: user.id,
      cost: creditCost,
      run: async () => {
        // ── Step 1: Claude generates 4 character-consistent image prompts ─────
        const nicheDirective = [
          nicheSettings.imagePromptPrefix ? `NICHE VISUAL STYLE: ${nicheSettings.imagePromptPrefix}` : null,
          nicheSettings.cinemaStyle       ? `CINEMA STYLE: ${nicheSettings.cinemaStyle}` : null,
          detectedEra                     ? `ERA: This scene is set in ${detectedEra}. Every prop, costume, and environment must be period-accurate. No modern objects.` : null,
          nicheSettings.negativePrompt    ? `AVOID IN ALL PROMPTS: ${nicheSettings.negativePrompt}` : null,
        ].filter(Boolean).join("\n");

        const planningMsg = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 2000,
          system: `You are a cinematic still photographer and continuity director for short-form video ads. You are also a ghost — you can see everything in the scene but cannot read minds.

${GHOST_TEST}

Your task: Create 4 photorealistic, cinema-grade scene image prompts that tell a coherent visual story from the provided script.

STRICT RULES:
1. Character consistency: Define ONE character in the first prompt and copy that exact description (face, age, ethnicity, hairstyle, clothing, body type, posture energy) verbatim into all 4 prompts. Never deviate.
2. Visual consistency: Same lighting style, color grade, and mood across all 4 prompts.
3. Ghost Test: Describe only visible physical behavior — body posture, hand position, eye direction, micro-expressions, how they hold or move objects. Never name the emotion.
4. Text overlays: If a scene requires on-screen text, describe it in the "description" field only. Do NOT include unrenderable text in the image prompt itself.
5. Composition: Cinematic framing, depth of field, professional natural lighting, high detail, photorealistic — no cartoon or AI artifacts.${brandSuffix ? `\n6. Brand style: ${brandSuffix}` : ""}${nicheDirective ? `\n\n${nicheDirective}` : ""}

Return ONLY valid JSON — no markdown, no backticks, no explanation. Exactly this structure:
[
  {
    "prompt": "Full Flux-ready image generation prompt (include character description every time)",
    "description": "One sentence: what the ghost observes in this frame — physical action only",
    "script_part": "Which moment of the script this covers (e.g. 'Opening hook — 0–3s')"
  }
]
Return exactly 4 objects.`,
          messages: [{
            role: "user",
            content: `Script:\n${script.trim()}\n\nConcept: ${concept}\nHook: ${hook ?? "(not provided)"}\nTarget Audience: ${targetAudience ?? "general"}${characterRef ? `\n\nCharacter Reference (use exactly): ${characterRef}` : ""}`,
          }],
        });

        const raw = planningMsg.content[0].type === "text" ? planningMsg.content[0].text : "[]";
        const start = raw.indexOf("[");
        const end = raw.lastIndexOf("]");
        if (start === -1 || end === -1) {
          throw new Error("Claude did not return a valid JSON array for scene prompts");
        }

        const scenePlan = JSON.parse(raw.slice(start, end + 1)) as Array<{
          prompt: string;
          description: string;
          script_part: string;
        }>;

        if (!Array.isArray(scenePlan) || scenePlan.length < 4) {
          throw new Error(`Expected 4 scene prompts from Claude, got ${Array.isArray(scenePlan) ? scenePlan.length : "invalid response"}`);
        }

        // ── Step 2: Generate all 4 images in parallel via Fal ────────────────
        const imageResults: Scene[] = await Promise.all(
          scenePlan.slice(0, 4).map(async (scene, i) => {
            console.log(`[IMAGE_PROMPT_FINAL] scene=${i + 1}: ${scene.prompt.substring(0, 200)}`);
            const res = await fetch("https://fal.run/fal-ai/flux/schnell", {
              method: "POST",
              headers: {
                Authorization: `Key ${falKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                prompt: scene.prompt,
                num_images: 1,
                image_size: { width: 1080, height: 1920 },
                num_inference_steps: 4,
                enable_safety_checker: true,
              }),
            });

            if (!res.ok) {
              const errText = await res.text();
              console.error("[generate-scene-images] fal error:", errText.substring(0, 200));
              throw new Error("Fal image generation failed for one or more scenes");
            }

            const data = await res.json() as { images?: { url: string }[] };
            const imageUrl = data.images?.[0]?.url;
            if (!imageUrl) throw new Error("Fal returned no image URL for scene");

            return {
              prompt: scene.prompt,
              description: scene.description,
              script_part: scene.script_part,
              image_url: imageUrl,
            };
          }),
        );

        return { data: { scenes: imageResults } };
      },
    });

    logUsageEvent(user.id, "generate-scene-images", "generate", creditCost, { concept });

    return Response.json(result);

  } catch (err) {
    if (err instanceof InsufficientCreditsError) {
      return Response.json({
        error: "INSUFFICIENT_CREDITS",
        balance: err.balance,
        required: err.cost,
        planType: err.planType,
      }, { status: 402 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generate-scene-images]", msg);
    return Response.json({ error: msg || "Scene image generation failed" }, { status: 500 });
  }
}
