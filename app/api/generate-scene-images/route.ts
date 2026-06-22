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
import { analyzeScriptBeats, beatToImagePrompt, type StoryBeat } from "@/lib/storyboard-planner";

export const maxDuration = 120;

const SCENE_COUNT = 4; // 4 story beats → 4 images


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
    "No readable text anywhere. No visible writing. No legible words or numbers on any surface. " +
    "No text on walls, paper, books, signs, screens, clocks, or clothing. " +
    "No clock face with numbers. No newspaper text. No letters. Blank surfaces only.";

  try {
    const result = await withCreditState<{ scenes: Scene[]; beats: StoryBeat[] }>({
      userId: user.id,
      cost: creditCost,
      run: async () => {

        // ── Step 1: Storyboard planner — analyze script into emotional beats ──
        console.log(`[STORYBOARD] analyzing script into ${SCENE_COUNT} beats niche="${niche ?? "default"}"`);
        const beats = await analyzeScriptBeats(
          `${script.trim()}\n\nConcept: ${concept}\nHook: ${hook ?? ""}`.trim(),
          SCENE_COUNT,
          nicheSettings,
        );

        // ── Step 2: Build Flux prompts from beats ─────────────────────────────
        const beatPrompts = beats.map(beat =>
          beatToImagePrompt(beat, characterDescription, eraPrefix, nicheSettings)
        );

        // ── Step 3: Generate all images in parallel via Fal ──────────────────
        // NOTE: fal-ai/flux/schnell uses flow matching and IGNORES negative_prompt.
        const imageResults: Scene[] = await Promise.all(
          beatPrompts.map(async (beatPrompt, i) => {
            const beat = beats[i];
            const finalPrompt = [
              beatPrompt,
              envInclude ? envInclude + "." : null,
              envExcludeAsPositive,
              ANTI_TEXT_SUFFIX,
            ].filter(Boolean).join(" ");

            console.log(`[IMAGE_PROMPT_FINAL] scene=${i + 1} beat=${beat.beatNumber}: ${finalPrompt.substring(0, 220)}`);

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
