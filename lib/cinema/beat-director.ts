/**
 * Beat Director — single AI call that replaces analyzeScriptBeats.
 *
 * Produces fully structured cinematic beats with per-beat narration.
 * Never splits paragraphs into scenes. Understands narrative.
 */

import Anthropic from "@anthropic-ai/sdk";
import type { CinematicBeat, NarrativeRole, PacingStyle, DirectorIntent } from "./types";
import type { NicheSettings } from "@/lib/config/nicheSettings";

const anthropic = new Anthropic();

const NARRATIVE_ROLES: NarrativeRole[] = [
  'establish', 'introduce', 'conflict', 'reaction', 'development', 'climax', 'resolution',
];

const ROLE_SEQUENCE_3 = ['establish', 'development', 'resolution'] as NarrativeRole[];
const ROLE_SEQUENCE_4 = ['establish', 'introduce', 'conflict', 'resolution'] as NarrativeRole[];
const ROLE_SEQUENCE_5 = ['establish', 'introduce', 'conflict', 'climax', 'resolution'] as NarrativeRole[];
const ROLE_SEQUENCE_6 = ['establish', 'introduce', 'conflict', 'development', 'climax', 'resolution'] as NarrativeRole[];

function getRoleSequence(count: number): NarrativeRole[] {
  if (count <= 3) return ROLE_SEQUENCE_3;
  if (count === 4) return ROLE_SEQUENCE_4;
  if (count === 5) return ROLE_SEQUENCE_5;
  return ROLE_SEQUENCE_6;
}

const SYSTEM_PROMPT = (
  sceneCount: number,
  niche: string,
  envInclude: string,
  envExclude: string,
  intent?: DirectorIntent,
) => `You are an AI Film Director for Omnyra. Your job is to analyze a creative idea and produce a structured cinematic beat plan.

You NEVER split paragraphs into scenes. You understand the NARRATIVE.
${intent ? `
DIRECTOR'S INTENT — apply this to every beat:
Theme: ${intent.theme}
Genre: ${intent.genre}
Emotional Curve: ${intent.emotionalCurve}
Visual Language: ${intent.visualLanguage}
Camera Philosophy: ${intent.cameraPhilosophy}
Colour Language: ${intent.colourLanguage}
Editing Rhythm: ${intent.editingRhythm}
Film Ending: ${intent.ending}
Dominant Texture: ${intent.dominantTexture}
` : ''}
RULES — NON-NEGOTIABLE:
1. Every beat must advance the story. No beat repeats the previous beat.
2. Every beat must have a UNIQUE purpose, emotion, action, and visual objective.
3. characterAction must be ONE filmable action completable in 5–10 seconds. Never two actions.
4. narration must be SHORT and punchy (4–12 words max). It complements visuals, never describes them.
5. emotion must EVOLVE through the sequence — never stay the same.
6. Camera language evolves. Never repeat the same shotType twice in a row.
7. Environment: MUST include ${envInclude || 'appropriate setting'}. NEVER include ${envExclude || 'nothing specified'}.
8. Niche context: ${niche}

NARRATION RULE:
Bad: "The woman stood at the kitchen counter stirring her coffee"
Good: "She couldn't stop the noise in her head."

SAFETY RULES:
- NO sand/water/blood from face or mouth
- NO body horror, supernatural effects, glowing auras
- NO surreal or horror elements
- Correct human anatomy at all times

Output EXACTLY ${sceneCount} beats as valid JSON only. No markdown, no backticks, no commentary.

Schema:
{
  "beats": [
    {
      "index": 0,
      "purpose": "string — what this beat does narratively",
      "emotion": "string — single dominant emotion",
      "visualObjective": "string — what the camera shows",
      "characterAction": "string — ONE filmable action (5–10 seconds)",
      "cameraIntention": "string — how the camera captures this",
      "transitionTarget": "string — what the next beat should open on",
      "objectsIntroduced": ["string"],
      "objectsRemoved": [],
      "environment": "string",
      "lighting": "string",
      "narrativeProgression": "string — how this advances the story",
      "narrativeRole": "establish|introduce|conflict|reaction|development|climax|resolution",
      "pacing": "slow|moderate|intense|still",
      "narration": "string — 4–12 word punchy voiceover line"
    }
  ]
}`;

