/**
 * Ethnicity default middleware for Omnyra generation APIs.
 *
 * Next.js App Router has no Express-style req/res/next chain — import and call
 * `applyEthnicityFixToBody()` or `parseJsonWithEthnicityFix()` at the top of
 * every image/video/avatar generation route.
 *
 * Usage:
 *   import { parseJsonWithEthnicityFix } from '@/middleware/ethnicityFix';
 *   const body = await parseJsonWithEthnicityFix<MyBody>(req);
 */

import {
  detectEthnicityOverrideFromPrompt,
  type SubjectEthnicity,
} from '@/lib/subject-appearance';

export const ETHNICITY_DEFAULT_RULE = `[ETHNICITY DEFAULT RULE - HIGHEST PRIORITY]
- Default to Caucasian (Western/Northern European appearance) for ALL humans, characters, avatars, and people.
- Use realistic Caucasian facial features, fair to light skin tones, rounded eye shapes, and Western hair textures as default.
- NEVER default to East Asian, Southeast Asian, or any Asian features unless the user explicitly mentions "Asian", "East Asian", "Korean", "Chinese", "Japanese", "Indian", "Black", "African", "Latina", etc.
- Location and setting NEVER determine ethnicity (Tokyo, neon alley, etc.).
- This rule overrides everything else.`;

export const ETHNICITY_ULTRA_STRICT_RULE = `[MANDATORY ETHNICITY OVERRIDE]
All humans must be Caucasian by default.
Western European facial structure, fair to light skin, rounded eye shape, no epicanthic folds.
This is non-negotiable unless the user specifically requests another ethnicity in their prompt.`;

const PROMPT_STRING_FIELDS = [
  'prompt',
  'description',
  'scene',
  // 'goal' and 'script' intentionally excluded — these are user's creative brief text used
  // verbatim for voiceover/story content. Ethnicity is injected into `prompts` (video model
  // inputs) and via subjectEthnicity + applySubjectEthnicityToPrompts in the route instead.
  'imagePrompt',
  'characterBrief',
  'visual_prompt',
  'brief',
  'hook',
  'voiceText',
  'fullScript',
] as const;

const PROMPT_ARRAY_FIELDS = ['prompts'] as const;

const EXPLICIT_ETHNICITY_RE =
  /\b(asian|east\s+asian|korean|chinese|japanese|indian|black|african|latina|latino|latinx|latin|middle[\s-]eastern|hispanic)\b/i;

const RULE_ALREADY_INJECTED_RE = /\[ETHNICITY DEFAULT RULE|\[MANDATORY ETHNICITY OVERRIDE/i;

export interface EthnicityCharacter {
  ethnicity?: string;
  race?:       string;
  description?: string;
  [key: string]: unknown;
}

export interface EthnicityFixOptions {
  /** Use ultra-strict rule when no explicit ethnicity in request (default: true) */
  ultraStrict?: boolean;
}

function collectBodyText(body: Record<string, unknown>): string {
  const parts: string[] = [];

  for (const field of PROMPT_STRING_FIELDS) {
    const v = body[field];
    if (typeof v === 'string') parts.push(v);
  }

  for (const field of PROMPT_ARRAY_FIELDS) {
    const v = body[field];
    if (Array.isArray(v)) {
      for (const item of v) {
        if (typeof item === 'string') parts.push(item);
      }
    }
  }

  if (Array.isArray(body.characters)) {
    for (const char of body.characters as EthnicityCharacter[]) {
      if (char.description) parts.push(char.description);
      if (char.ethnicity) parts.push(char.ethnicity);
      if (char.race) parts.push(char.race);
    }
  }

  if (body.input && typeof body.input === 'object') {
    parts.push(collectBodyText(body.input as Record<string, unknown>));
  }

  return parts.join('\n');
}

export function bodyExplicitlyNamesEthnicity(body: Record<string, unknown>): boolean {
  const text = collectBodyText(body);
  if (EXPLICIT_ETHNICITY_RE.test(text)) return true;
  if (detectEthnicityOverrideFromPrompt(text)) return true;

  const choice = body.subjectEthnicity as string | undefined;
  if (choice && choice !== 'caucasian' && choice !== 'auto') return true;

  return false;
}

function prependRule(value: string, rule: string): string {
  if (RULE_ALREADY_INJECTED_RE.test(value)) return value;
  return `${rule}\n\n${value}`;
}

function patchStringField(body: Record<string, unknown>, field: string, rule: string): void {
  const v = body[field];
  if (typeof v === 'string' && v.trim()) {
    body[field] = prependRule(v, rule);
  }
}

function patchCharacters(body: Record<string, unknown>): void {
  if (!Array.isArray(body.characters)) return;

  body.characters = (body.characters as EthnicityCharacter[]).map(char => {
    const next = { ...char };
    if (!next.ethnicity && !next.race) {
      next.ethnicity = 'Caucasian';
      next.description = `${next.description ?? ''} Caucasian features, Western European appearance, fair skin.`.trim();
    }
    return next;
  });
}

/**
 * Apply ethnicity default rules to a parsed JSON body (mutates in place).
 * Call immediately after `await req.json()` on generation routes.
 */
export function applyEthnicityFixToBody<T extends Record<string, unknown>>(
  body: T,
  options: EthnicityFixOptions = {},
): T {
  const record = body as Record<string, unknown>;
  const ultraStrict = options.ultraStrict !== false;
  const explicit = bodyExplicitlyNamesEthnicity(record);
  const rule = explicit || !ultraStrict ? ETHNICITY_DEFAULT_RULE : ETHNICITY_ULTRA_STRICT_RULE;

  for (const field of PROMPT_STRING_FIELDS) {
    patchStringField(record, field, rule);
  }

  for (const field of PROMPT_ARRAY_FIELDS) {
    const arr = record[field];
    if (Array.isArray(arr)) {
      record[field] = arr.map(item =>
        typeof item === 'string' && item.trim() ? prependRule(item, rule) : item,
      );
    }
  }

  patchCharacters(record);

  if (!explicit) {
    if (!record.subjectEthnicity || record.subjectEthnicity === 'auto') {
      record.subjectEthnicity = 'caucasian' satisfies SubjectEthnicity;
    }
  }

  if (record.input && typeof record.input === 'object') {
    applyEthnicityFixToBody(record.input as Record<string, unknown>, options);
  }

  return body;
}

/** Parse request JSON and apply ethnicity fix in one step. */
export async function parseJsonWithEthnicityFix<T extends Record<string, unknown>>(
  req: Request,
  options?: EthnicityFixOptions,
): Promise<T> {
  const body = (await req.json()) as T;
  return applyEthnicityFixToBody(body, options);
}

/** Route paths that must always run ethnicity fix (for documentation / tests). */
export const ETHNICITY_FIX_ROUTES = [
  '/api/generate-cinematic-sequence',
  '/api/generate-concepts',
  '/api/seedance-prompt',
  '/api/split-script',
  '/api/generate-shot',
  '/api/generate-video-kling',
  '/api/generate-video-fal',
  '/api/generate-video-clip',
  '/api/generate-cinematic',
  '/api/generate/cinematic',
  '/api/cinematic-jobs',
  '/api/parallel-render',
  '/api/generate-avatar',
  '/api/generate-brief-sync',
  '/api/run-cinematic',
] as const;