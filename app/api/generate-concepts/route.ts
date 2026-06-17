import Anthropic from '@anthropic-ai/sdk';
import { cleanEnv } from '@/lib/supabase/admin';

const anthropic = new Anthropic({ apiKey: cleanEnv(process.env.ANTHROPIC_API_KEY) });

async function generateConceptImage(
  description: string,
  falKey: string,
  stylePrefix: string,
  ratioPrompt: string,
  negativeStyle: string,
  imageSize: { width: number; height: number },
  inferenceSteps: number,
): Promise<string> {
  // Style prefix leads the prompt so FLUX weights it highest
  const fullPrompt = `${stylePrefix}, ${description}, ${ratioPrompt}, natural dramatic lighting, sharp focus, high detail, cinematic color grade`;
  try {
    const res = await fetch('https://fal.run/fal-ai/flux/schnell', {
      method:  'POST',
      headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        prompt:                fullPrompt,
        negative_prompt:       negativeStyle,
        num_images:            1,
        image_size:            imageSize,
        num_inference_steps:   inferenceSteps,
        enable_safety_checker: true,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error('[generate-concepts] fal image error:', errText.substring(0, 300));
      return '';
    }
    const data = await res.json() as { images?: { url: string }[] };
    return data.images?.[0]?.url ?? '';
  } catch (err) {
    console.error('[generate-concepts] image gen failed:', (err as Error).message);
    return '';
  }
}

export async function POST(req: Request) {
  const { prompt, characterBrief = '', toolId, nichePrefill = '', visualStyle = 'Lifestyle', aspectRatio = '9:16', quality = 'fast' } = await req.json();

  if (!prompt?.trim()) {
    return Response.json({ error: 'prompt required' }, { status: 400 });
  }

  const falKey = process.env.FAL_API_KEY ?? process.env.FALAI_API_KEY;
  if (!falKey) {
    console.error('[generate-concepts] FAL_API_KEY not configured');
    return Response.json({ error: 'Image generation not configured' }, { status: 503 });
  }

  // Style context passed to Claude so descriptions match the visual register
  const styleContext =
    visualStyle === 'Avatar Scene' ? 'talking-head portrait: subject faces camera directly, studio or clean background, upper-body framing only' :
    visualStyle === 'UGC'          ? 'UGC / user-generated style: handheld candid feel, everyday real-world environment, authentic imperfect framing' :
    visualStyle === 'Product'      ? 'product-focused: object or product is hero, clean studio or lifestyle context background, commercial photography' :
    visualStyle === 'Thumbnail'    ? 'YouTube thumbnail style: bold foreground subject with high-contrast background, dramatic expression, eye-catching framing' :
                                     'cinematic lifestyle: wide or medium environmental shot, subject shown in their real-world setting doing something, NOT a portrait or headshot';

  // FLUX prompt prefix — leads the prompt for highest model weight
  const stylePrefix =
    visualStyle === 'Avatar Scene' ? 'professional talking head portrait, studio lighting, direct eye contact, clean background' :
    visualStyle === 'UGC'          ? 'authentic UGC style, handheld camera, real environment, candid moment, natural lighting' :
    visualStyle === 'Product'      ? 'commercial product photography, clean background, sharp product detail, studio quality' :
    visualStyle === 'Thumbnail'    ? 'YouTube thumbnail, high contrast, bold composition, dramatic expression, eye-catching colors' :
                                     'cinematic lifestyle photography, environmental wide shot, golden hour, person in real setting, NOT a portrait';

  // Negative prompt to prevent wrong style bleeding
  // Base negative — block explicit content only; swimwear/bikini allowed (Hedra rejects those at their end regardless)
  const baseNegative = 'nudity, topless, lingerie, explicit sexual content, nsfw';
  const negativeStyle =
    visualStyle === 'Lifestyle' ? `${baseNegative}, portrait, headshot, talking head, studio background, direct camera stare, mugshot` :
    visualStyle === 'UGC'       ? `${baseNegative}, studio lighting, professional photography, clean background` :
                                  baseNegative;

  const ratioPrompt =
    aspectRatio === '1:1'  ? 'square 1:1 composition' :
    aspectRatio === '16:9' ? 'horizontal 16:9 widescreen composition' :
                             'vertical 9:16 portrait composition, TikTok/Reels format';

  const imageSize =
    aspectRatio === '1:1'  ? { width: 1080, height: 1080 } :
    aspectRatio === '16:9' ? { width: 1920, height: 1080 } :
                             { width: 1080, height: 1920 };

  const inferenceSteps = quality === 'premium' ? 20 : quality === 'standard' ? 12 : 8;

  try {
    // Step 1: Claude extracts 4 physical scene beats, guided by visual style
    const msg = await anthropic.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 1000,
      system:
        `You are a scene director for Omnyra, an AI video studio. ` +
        (nichePrefill ? `Niche mode: ${nichePrefill} ` : '') +
        (characterBrief ? `SUBJECT/CHARACTER: "${characterBrief}" — this is the person in every scene. Match their age, gender, ethnicity, and appearance EXACTLY across all 4 scenes. ` : '') +
        `Visual style for this shoot: ${styleContext}. ` +
        `Given a script, extract exactly 4 DISTINCT PHYSICAL SCENE MOMENTS — one per major beat. ` +
        `CRITICAL RULES: ` +
        `1. CHARACTER CONSISTENCY — every scene must feature the EXACT same person described in SUBJECT/CHARACTER above. Age, gender, and appearance must match precisely. ` +
        `2. Each scene MUST reflect the ERA, SETTING, and ENVIRONMENT implied by the script. ` +
        `3. Scene descriptions must match the VISUAL STYLE above. ` +
        `4. Include: specific location/setting, time of day, lighting, clothing details, props, and physical action. ` +
        `5. ZERO emotion labels — translate feelings into body language and micro-actions only. ` +
        `6. Each description is a FLUX image generation prompt — be concrete, visual, and specific. ` +
        `Return ONLY valid JSON array: [{"title":"short scene title","description":"2-3 sentence physical scene for image generation","ghostScore":70-100}]`,
      messages: [
        {
          role:    'user',
          content: `${characterBrief ? `SUBJECT: ${characterBrief}\n\n` : ''}Niche/Tool: ${toolId}\nVisual Brief / Scene Directions:\n${prompt}\n\nExtract 4 scene moments as FLUX image generation prompts. IMPORTANT: Every scene must feature the subject described above — correct gender, age, ethnicity, appearance. If the input already contains camera angles, character descriptions, lighting and setting — use those directly and enrich them. If it is raw script dialogue with stage directions in [brackets], use those as the physical action for each scene. Always output concrete, photographic descriptions: subject appearance, exact location, time of day, lighting quality, camera framing, props. Match era and setting exactly.`,
        },
      ],
    });

    const raw = msg.content[0].type === 'text' ? msg.content[0].text : '';
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error('[generate-concepts] Claude returned no JSON:', raw.substring(0, 200));
      return Response.json({ concepts: [] });
    }

    const textConcepts = JSON.parse(jsonMatch[0]) as Array<{ title: string; description: string; ghostScore: number }>;
    const four = textConcepts.slice(0, 4);

    // Step 2: Generate images in parallel
    const imageUrls = await Promise.all(
      four.map(c => generateConceptImage(c.description, falKey, stylePrefix, ratioPrompt, negativeStyle, imageSize, inferenceSteps))
    );

    const concepts = four.map((c, i) => ({
      title:       c.title,
      description: c.description,
      ghostScore:  c.ghostScore,
      imageUrl:    imageUrls[i] ?? '',
    }));

    return Response.json({ concepts });
  } catch (err) {
    console.error('[generate-concepts]', err);
    return Response.json({ error: 'generation failed' }, { status: 500 });
  }
}
