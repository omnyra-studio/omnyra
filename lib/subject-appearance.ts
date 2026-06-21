export type SubjectEthnicity =
  | 'caucasian'
  | 'black'
  | 'asian'
  | 'hispanic'
  | 'middle-eastern'
  | 'south-asian';

/** @deprecated — resolves to caucasian; kept for API backward compat */
export type SubjectEthnicityInput = SubjectEthnicity | 'auto';

export const DEFAULT_SUBJECT_ETHNICITY: SubjectEthnicity = 'caucasian';

export const SUBJECT_ETHNICITY_OPTIONS: Array<{ id: SubjectEthnicity; label: string }> = [
  { id: 'caucasian',       label: 'Caucasian / White (default)' },
  { id: 'black',           label: 'Black / African' },
  { id: 'asian',           label: 'East Asian' },
  { id: 'hispanic',        label: 'Hispanic / Latino' },
  { id: 'middle-eastern',  label: 'Middle Eastern' },
  { id: 'south-asian',     label: 'South Asian / Indian' },
];

interface EthnicityLock {
  prefix:   string;
  negative: string;
}

const ETHNICITY_LOCKS: Record<SubjectEthnicity, EthnicityLock> = {
  caucasian: {
    prefix:   'a person with fair skin and light features,',
    negative: 'asian, east asian, asian face, asian woman, asian man, asian person, asian features, asian ethnicity, korean, japanese, chinese, southeast asian, mongolian, filipino, vietnamese, thai person, chinese person, japanese person, korean person, brown asian skin, slanted eyes, latina, latino, black african features',
  },
  black: {
    prefix:   'Black person with African diaspora features, rich dark skin tone,',
    negative: 'caucasian, white skin, east asian, pale skin, european features',
  },
  asian: {
    prefix:   'East Asian person with authentic Asian facial features,',
    negative: 'caucasian, european features, white skin, black african features',
  },
  hispanic: {
    prefix:   'Hispanic Latino Latina person with warm olive to tan skin tone, Latin facial features,',
    negative: 'east asian, caucasian only, pale european skin',
  },
  'middle-eastern': {
    prefix:   'Middle Eastern person with olive skin tone, Middle Eastern facial features,',
    negative: 'east asian, east asian features, pale caucasian only',
  },
  'south-asian': {
    prefix:   'South Asian Indian person with brown skin tone, South Asian facial features,',
    negative: 'east asian, caucasian, white skin, european features',
  },
};

/**
 * Only override Caucasian default when the user explicitly names an ethnicity in their prompt.
 * Location words (Tokyo, neon alley, etc.) never trigger overrides.
 * Matches: "asian", "black", "latin/latina/latino", "indian", "middle eastern" + subject context.
 */
const ETHNICITY_OVERRIDE_PATTERNS: Array<{ id: SubjectEthnicity; re: RegExp }> = [
  { id: 'south-asian',     re: /\b(south\s+asian|indian\s+(?:woman|man|person|female|male|model|avatar|protagonist|character)|\bindian\b(?=.*\b(woman|man|person|people|model|avatar|protagonist|character|girl|boy)\b))/i },
  { id: 'middle-eastern',  re: /\b(middle[\s-]eastern|arab\s+(?:woman|man|person)|persian\s+(?:woman|man|person))\b/i },
  { id: 'hispanic',        re: /\b(hispanic|latino|latina|latinx|\blatin\b(?=.*\b(woman|man|person|people|model|avatar|protagonist|character|girl|boy)\b))/i },
  { id: 'asian',           re: /\b(east\s+asian|korean\s+(?:woman|man|person)|japanese\s+(?:woman|man|person)|chinese\s+(?:woman|man|person)|asian\s+(?:woman|man|person|people|model|avatar|protagonist|character|female|male|girl|boy)|\basian\b(?=.*\b(woman|man|person|people|model|avatar|protagonist|character|girl|boy|subject)\b))/i },
  { id: 'black',           re: /\b(african[\s-]american|black\s+(?:woman|man|person|people|model|avatar|protagonist|character|female|male|girl|boy)|\bblack\b(?=.*\b(woman|man|person|people|model|avatar|protagonist|character|girl|boy|subject)\b))/i },
];

