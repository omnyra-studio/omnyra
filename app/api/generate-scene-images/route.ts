/**
 * POST /api/generate-scene-images
 *
 * Full pipeline: Claude generates 4 angle-locked, character-consistent image prompts
 * from a script+concept, then calls Fal/Flux in parallel to produce all 4 images.
 *
 * Body:    { script, concept, hook?, targetAudience?, characterRef?, niche? }
 * Returns: { scenes: [{ prompt, description, script_part, image_url, angle }] }
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

// ── Ghost Test — never name internal emotions ─────────────────────────────────

const GHOST_TEST = `GHOST TEST RULE (NEVER BREAK):
You are a ghost floating in the room. You can see and hear everything but cannot read minds.
- Never write "she was furious", "he felt guilty", "she was heartbroken", "he was excited", etc.
- Only describe physical actions, body language, micro-expressions, object interactions, timing, and environmental details.
- Wrong: "She was heartbroken." Right: "She set the mug down slowly, kept her eyes on the table, said nothing for a long moment."
- Apply this rule to every image prompt and scene description.`;

// ── Strict angle composition rules ────────────────────────────────────────────

const ANGLE_RULES = {
  WIDE:
    `WIDE shot: Full environment visible. Character occupies less than 40% of frame — background is the star. ` +
    `Show the full room or outdoor setting. Character seated or standing, full body visible from head to feet. ` +
    `NO close-ups. NO objects dominating frame. NO face detail (face too small to read). ` +
    `Camera is far back. This shot establishes place, not person.`,

  CLOSE:
    `CLOSE shot: Face fills 80% of frame, cropped from forehead to chin. ` +
    `ONLY the face — expression, eyes, jaw line, skin texture. Background completely blurred (extreme bokeh). ` +
    `ABSOLUTELY NO hands in frame. NO objects. NO pen. NO paper. NO cup. NO items near the face or mouth. ` +
    `This is a pure face portrait — nothing else exists in this shot.`,

  DETAIL:
    `DETAIL shot: Hands and ONE object fill the entire frame — NO face visible (face must be cropped out or off-screen). ` +
    `Camera is close to the hands. Show: hands gripping a pen pressing ON paper surface, OR hands folded flat on table, ` +
    `OR fingers pressing flat on a surface. The object MUST be physically touching the hands or resting on a surface. ` +
    `Camera angle is top-down (90°) or 45 degrees. Nothing floats. No faces.`,

  OVER_SHOULDER:
    `OVER SHOULDER shot: Camera positioned directly behind the character's head and shoulder. ` +
    `We see: the back of their head and neck (in soft focus foreground), their shoulder occupying left or right third of frame, ` +
    `and what is directly in front of them (table, window, room, view) in sharp focus in the background. ` +
    `NO face visible — camera is behind them. Character's body is a silhouette/foreground element, not the subject.`,
};

const SCENE_ANGLES = ["WIDE", "CLOSE", "DETAIL", "OVER_SHOULDER"] as const;
type SceneAngle = typeof SCENE_ANGLES[number];

// ── Strong negative prompt for Flux ──────────────────────────────────────────

const FLUX_NEGATIVE_BASE =
  // Text / typography
  "text, words, letters, writing, handwriting, typography, readable text, legible text, " +
  "captions, watermarks, signs, inscriptions, printed text, cursive, font, alphabet, " +
  "numbers on paper, written words, newspaper text, book text, label text, " +
  // Floating / physics violations
  "floating objects, levitating, objects near face without hands touching them, " +
  "pen near mouth, pen floating, paper floating, cup floating near face, " +
  "object suspended in air, disconnected objects, " +
  // Anatomy artifacts
  "extra limbs, extra fingers, extra arms, mutated hands, deformed hands, " +
  "fused fingers, too many fingers, missing fingers, bad anatomy, extra legs, " +
  "malformed limbs, three hands, two left hands, overlapping limbs, merged torsos, " +
  // Quality
  "blurry, low quality, watermark, logo, signature, cartoon, anime, CGI, " +
  "airbrushed, oversaturated, stock photo pose, studio backdrop";

// ── POST handler ──────────────────────────────────────────────────────────────

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

  type Scene = { prompt: string; description: string; script_part: string; image_url: string; angle: string };

  try {
    const result = await withCreditState<{ scenes: Scene[] }>({
      userId: user.id,
      cost: creditCost,
      run: async () => {

        // ── Build niche + era directives for Claude ───────────────────────────
        const nicheDirective = [
          nicheSettings.imagePromptPrefix ? `NICHE VISUAL STYLE: ${nicheSettings.imagePromptPrefix}` : null,
          nicheSettings.cinemaStyle       ? `CINEMA STYLE: ${nicheSettings.cinemaStyle}` : null,
          detectedEra
            ? `ERA: This scene is set in ${detectedEra}. Every prop, costume, and environment must be period-accurate. No modern objects, no modern lighting, no synthetic materials.`
            : null,
          nicheSettings.negativePrompt
            ? `AVOID IN ALL PROMPTS: ${nicheSettings.negativePrompt}`
            : null,
        ].filter(Boolean).join("\n");

        // ── Build per-angle instruction block ─────────────────────────────────
        const angleBlock = SCENE_ANGLES.map((angle, i) =>
          `Scene ${i + 1} angle — ${angle}:\n${ANGLE_RULES[angle]}`
        ).join("\n\n");

        // ── Claude system prompt ──────────────────────────────────────────────
        const systemPrompt = `You are a cinematic still photographer and continuity director for short-form video content. You are also a ghost — you can see everything in the scene but cannot read minds.

${GHOST_TEST}

Your task: Create exactly 4 photorealistic, cinema-grade image prompts that tell a coherent visual story from the provided script. Each prompt uses a FIXED camera angle — follow the angle rules below without deviation.

═══ STRICT RULES ═══

RULE 1 — CHARACTER CONSISTENCY:
Define ONE character in Scene 1 with a precise description: face shape, age in years, skin tone, hair colour and length, eye colour, exact clothing with fabric and colour, body build, posture energy.
Copy this EXACT character description verbatim into Scenes 2, 3, and 4. Never change any detail.
AGE ANCHOR: If the script describes a soldier, warrior, or young person — they are a YOUNG ADULT, 18–22 years old. Write "young adult male, approximately 18–20 years old" — NOT a child, NOT middle-aged, NOT elderly.

RULE 2 — NO TEXT ON ANY IMAGE:
NEVER describe readable text, visible writing, legible words, or inscriptions on any surface.
- Paper is always "blank paper" or "paper with faint ink marks, text not legible".
- Letters are "folded paper" or "paper pressed flat on table" — NEVER "handwritten letter" or "letter with writing".
- Books are "closed book" or "open book with illegible pages" — NEVER show readable words.
- Signs, labels, newspapers — always illegible, blurred, or turned away.

RULE 3 — NO FLOATING OBJECTS:
Every object must be physically held in hands, resting on a surface, or worn by the character.
- A pen is gripped in fingers pressing on paper — NEVER floating near a face or mouth.
- A cup is held in both hands or sitting on a table — NEVER floating.
- Objects near faces only if the character is actively eating or drinking, with hands visible.

RULE 4 — ANGLE COMPOSITIONS (MANDATORY — DO NOT DEVIATE):
${angleBlock}

RULE 5 — VISUAL CONSISTENCY:
Same lighting style, colour grade, and mood across all 4 prompts. Same time of day. Same room/location for interior scenes.

RULE 6 — GHOST TEST:
Describe only visible physical behaviour — body posture, hand position, eye direction, micro-expressions, object interactions. Never name an emotion.${brandSuffix ? `\n\nBRAND STYLE: ${brandSuffix}` : ""}${nicheDirective ? `\n\n${nicheDirective}` : ""}

═══ OUTPUT FORMAT ═══
Return ONLY valid JSON — no markdown, no backticks, no explanation. Exactly this structure:
[
  {
    "angle": "WIDE",
    "prompt": "Full Flux-ready image generation prompt — include character description, angle composition, lighting, environment",
    "description": "One sentence: what the ghost observes in this frame — physical action only",
    "script_part": "Which moment of the script this covers (e.g. 'Opening hook — 0–3s')"
  }
]
Return exactly 4 objects, one per angle in this order: WIDE, CLOSE, DETAIL, OVER_SHOULDER.`;

        console.log(`[CLAUDE_SYSTEM_PROMPT] length=${systemPrompt.length} angles=${SCENE_ANGLES.join(",")}`);

        const planningMsg = await anthropic.messages.create({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 2400,
          system: systemPrompt,
          messages: [{
            role: "user",
            content: `Script:\n${script.trim()}\n\nConcept: ${concept}\nHook: ${hook ?? "(not provided)"}\nTarget Audience: ${targetAudience ?? "general"}${characterRef ? `\n\nCharacter Reference (copy exactly into all 4 prompts): ${characterRef}` : ""}`,
          }],
        });

        const raw = planningMsg.content[0].type === "text" ? planningMsg.content[0].text : "[]";
        const start = raw.indexOf("[");
        const end = raw.lastIndexOf("]");
        if (start === -1 || end === -1) {
          throw new Error("Claude did not return a valid JSON array for scene prompts");
        }

        const scenePlan = JSON.parse(raw.slice(start, end + 1)) as Array<{
          angle: string;
          prompt: string;
          description: string;
          script_part: string;
        }>;

        if (!Array.isArray(scenePlan) || scenePlan.length < 4) {
          throw new Error(`Expected 4 scene prompts from Claude, got ${Array.isArray(scenePlan) ? scenePlan.length : "invalid response"}`);
        }

        // ── Build per-scene negative prompt ───────────────────────────────────
        // Each angle gets extra angle-specific negatives stacked on the base
        const angleNegatives: Record<SceneAngle, string> = {
          WIDE:           "close-up face, portrait, macro, hands in foreground, objects dominating frame",
          CLOSE:          "hands, objects, pen, paper, cup, food, full body, wide shot, environment, text",
          DETAIL:         "face, portrait, full body, wide shot, floating objects, text on paper",
          OVER_SHOULDER:  "face visible, front-facing portrait, floating objects, text",
        };

        // ── Generate all 4 images in parallel via Fal ─────────────────────────
        const imageResults: Scene[] = await Promise.all(
          scenePlan.slice(0, 4).map(async (scene, i) => {
            const angle = (scene.angle ?? SCENE_ANGLES[i]) as SceneAngle;
            const angleNeg = angleNegatives[angle] ?? "";
            const nicheNeg = nicheSettings.negativePrompt ?? "";
            const negativePrompt = [FLUX_NEGATIVE_BASE, angleNeg, nicheNeg]
              .filter(Boolean)
              .join(", ");

            console.log(`[IMAGE_PROMPT_FINAL] scene=${i + 1} angle=${angle}: ${scene.prompt.substring(0, 200)}`);
            console.log(`[IMAGE_NEG_PROMPT] scene=${i + 1}: ${negativePrompt.substring(0, 120)}`);

            const res = await fetch("https://fal.run/fal-ai/flux/schnell", {
              method: "POST",
              headers: {
                Authorization: `Key ${falKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                prompt:                scene.prompt,
                negative_prompt:       negativePrompt,
                num_images:            1,
                image_size:            { width: 1080, height: 1920 },
                num_inference_steps:   8,
                enable_safety_checker: true,
              }),
            });

            if (!res.ok) {
              const errText = await res.text();
              console.error(`[generate-scene-images] fal error scene=${i + 1}:`, errText.substring(0, 200));
              throw new Error("Fal image generation failed for one or more scenes");
            }

            const data = await res.json() as { images?: { url: string }[] };
            const imageUrl = data.images?.[0]?.url;
            if (!imageUrl) throw new Error("Fal returned no image URL for scene");

            return {
              prompt:      scene.prompt,
              description: scene.description,
              script_part: scene.script_part,
              image_url:   imageUrl,
              angle,
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
        error:     "INSUFFICIENT_CREDITS",
        balance:   err.balance,
        required:  err.cost,
        planType:  err.planType,
      }, { status: 402 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generate-scene-images]", msg);
    return Response.json({ error: msg || "Scene image generation failed" }, { status: 500 });
  }
}