interface BeatDirectorParams {
  idea:          string;
  script?:       string;
  niche:         string;
  sceneCount:    number;
  nicheSettings: NicheSettings;
  intent?:       DirectorIntent;
}

function parseBeat(raw: Record<string, unknown>, index: number, roles: NarrativeRole[]): CinematicBeat {
  const narrativeRole = (NARRATIVE_ROLES.includes(raw.narrativeRole as NarrativeRole)
    ? raw.narrativeRole
    : roles[index] ?? 'development') as NarrativeRole;

  const pacing = (['slow', 'moderate', 'intense', 'still'].includes(raw.pacing as string)
    ? raw.pacing
    : 'moderate') as PacingStyle;

  return {
    index,
    purpose:              String(raw.purpose              ?? `Scene ${index + 1}`),
    emotion:              String(raw.emotion              ?? 'neutral'),
    visualObjective:      String(raw.visualObjective      ?? ''),
    characterAction:      String(raw.characterAction      ?? 'Subject stands still, breathing visible'),
    cameraIntention:      String(raw.cameraIntention      ?? 'Camera holds steady'),
    transitionTarget:     String(raw.transitionTarget     ?? ''),
    objectsIntroduced:    Array.isArray(raw.objectsIntroduced) ? raw.objectsIntroduced.map(String) : [],
    objectsRemoved:       Array.isArray(raw.objectsRemoved)    ? raw.objectsRemoved.map(String)    : [],
    environment:          String(raw.environment          ?? ''),
    lighting:             String(raw.lighting             ?? 'Natural cinematic lighting'),
    narrativeProgression: String(raw.narrativeProgression ?? ''),
    narrativeRole,
    pacing,
    narration:            String(raw.narration            ?? ''),
  };
}

export async function generateCinematicBeats(
  params: BeatDirectorParams,
): Promise<CinematicBeat[]> {
  const { idea, script, niche, sceneCount, nicheSettings, intent } = params;

  const contextText = [
    `STORY IDEA: ${idea.trim().slice(0, 800)}`,
    script?.trim() ? `SCRIPT CONTEXT:\n${script.trim().slice(0, 1200)}` : null,
  ].filter(Boolean).join('\n\n');

  const roles = getRoleSequence(sceneCount);

  const response = await anthropic.messages.create({
    model:      'claude-sonnet-4-6',
    max_tokens: 2400,
    system:     SYSTEM_PROMPT(
      sceneCount,
      niche,
      nicheSettings.environmentInclude ?? '',
      nicheSettings.environmentExclude ?? '',
      intent,
    ),
    messages: [{
      role:    'user',
      content: `Produce exactly ${sceneCount} cinematic beats for this story:\n\n${contextText}`,
    }],
  });

  const raw = response.content[0]?.type === 'text' ? response.content[0].text.trim() : '';
  if (!raw) throw new Error('[BeatDirector] empty response');

  let parsed: { beats: Record<string, unknown>[] };
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Attempt to extract JSON block from response
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('[BeatDirector] no JSON in response');
    parsed = JSON.parse(match[0]);
  }

  if (!Array.isArray(parsed.beats)) throw new Error('[BeatDirector] beats array missing');

  const beats = parsed.beats.slice(0, sceneCount).map((b, i) => parseBeat(b, i, roles));

  // Pad to sceneCount if AI returned fewer
  while (beats.length < sceneCount) {
    const prev = beats[beats.length - 1];
    beats.push({
      index:               beats.length,
      purpose:             `Continue ${prev.purpose}`,
      emotion:             prev.emotion,
      visualObjective:     prev.visualObjective,
      characterAction:     'Subject pauses, looks forward',
      cameraIntention:     'Camera holds steady',
      transitionTarget:    '',
      objectsIntroduced:   [],
      objectsRemoved:      [],
      environment:         prev.environment,
      lighting:            prev.lighting,
      narrativeProgression: 'Deepens the moment',
      narrativeRole:       roles[beats.length] ?? 'resolution',
      pacing:              'slow',
      narration:           '',
    });
  }

  return beats;
}