export function promptHasHumanSubject(text: string): boolean {
  return /\b(person|people|man|woman|he|she|they|creator|host|presenter|protagonist|character|avatar|model|actor|couple|barista|doctor|athlete|girl|boy|lady|gentleman|influencer|customer|subject)\b/i.test(text);
}

export function detectEthnicityOverrideFromPrompt(text: string): SubjectEthnicity | null {
  for (const { id, re } of ETHNICITY_OVERRIDE_PATTERNS) {
    if (re.test(text)) return id;
  }
  return null;
}

/**
 * Prompt-first: Caucasian/white unless the user writes asian, black, latin, indian, etc.
 * UI dropdown is a fallback when the prompt does not specify ethnicity.
 */
export function resolveSubjectEthnicity(
  userChoice: SubjectEthnicityInput | undefined | null,
  promptText = '',
): SubjectEthnicity {
  const fromPrompt = detectEthnicityOverrideFromPrompt(promptText);
  if (fromPrompt) return fromPrompt;

  if (userChoice && userChoice !== 'auto' && userChoice !== 'caucasian') {
    return userChoice;
  }

  return DEFAULT_SUBJECT_ETHNICITY;
}

export function getEthnicityLock(ethnicity: SubjectEthnicity): EthnicityLock {
  return ETHNICITY_LOCKS[ethnicity];
}

function promptAlreadyEthnicityLocked(prompt: string): boolean {
  return /\b(Beautiful Caucasian white European|White Caucasian European-American|Caucasian person with European|Black person with African|East Asian person with authentic|Hispanic Latino Latina|Middle Eastern person with olive|South Asian Indian person)\b/i.test(prompt);
}

export function applySubjectEthnicityLock(
  prompt: string,
  ethnicity: SubjectEthnicity,
): { prompt: string; negativeAddon: string } {
  const lock = getEthnicityLock(ethnicity);

  if (promptAlreadyEthnicityLocked(prompt)) {
    return { prompt, negativeAddon: lock.negative };
  }

  const detected = detectEthnicityOverrideFromPrompt(prompt);
  if (detected === ethnicity) {
    return { prompt, negativeAddon: lock.negative };
  }

  let cleaned = prompt;
  if (ethnicity === DEFAULT_SUBJECT_ETHNICITY) {
    cleaned = cleaned
      .replace(/\b(east\s+asian|asian\s+(?:woman|man|person)|korean|japanese|chinese)\s+/gi, '')
      .trim();
  }

  // Always prepend for human-subject scenes; always apply negative to block wrong faces
  const hasHuman = promptHasHumanSubject(cleaned);
  if (!hasHuman && ethnicity === DEFAULT_SUBJECT_ETHNICITY) {
    return { prompt: cleaned, negativeAddon: lock.negative };
  }

  return {
    prompt: `${lock.prefix} ${cleaned}`,
    negativeAddon: lock.negative,
  };
}

export function applySubjectEthnicityToPrompts(
  prompts: string[],
  ethnicity: SubjectEthnicity,
): { prompts: string[]; negativeAddon: string } {
  let negativeAddon = getEthnicityLock(ethnicity).negative;

  const locked = prompts.map(p => {
    const result = applySubjectEthnicityLock(p, ethnicity);
    if (result.negativeAddon) negativeAddon = result.negativeAddon;
    return result.prompt;
  });

  return { prompts: locked, negativeAddon };
}

export function buildCharacterBriefFromEthnicity(
  ethnicity: SubjectEthnicity,
  gender: 'female' | 'male' | 'any' = 'any',
): string {
  const lock = getEthnicityLock(ethnicity);
  const genderLabel = gender === 'female' ? 'woman' : gender === 'male' ? 'man' : 'person';
  return lock.prefix
    .replace(/,\s*$/, '')
    .replace(/NOT Asian NOT East Asian,?\s*/i, '')
    .trim() + ` ${genderLabel}`;
}

export const CAUCASIAN_DEFAULT_SYSTEM_RULE =
  'DEFAULT SUBJECT ETHNICITY: Caucasian white European person with fair to light skin in every scene with human subjects. ' +
  'ONLY use a different ethnicity if the user EXPLICITLY writes it in their prompt (e.g. "Asian woman", "Black man", "Latina model", "Indian person"). ' +
  'The words asian, black, latin/latina/latino in the user prompt override the default. ' +
  'Location and setting NEVER determine ethnicity — Tokyo, neon alley, Japanese restaurant, etc. do NOT make subjects Asian.';