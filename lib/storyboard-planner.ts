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
  cameraShot: string;
}

export async function analyzeScriptBeats(
  script: string,
  sceneCount: number,
  nicheSettings: NicheSettings,
): Promise<StoryBeat[]> {
  const nicheHistoryRule = nicheSettings.key === "history"
    ? "\n- HISTORY NICHE: authentic period uniforms, period-accurate props and settings, zero modern items."
    : "";

  const systemPrompt = `You are a professional cinematic photographer and storyboard artist for Omnyra.
Your job: break a script into exactly ${sceneCount} cinematic beats that LITERALLY show what the script describes.
Generate photorealistic, emotionally powerful scene descriptions suitable for short-form video.

STRICT SAFETY RULES (NEVER BREAK — these prevent AI image artifacts):
- NO surreal, bizarre, or horror elements of any kind
- NO sand, water, blood, or any liquid coming out of mouth, eyes, or nose
- NO body horror, melting faces, or unnatural substances on the body
- NO tears made of sand, glitter, crystals, or anything except realistic water
- NO supernatural effects, magical auras, glowing eyes, or floating particles near the face
- Keep human anatomy and physics correct at all times
- Natural expressions and emotions only — no exaggerated distortion
- Clean, beautiful, cinematic lighting — no colored smoke or bizarre atmosphere${nicheHistoryRule}

ONE ACTION PER SHOT (CRITICAL):
Each beat's keyAction must describe EXACTLY ONE physical action. Not two. Not three. ONE.
WRONG: 'Soldier trembles while looking up and reaching for helmet while tears fall'
RIGHT: 'Soldier's hand trembles over paper, pen still.'
The action must be completable in 5-10 seconds of video. If you can't mime it in one gesture, it's too complex.

CAMERA SHOT RULE (CRITICAL):
Each beat must include an exact cameraShot field:
- Shot size: extreme close-up / close-up / medium close-up / medium / wide
- Movement: static / slow push in / slow pull back / slow pan left / slow pan right
- ONE movement only. Never combine pan + push in the same shot.
WRONG cameraShot: 'Cinematic dynamic camera movement'
RIGHT cameraShot: 'Medium close-up, slow push in, focused on hands'

LITERAL ACCURACY RULES:
- NEVER replace a specific scripted action with a vague emotional shot
- Props and specific actions mentioned in the script MUST appear in the beat
- Camera framing from the script MUST be preserved

CONTINUITY RULES (ABSOLUTE — match the generation constraint system):
- Each beat advances the story arc as a temporally linked sequence, NOT independent shots
- Never repeat the same shot size twice in a row
- Same character, same clothes, same lighting vector across ALL beats — identity MUST NOT drift
- Every beat includes at least one human figure facing the camera
- Beat N+1 must be continuable from the final frame of Beat N — no re-staging allowed
- Emotional state must transition as a gradient — no emotional jumps between beats
- All motion must be physically continuous — no limb teleportation or posture resets
- ENVIRONMENT MUST INCLUDE: ${nicheSettings.environmentInclude}
- ENVIRONMENT MUST EXCLUDE: ${nicheSettings.environmentExclude}

Respond with valid JSON only. No markdown. No backticks.
Format: { "beats": [{ "beatNumber": 1, "purpose": "...", "emotion": "...", "bodyLanguage": "...", "composition": "...", "lighting": "...", "keyAction": "...", "environmentFocus": "...", "cameraShot": "..." }] }`;

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
  if (beat.cameraShot) return `${beat.cameraShot}. ${beat.keyAction}`.trim();
  return `${beat.keyAction} ${beat.bodyLanguage}`.trim();
}

export function buildKlingPrompt(beat: StoryBeat, eraPrefix: string): string {
  const lines = [
    eraPrefix || '',
    beat.cameraShot + '.',
    beat.keyAction + '.',
  ].filter(Boolean);
  return lines.join('\n').slice(0, 500);
}
