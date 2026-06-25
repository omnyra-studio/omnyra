import Anthropic from '@anthropic-ai/sdk';
import { cleanEnv } from '@/lib/supabase/admin';
import {
  buildCharacterBriefFromEthnicity,
  CAUCASIAN_DEFAULT_SYSTEM_RULE,
  resolveSubjectEthnicity,
  applySubjectEthnicityLock,
  type SubjectEthnicityInput,
} from '@/lib/subject-appearance';
import { parseJsonWithEthnicityFix } from '@/middleware/ethnicityFix';

const anthropic = new Anthropic({ apiKey: cleanEnv(process.env.ANTHROPIC_API_KEY) });

async function generateConceptImage(
  description: string,
  falKey: string,
  stylePrefix: string,
  ratioPrompt: string,
  negativeStyle: string,
  imageSize: { width: number; height: number },
  inferenceSteps: number,
  resolvedEthnicity: ReturnType<typeof resolveSubjectEthnicity>,
): Promise<string> {
  const locked = applySubjectEthnicityLock(`${stylePrefix}, ${description}`, resolvedEthnicity);
  const fullPrompt = `${locked.prompt}, ${ratioPrompt}, natural dramatic lighting, sharp focus, high detail, cinematic color grade, no visible text or writing, family friendly, suitable for all audiences`;
  const fullNegative = [negativeStyle, locked.negativeAddon].filter(Boolean).join(', ');
  try {
    const res = await fetch('https://fal.run/fal-ai/flux/schnell', {
      method:  'POST',
      headers: { Authorization: `Key ${falKey}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        prompt:                fullPrompt,
        negative_prompt:       fullNegative,
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
  const {
    prompt,
    characterBrief = '',
    toolId,
    nichePrefill = '',
    visualStyle = 'Lifestyle',
    aspectRatio = '9:16',
    quality = 'fast',
    subjectEthnicity,
  } = await parseJsonWithEthnicityFix<{
    prompt: string;
    characterBrief?: string;
    toolId: string;
    nichePrefill?: string;
    visualStyle?: string;
    aspectRatio?: string;
    quality?: string;
    subjectEthnicity?: SubjectEthnicityInput;
  }>(req);

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
  // Base negative — block explicit content, text/signs, and drug paraphernalia
  const baseNegative = 'nudity, topless, lingerie, explicit sexual content, nsfw, text, words, writing, signs, letters, numbers, captions, watermarks, gibberish text, banners, placards, marijuana, drugs, weed, cannabis, alcohol, cigarettes, weapons, violence, drug paraphernalia';
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

  const combinedText = `${characterBrief} ${prompt}`;
  const resolvedEthnicity = resolveSubjectEthnicity(subjectEthnicity, combinedText);
  const resolvedCharacterBrief = [
    buildCharacterBriefFromEthnicity(resolvedEthnicity),
    characterBrief,
  ].filter(Boolean).join('. ');

  try {
    // Step 1: Claude extracts 4 physical scene beats, guided by visual style
    const msg = await anthropic.messages.create({
      model:      'claude-haiku-4-5',
      max_tokens: 1000,
      system:
        `You are a cinematographer generating 4 DIFFERENT CAMERA ANGLES of the same scene for Omnyra AI video studio. ` +
        CAUCASIAN_DEFAULT_SYSTEM_RULE + ' ' +
        (nichePrefill ? `Niche mode: ${nichePrefill} ` : '') +
        `SUBJECT/CHARACTER: "${resolvedCharacterBrief}" — the same person appears in all 4 angles. Match age, gender, ethnicity EXACTLY across all 4. NEVER change ethnicity. ` +
        `Visual style: ${styleContext}. ` +
        `CRITICAL RULE: These are NOT sequential story beats. Do NOT write 'first this happens, then this'. ` +
        `Instead generate 4 DIFFERENT CAMERA ANGLES of the same emotional core moment from the script. Think: 4 photographers at the same scene, each choosing a different shot. ` +
        `ANGLE TYPES to use (one each): ` +
        `WIDE — full environment, subject small in frame, era/location context fully visible. ` +
        `CLOSE — face or hands only, extreme emotional detail, blurred background. ` +
        `DETAIL — specific physical action or prop (no face needed), texture and tactile quality. ` +
        `OVER SHOULDER — behind subject, showing what they see or hold in foreground. ` +
        `RULES FOR EACH ANGLE: ` +
        `1. Same character, same moment — just different camera position and focal subject. ` +
        `2. ERA/SETTING must be accurate to the script — period costume, props, environment. ` +
        `3. ZERO emotion labels — describe only observable physical details (Ghost Test: you are a camera, not a mind reader). ` +
        `4. Angle title must describe the SHOT not the story: 'Wide — Empty Barracks at Dawn' not 'The Morning Before Battle'. ` +
        `5. Description is a FLUX image generation prompt — concrete, visual, photographic. ` +
        `Return ONLY valid JSON array: [{"title":"Angle type — specific shot description","description":"2-3 sentence FLUX image prompt with character, location, lighting, physical detail","ghostScore":70-100}]`,
      messages: [
        {
          role:    'user',
          content: `SUBJECT: ${resolvedCharacterBrief}\n\nNiche/Tool: ${toolId}\nScript:\n${prompt}\n\nGenerate 4 DIFFERENT CAMERA ANGLES of the same core moment from this script. NOT a storyboard sequence — all 4 images show the same moment from different vantage points.\n\nRequired angles: WIDE shot, CLOSE shot, DETAIL shot, OVER SHOULDER shot.\n\nEach must feature the same character with consistent appearance. Era/period/setting must be accurate to the script. Ghost Test: describe only what a camera sees — physical details, not emotional states.`,
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
      four.map(c => generateConceptImage(
        c.description, falKey, stylePrefix, ratioPrompt, negativeStyle, imageSize, inferenceSteps,
        resolvedEthnicity,
      ))
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
