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

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getBrandProfile, getBrandSystemPrompt } from "@/lib/brand";
import { logUsageEvent } from "@/lib/cache";
import { withCreditState, InsufficientCreditsError } from "@/lib/credits/withCreditState";
import { CREDIT_COSTS } from "@/lib/rules/creditRules";
import { getNicheSettings, detectEra } from "@/lib/config/nicheSettings";
import Anthropic from "@anthropic-ai/sdk";
import { type StoryBeat } from "@/lib/storyboard-planner";

export const maxDuration = 120;

const SCENE_COUNT = 4; // 4 story beats → 4 visually distinct scene images


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
  "airbrushed, oversaturated, stock photo pose, studio backdrop, " +
  // Omnyra strict safety — body horror / particle artifacts / surreal
  "surreal, bizarre, horror, body horror, melting face, melting skin, " +
  "sand from mouth, blood from mouth, water from mouth, liquid from mouth, " +
  "sand from eyes, blood from eyes, liquid from eyes, tears of sand, tears of glitter, " +
  "crystals from face, glitter tears, sand tears, unnatural tears, " +
  "particles from mouth, smoke from mouth, floating debris near face, " +
  "glowing eyes, supernatural effects, magical aura, elements touching face unnaturally, " +
  "disturbing imagery, grotesque, nightmarish, unsettling anatomy";

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
  const envInclude = nicheSettings.environmentInclude || null;
  const envExclude = nicheSettings.environmentExclude || null;

  let brandSuffix = "";
  try {
    const brand = await getBrandProfile(user.id);
    const ctx = getBrandSystemPrompt(brand);
    if (ctx && brand?.style_preset) brandSuffix = `, ${brand.style_preset} visual style`;
    else if (ctx && brand?.niche) brandSuffix = `, aligned with ${brand.niche} brand aesthetic`;
  } catch { /* optional */ }

  const creditCost = CREDIT_COSTS.image_standard * 4;

  type Scene = { prompt: string; description: string; script_part: string; image_url: string; angle: string };

  // Character description: prefer explicit ref, fall back to first sentence of concept
  const characterDescription = characterRef?.trim()
    || concept.trim().split(/[.!?]/)[0].trim()
    || '';
  const eraPrefix = detectedEra ? `${detectedEra}.` : '';

  // Flux Schnell ignores negative_prompt — inject exclusions as "NO X" in positive prompt
  const envExcludeAsPositive = envExclude
    ? envExclude.split(",").map(s => `NO ${s.trim()}`).join(", ")
    : null;

  const ANTI_TEXT_SUFFIX =
    // Text suppression
    "No readable text anywhere. No visible writing. No legible words or numbers on any surface. " +
    "No text on walls, paper, books, signs, screens, clocks, or clothing. Blank surfaces only. " +
    // Camera direction
    "NO back of head. NO rear view. Subject always facing toward camera. Front-facing only. " +
    // Omnyra strict safety — photorealistic only, no horror or surreal artifacts
    "Photorealistic and beautiful. Natural expressions and emotions only. " +
    "Clean cinematic lighting. Correct human anatomy and physics. " +
    "NO surreal elements. NO body horror. NO melting faces or skin. NO horror imagery. " +
    "NO sand from mouth or eyes. NO water from mouth. NO blood from mouth or nose. NO liquid from eyes. " +
    "NO tears made of sand, glitter, or crystals — only realistic water tears if any. " +
    "NO particles from mouth. NO smoke from mouth. NO breath visible. " +
    "NO glowing eyes. NO supernatural effects. NO magical aura. NO floating debris near face. " +
    "NO elements touching face unnaturally. Clean natural face, no foreign materials on skin.";

  try {
    const result = await withCreditState<{ scenes: Scene[]; beats: StoryBeat[] }>({
      userId: user.id,
      cost: creditCost,
      run: async () => {

        // ── Step 1: Generate Flux prompts directly from script — literal, not abstract ──
        // Bypasses storyboard-planner which was abstracting away script-specific actions.
        console.log(`[SCENE_PROMPTS] generating ${SCENE_COUNT} literal prompts from script`);
        const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
        const promptGenRes = await anthropic.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 1600,
          system: `You are a visual director generating Flux Realism image prompts for an AI video.
Read the script carefully, then output EXACTLY ${SCENE_COUNT} prompts — one per distinct story beat.

SCENE STRUCTURE (follow this order):
- Scene 1 (OPENING HOOK): The very first visual moment that grabs attention. Match the script's opening.
- Scene 2 (BUILDUP): The second distinct action or emotional beat from the script.
- Scene 3 (PEAK / KEY MOMENT): The most important or dramatic moment of the script.
- Scene 4 (RESOLUTION / CLOSE): The final emotional payoff or call-to-action moment.

CRITICAL DIVERSITY RULE — each prompt MUST be visually different:
- Different shot distance per scene (e.g. wide, medium, close-up, extreme close-up)
- Different subject action per scene (e.g. standing, moving, reacting, looking)
- Different emotional expression per scene (e.g. determined, surprised, warm, proud)
- Never describe the same pose or framing twice across the 4 prompts

SCRIPT FIDELITY:
- Each prompt MUST show the EXACT action/emotion described in that part of the script
- If script says "face showing genuine strain" → close-up face, visible effort, brow furrowed
- If script says "wide shot of street" → full environment wide shot
- If script says "hands grip" → extreme close-up on hands gripping
- If script says "walking together" → two people side by side mid-shot
- NEVER replace a specific scripted moment with a generic substitute

TECHNICAL RULES:
- Subject ALWAYS faces the camera — never back of head, never rear view
- ${characterDescription ? `Character: ${characterDescription}` : "Caucasian person, realistic, natural-looking"}
- ${envInclude ? `Environment elements to include: ${envInclude}` : "Setting appropriate to the script"}
- ${envExclude ? `EXCLUDE from every scene: ${envExclude}` : ""}
- Real photographic quality, cinematic lighting, no studio backdrop
- 30-50 words per prompt — be specific and visual
- NEVER describe particles, smoke, sand, liquid, or any material coming from a person's mouth, eyes, or face
- NEVER describe glowing eyes, supernatural effects, magical aura, or body horror

OUTPUT: valid JSON only. No markdown. No explanation.
{ "prompts": ["scene1_prompt", "scene2_prompt", "scene3_prompt", "scene4_prompt"] }`,
          messages: [{
            role: "user",
            content: `Script: ${script.trim()}\n\nConcept: ${concept}${hook ? `\n\nHook: ${hook}` : ""}\n\nGenerate exactly ${SCENE_COUNT} VISUALLY DISTINCT Flux image prompts covering 4 different beats of this script. Each must show a different moment, different shot distance, and different action.`,
          }],
        });

        const promptGenText = promptGenRes.content[0]?.type === "text" ? promptGenRes.content[0].text : "";
        const pgStart = promptGenText.indexOf("{");
        const pgEnd   = promptGenText.lastIndexOf("}");
        const pgParsed = JSON.parse(promptGenText.slice(pgStart, pgEnd + 1)) as { prompts?: string[] };
        const rawPrompts: string[] = Array.isArray(pgParsed.prompts) ? pgParsed.prompts : [];
        while (rawPrompts.length < SCENE_COUNT) rawPrompts.push(`${concept} gym scene, natural light, front-facing subject`);
        const beatPrompts = rawPrompts.slice(0, SCENE_COUNT);
        const beats: StoryBeat[] = beatPrompts.map((_, i) => ({
          beatNumber: i + 1, purpose: `scene ${i + 1}`, emotion: "", bodyLanguage: "",
          composition: "", lighting: "", keyAction: beatPrompts[i], environmentFocus: "",
        }));
        console.log(`[SCENE_PROMPTS] generated ${beatPrompts.length} prompts`);
        beatPrompts.forEach((p, i) => console.log(`[SCENE_PROMPT_${i+1}] ${p.substring(0, 120)}"`));

        // ── Step 3: Generate all images in parallel via Fal ──────────────────
        // NOTE: fal-ai/flux/schnell uses flow matching and IGNORES negative_prompt.
        const imageResults: Scene[] = await Promise.all(
          beatPrompts.map(async (beatPrompt, i) => {
            const beat = beats[i];
            // Keep the final prompt focused on the beat — don't dilute with envInclude
            // (Claude already wove environment context into each beat prompt above)
            const COMPACT_SAFETY =
              "No text or writing anywhere. Subject facing camera. Photorealistic. Clean natural human anatomy. " +
              "No particles from mouth. No sand or liquid from face. No supernatural effects. No glowing eyes.";
            const finalPrompt = [
              beatPrompt,
              envExcludeAsPositive,
              COMPACT_SAFETY,
            ].filter(Boolean).join(" ");

            console.log(`[IMAGE_PROMPT_FINAL] scene=${i + 1} beat=${beat.beatNumber}: ${finalPrompt.substring(0, 220)}`);

            // Flux Dev follows prompts properly (28 steps vs Schnell's 4)
            const res = await fetch("https://fal.run/fal-ai/flux/dev", {
              method: "POST",
              headers: {
                Authorization: `Key ${falKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                prompt:                finalPrompt,
                num_images:            1,
                image_size:            { width: 1080, height: 1920 },
                num_inference_steps:   28,
                guidance_scale:        3.5,
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
              description: beat.purpose,
              script_part: beat.emotion,
              image_url:   imageUrl,
              angle:       `BEAT_${beat.beatNumber}`,
            };
          }),
        );

        return { data: { scenes: imageResults, beats } };
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
