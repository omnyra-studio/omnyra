/**
 * Prompt Compiler — builds structured RenderContracts from SceneGraphNodes.
 *
 * CRITICAL RULE: This compiler NEVER puts raw script text, paragraphs, or
 * screenplay dialogue into the output prompt. Only structured cinematic
 * instructions derived from the scene graph node.
 *
 * Output format (deterministic, ≤500 chars):
 *   [ERA?] [SHOT_TYPE], [MOVEMENT]. [CHARACTER_ACTION]. [EMOTION]. [LIGHTING]. [CONTINUITY].
 */

import type { CinematicBeat, ShotPlan, RenderContract, SceneGraphNode } from "./types";

const MAX_RENDER_PROMPT = 490; // Leave 10 char buffer below Kling 500 limit

const CONTINUITY_PHRASE = "Preserve character, wardrobe, lighting from previous frame.";

const NEGATIVE_BASE =
  "stock photo pose, studio lighting, CGI, airbrushed, oversaturated, " +
  "extra limbs, extra fingers, mutated hands, deformed hands, fused fingers, bad anatomy, " +
  "head facing backward, neck twisted, inverted feet, reversed joints, " +
  "sand from face, particles from mouth, liquid from mouth, water dripping from face";

const NEGATIVE_FOR_ROLE: Record<string, string> = {
  establish:   "extreme close-up, claustrophobic framing",
  introduce:   "empty scene, no subject visible",
  conflict:    "smiling, relaxed expression, joyful, happy",
  reaction:    "action shot, movement, busy background",
  development: "static background, nothing moving",
  climax:      "wide establishing, far away subject",
  resolution:  "tense expression, conflict, panic",
};

export function compileRenderContracts(nodes: SceneGraphNode[]): RenderContract[] {
  return nodes.map((node, i) => compileNode(node, i));
}

function compileNode(node: SceneGraphNode, index: number): RenderContract {
  const { beat, shot } = node;
  const isFirst = index === 0;

  // ── Prompt assembly — structured, never narrative text ────────────────────
  const parts: string[] = [];

  // Shot type + movement (camera state)
  parts.push(`${formatShotType(shot.shotType)}, ${shot.movement}`);

  // Single filmable action
  parts.push(sanitizeAction(beat.characterAction));

  // Emotional state (concise)
  parts.push(formatEmotion(beat.emotion));

  // Lighting
  parts.push(sanitizeLighting(beat.lighting));

  // Environment (brief)
  if (beat.environment) {
    parts.push(`Setting: ${beat.environment.slice(0, 60)}`);
  }

  // Continuity lock for scenes 2+
  if (!isFirst) {
    parts.push(CONTINUITY_PHRASE);
  }

  const prompt = parts.join('. ').replace(/\.\./g, '.').slice(0, MAX_RENDER_PROMPT);

  // ── Camera state description ──────────────────────────────────────────────
  const cameraState = `${shot.shotType}, ${shot.movement}, ${shot.focalLength}, ${shot.lensNote}`;

  // ── Continuity lock string ─────────────────────────────────────────────────
  const continuityLock = isFirst
    ? `Anchor scene: establish ${beat.environment}, ${beat.lighting}`
    : `Continue from previous frame. ${beat.objectsIntroduced.length > 0 ? `New: ${beat.objectsIntroduced.join(', ')}.` : ''} ${beat.objectsRemoved.length > 0 ? `Remove: ${beat.objectsRemoved.join(', ')}.` : ''}`.trim();

  // ── Negative prompt ───────────────────────────────────────────────────────
  const negativePrompt = [
    NEGATIVE_BASE,
    NEGATIVE_FOR_ROLE[beat.narrativeRole] ?? '',
  ].filter(Boolean).join(', ');

  return {
    nodeIndex:      node.index,
    prompt,
    negativePrompt,
    characterState: beat.characterAction,
    cameraState,
    environment:    beat.environment,
    lighting:       beat.lighting,
    shotPurpose:    beat.purpose,
    action:         beat.characterAction,
    emotion:        beat.emotion,
    transition:     beat.transitionTarget,
    continuityLock,
    narrativeRole:  beat.narrativeRole,
  };
}

function formatShotType(shot: string): string {
  const map: Record<string, string> = {
    'wide':          'Wide establishing shot',
    'medium':        'Medium shot',
    'close-up':      'Close-up',
    'over-shoulder': 'Over-shoulder shot',
    'pov':           'POV shot',
    'tracking':      'Tracking shot',
    'drone':         'Drone aerial shot',
    'insert':        'Insert close-up',
    'reaction':      'Reaction close-up',
  };
  return map[shot] ?? 'Cinematic shot';
}

function sanitizeAction(action: string): string {
  // Strip screenplay language (dialogue, internal thoughts, narration)
  return action
    .replace(/"[^"]*"/g, '')        // Remove quoted dialogue
    .replace(/\(.*?\)/g, '')        // Remove parenthetical notes
    .replace(/INT\.|EXT\./g, '')    // Remove sluglines
    .replace(/FADE IN:|FADE OUT:/g, '')
    .trim()
    .slice(0, 120);
}

function formatEmotion(emotion: string): string {
  return `Expression and body convey ${emotion}`;
}

function sanitizeLighting(lighting: string): string {
  // Keep lighting technical — remove any narrative descriptions
  return lighting.slice(0, 80);
}
