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

// ── 4 camera angles of the EXACT SAME moment ─────────────────────────────────
// These are NOT a storyboard. NOT different scenes. NOT a sequence across time.
// They are 4 cinematographers shooting the SAME frozen instant from 4 positions.

const ANGLE_RULES = {
  FRONT_DIRECT:
    `SHOT 1 — DIRECT FRONT (eye-level): Camera directly facing the subject at eye level. ` +
    `Subject faces the camera with a contemplative, forward-looking expression. ` +
    `Face and upper body centred in frame. Hands visible resting on knees or lap. ` +
    `Shallow depth of field — background slightly blurred but recognisable. ` +
    `This is the PRIMARY establishing shot — character looks directly into the lens.`,

  SIDE_THREE_QUARTER:
    `SHOT 2 — 3/4 SIDE ANGLE (from right): Camera positioned 45° to the right of the subject. ` +
    `Subject's face is in 3/4 profile — right side lit, left side in shadow. ` +
    `Dramatic Rembrandt-style side lighting — one strong light source from the right. ` +
    `Strong shadow on the left cheek and neck. Background in soft focus. ` +
    `Same subject, same posture, same moment — only the camera angle has changed.`,

  WIDE_LOW:
    `SHOT 3 — WIDE LOW ANGLE (environment): Camera set low (near floor level), angled slightly upward. ` +
    `Full figure visible from head to feet. Full environment visible — ceiling, walls, floor, all background props. ` +
    `Subject occupies the lower-centre of frame, environment dominates. ` +
    `Same subject, same exact posture and expression — this shot reveals WHERE they are, not just WHO.`,

  CLOSE_INTIMATE:
    `SHOT 4 — TIGHT CLOSE-UP (face and upper body): Camera very close. ` +
    `Face fills 60-70% of frame. Upper chest and shoulders just visible at bottom. ` +
    `Extreme shallow depth of field — background is fully blurred bokeh. ` +
    `Every skin texture, eye detail, jaw tension, and micro-expression is visible. ` +
    `Same subject, same moment — maximum emotional proximity.`,
};

const SCENE_ANGLES = ["FRONT_DIRECT", "SIDE_THREE_QUARTER", "WIDE_LOW", "CLOSE_INTIMATE"] as const;
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
            ? `ERA: This scene is set in ${detectedEra}. Every prop, costume, and environment must be period-accurate. No modern objects, no modern lighting, no synthetic materials.\nLIGHTING LAW: Use ONLY warm period sources — oil lamp, candle, bare incandescent bulb, or natural window light. NO fluorescent, NO cyan/blue/teal/neon light, NO cool-toned lighting of any kind.\nWWII/1940s MILITARY (if applicable): M1 steel round helmet (no modern attachments), olive drab wool uniform, leather boots, canvas webbing, metal dog tags. NOT kevlar, NOT body armor, NOT tactical gear, NOT chrome equipment.`
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
        const systemPrompt = `You are a cinematographer directing 4 camera operators to shoot the EXACT SAME FROZEN MOMENT from 4 different positions simultaneously.

${GHOST_TEST}

YOUR TASK: Write 4 Flux image generation prompts — one per camera angle. All 4 prompts describe THE SAME INSTANT IN TIME. Same character, same posture, same expression, same environment, same lighting. ONLY the camera position changes.

THIS IS NOT A STORYBOARD. THIS IS NOT A SEQUENCE. THIS IS NOT DIFFERENT MOMENTS.
Four cameras. One moment. Four angles.

═══ STRICT RULES ═══

RULE 1 — IDENTICAL CHARACTER ACROSS ALL 4 SHOTS:
Define the character ONCE in Shot 1 with full precision: exact age in years, skin tone, hair colour and length, eye colour, exact clothing with fabric and colour, body build, posture, hands position.
Copy this EXACT character description word-for-word into Shots 2, 3, and 4. Zero variation.
AGE ANCHOR: Soldiers and warriors are YOUNG ADULTS, 19–22 years old. Write "young adult male, approximately 19–22 years old, fair skin, short light brown hair" — never a child, never middle-aged.

RULE 2 — IDENTICAL MOMENT ACROSS ALL 4 SHOTS:
The subject's body, posture, expression, and hand position must be the same in all 4 shots.
If he is sitting with hands on knees in Shot 1 — he is sitting with hands on knees in Shot 2, 3, and 4.
Only the CAMERA ANGLE changes. Nothing else.

RULE 3 — NO TEXT ON ANY IMAGE:
Never describe readable text, writing, or inscriptions on any surface.
Paper = "blank paper". Letters = "folded paper". Signs = "turned away or illegible".

RULE 4 — NO FLOATING OBJECTS:
Every prop is held in hands, worn by the character, or resting on a surface. Nothing floats.

RULE 5 — CAMERA ANGLES (MANDATORY — DO NOT DEVIATE):
${angleBlock}

RULE 6 — IDENTICAL LIGHTING:
Same light source, same direction, same colour temperature in every shot.
If the light is a single bare incandescent bulb from above-left in Shot 1 — it is identical in Shots 2, 3, 4.

RULE 7 — GHOST TEST:
Describe only visible physical behaviour. Never name an emotion.${brandSuffix ? `\n\nBRAND STYLE: ${brandSuffix}` : ""}${nicheDirective ? `\n\n${nicheDirective}` : ""}

═══ OUTPUT FORMAT ═══
Return ONLY valid JSON — no markdown, no backticks, no explanation:
[
  {
    "angle": "FRONT_DIRECT",
    "prompt": "Full Flux-ready prompt — character description + camera angle + lighting + environment. All in one dense paragraph.",
    "description": "One sentence: what the ghost observes in this frame",
    "script_part": "The single moment being captured (same text in all 4)"
  }
]
Return exactly 4 objects in this order: FRONT_DIRECT, SIDE_THREE_QUARTER, WIDE_LOW, CLOSE_INTIMATE.`;

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

        // ── Generate all 4 images in parallel via Fal ─────────────────────────
        // NOTE: fal-ai/flux/schnell uses flow matching and IGNORES negative_prompt.
        // Anti-text and angle constraints are injected directly into the positive prompt.
        const ANTI_TEXT_SUFFIX =
          "No readable text anywhere. No visible writing. No legible words or numbers on any surface. " +
          "No text on walls, paper, books, signs, screens, clocks, or clothing. " +
          "No clock face with numbers. No newspaper text. No letters. Blank surfaces only.";

        const imageResults: Scene[] = await Promise.all(
          scenePlan.slice(0, 4).map(async (scene, i) => {
            const angle = (scene.angle ?? SCENE_ANGLES[i]) as SceneAngle;

            // Compose positive prompt: scene + anti-text + angle reminder
            const finalPrompt = [
              scene.prompt,
              ANTI_TEXT_SUFFIX,
            ].join(" ");

            console.log(`[IMAGE_PROMPT_FINAL] scene=${i + 1} angle=${angle}: ${finalPrompt.substring(0, 220)}`);

            const res = await fetch("https://fal.run/fal-ai/flux/schnell", {
              method: "POST",
              headers: {
                Authorization: `Key ${falKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                prompt:                finalPrompt,
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
              prompt:      finalPrompt,
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
