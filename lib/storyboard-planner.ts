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
  const systemPrompt = `You are a professional film storyboard artist and script supervisor.
Your job: break a script into exactly ${sceneCount} cinematic beats that LITERALLY show what the script describes.

CRITICAL RULE — BE LITERAL:
- If the script says "face mid-lift: genuine strain" → keyAction MUST be "extreme close-up of woman's face during dumbbell lift, jaw clenched, visible strain"
- If the script says "phone screen shows their progress: honest numbers" → keyAction MUST be "woman holds smartphone screen-facing-camera showing workout data, gym background"
- If the script says "they grip the handle. Lift." → keyAction MUST be "close-up of woman's hand gripping barbell handle, arm rising with controlled effort"
- NEVER replace a specific scripted action with a vague emotional body-language shot
- Props, objects, and specific actions mentioned in the script MUST appear in the beat
- Camera framing from the script MUST be preserved (e.g. "camera widens" → wide shot)

SECONDARY RULES:
- Each beat should advance the story arc where possible
- Never repeat the same shot type twice in a row
- Characters must be consistent across beats (same person, same clothes, same setting)
- Every beat must include at least one human figure
- ENVIRONMENT MUST INCLUDE: ${nicheSettings.environmentInclude}
- ENVIRONMENT MUST EXCLUDE: ${nicheSettings.environmentExclude}

Respond with valid JSON only. No markdown. No backticks.
Format: { "beats": [{ "beatNumber": 1, "purpose": "...", "emotion": "...", "bodyLanguage": "...", "composition": "...", "lighting": "...", "keyAction": "...", "environmentFocus": "..." }] }`;

  const result = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
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
