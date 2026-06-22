import Anthropic from '@anthropic-ai/sdk';
import type { NicheSettings } from './config/nicheSettings';

const anthropic = new Anthropic();

export interface StoryBeat {
  beatNumber: number;
  purpose: string;
  emotion: string;
  bodyLanguage: string;
  composition: string;
  lighting: string;
  keyAction: string;
  environmentFocus: string;
}

export async function analyzeScriptBeats(
  script: string,
  sceneCount: number,
  nicheSettings: NicheSettings,
): Promise<StoryBeat[]> {
  const systemPrompt = `You are a professional film storyboard artist.
You analyze scripts to extract EMOTIONAL BEATS, not literal nouns.

Your job: break a script into exactly ${sceneCount} cinematic beats
that tell the story visually through body language, composition,
and environment — NOT through showing random objects mentioned in text.

RULES:
- Each beat must advance the emotional arc (tension → conflict → resolution)
- Never repeat the same emotional state twice
- Characters must be consistent across all beats (same people, same clothes, same setting)
- Body language tells the story, not props
- No isolated object close-ups unless they serve the emotional beat
- Every beat must include at least one human figure showing emotion through posture/expression
- ENVIRONMENT MUST INCLUDE: ${nicheSettings.environmentInclude}
- ENVIRONMENT MUST EXCLUDE: ${nicheSettings.environmentExclude}

Respond with valid JSON only. No markdown. No backticks.
Format: { "beats": [{ "beatNumber": 1, "purpose": "...", "emotion": "...", "bodyLanguage": "...", "composition": "...", "lighting": "...", "keyAction": "...", "environmentFocus": "..." }] }`;

  const result = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1200,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: `Analyze this script into exactly ${sceneCount} cinematic beats:\n\n${script}`,
    }],
  });

  const text = result.content[0]?.type === 'text' ? result.content[0].text : '';
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('[STORYBOARD] model returned no JSON object');

  const parsed = JSON.parse(text.slice(start, end + 1)) as { beats?: StoryBeat[] };
  if (!Array.isArray(parsed.beats) || parsed.beats.length === 0) {
    throw new Error('[STORYBOARD] beats array missing or empty in model response');
  }

  console.log(`[STORYBOARD] extracted ${parsed.beats.length} beats`);
  parsed.beats.forEach((b, i) => {
    console.log(`[BEAT_${i + 1}] purpose="${b.purpose}" emotion="${b.emotion}" action="${b.keyAction}"`);
  });

  return parsed.beats;
}

export function beatToImagePrompt(
  beat: StoryBeat,
  characterDescription: string,
  eraPrefix: string,
  nicheSettings: NicheSettings,
): string {
  const charPrefix = characterDescription
    ? `${characterDescription}, same person in every scene, consistent appearance, same uniform, same hair, same face.`
    : '';

  const parts = [
    eraPrefix,
    beat.composition + '.',
    charPrefix,
    beat.bodyLanguage + '.',
    beat.keyAction + '.',
    beat.lighting + '.',
    'Environment: ' + beat.environmentFocus + '.',
    nicheSettings.cinemaStyle,
    'No text, no readable writing, no legible words.',
  ].filter(Boolean);

  const prompt = parts.join(' ');
  console.log(`[IMAGE_PROMPT_FROM_BEAT] beat=${beat.beatNumber} prompt="${prompt.slice(0, 120)}"`);
  return prompt;
}

export function beatToKlingDirection(beat: StoryBeat): string {
  return `${beat.keyAction} ${beat.bodyLanguage}`.trim();
}
