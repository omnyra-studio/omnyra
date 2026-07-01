import Anthropic from "@anthropic-ai/sdk";
import { tryParseJson } from "./safe-parse-json";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CharacterBible {
  gender: string;
  ageRange: string;
  hair: string;
  clothing: string[];
  accessories: string[];
  raw: string;
}

export interface EnvironmentBible {
  locationType: string;
  timeOfDay: string;
  keyElements: string[];
  atmosphere: string;
  raw: string;
}

export interface ObjectRegistry {
  props: Array<{ name: string; count: number }>;
}

export interface ContinuityBibles {
  /** @deprecated Use `characters` array instead — single `character` only ever captured one person */
  character: CharacterBible | null;
  /** Structured per-character array — replaces the single `character` blob */
  characters: CharacterBible[];
  environment: EnvironmentBible | null;
  objects: ObjectRegistry;
  hasCharacter: boolean;
}

export interface FrameConsistencyResult {
  characterScore: number;
  environmentScore: number;
  objectScore: number;
  issues: string[];
  sceneA: number;
  sceneB: number;
}

export interface ContinuityScore {
  character: number;
  environment: number;
  object: number;
  overall: number;
  frameResults: FrameConsistencyResult[];
}

// ── Bible extraction ──────────────────────────────────────────────────────────

export async function extractBibles(prompts: string[], script?: string): Promise<ContinuityBibles> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { character: null, characters: [], environment: null, objects: { props: [] }, hasCharacter: false };
  }

  const client = new Anthropic({ apiKey });
  const combined = prompts.slice(0, 8).join("\n---\n").substring(0, 2000);
  const scriptContext = script ? `\nScript context: ${script.substring(0, 400)}` : "";

  let text = "{}";
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: `Analyze these video scene prompts and extract ALL recurring characters and visual elements for continuity enforcement.
${scriptContext}
Scene Prompts:
${combined}

IMPORTANT: List EVERY distinct character who appears. Do not merge multiple people into one entry.
Return ONLY valid JSON — no markdown, no explanation:
{
  "characters": [
    {
      "gender": "woman",
      "ageRange": "late 20s",
      "hair": "dark brown wavy hair",
      "clothing": ["white linen shirt", "high-waisted jeans"],
      "accessories": ["gold hoop earrings"],
      "raw": "one-sentence description of this character"
    }
  ],
  "environment": {
    "locationType": "outdoor",
    "timeOfDay": "golden hour",
    "keyElements": ["beach", "ocean waves", "sand dunes"],
    "atmosphere": "warm, cinematic, summery",
    "raw": "one-sentence description of the setting"
  },
  "objects": {
    "props": [
      { "name": "coffee cup", "count": 1 }
    ]
  }
}

If NO recurring characters appear, return an empty characters array.
If no specific environment is repeated, set environment to null.`,
      }],
    });
    text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
  } catch (err) {
    console.warn("[visual-continuity] extractBibles failed:", err instanceof Error ? err.message : err);
    return { character: null, characters: [], environment: null, objects: { props: [] }, hasCharacter: false };
  }

  try {
    type RawChar = { gender?: string; ageRange?: string; hair?: string; clothing?: string[]; accessories?: string[]; raw?: string };
    type RawBibles = {
      characters?: RawChar[];
      /** @deprecated legacy single-char field — kept for backwards parse compat */
      character?: { present?: boolean } & RawChar;
      environment?: { locationType?: string; timeOfDay?: string; keyElements?: string[]; atmosphere?: string; raw?: string } | null;
      objects?: { props?: Array<{ name: string; count: number }> };
    };
    const parsed = (tryParseJson<RawBibles>(text) ?? {}) as RawBibles;

    const toCharBible = (c: RawChar): CharacterBible => ({
      gender:      c.gender      ?? "person",
      ageRange:    c.ageRange    ?? "adult",
      hair:        c.hair        ?? "",
      clothing:    c.clothing    ?? [],
      accessories: c.accessories ?? [],
      raw:         c.raw         ?? "",
    });

    // Prefer the new `characters` array; fall back to legacy single `character` field
    const rawChars: RawChar[] = Array.isArray(parsed.characters) && parsed.characters.length > 0
      ? parsed.characters
      : (parsed.character?.present === true ? [parsed.character] : []);

    const characters = rawChars.map(toCharBible);
    const hasCharacter = characters.length > 0;

    console.log(`[EXTRACT_BIBLES] ${characters.length} character(s) extracted`);

    return {
      character:   hasCharacter ? characters[0] : null, // legacy compat
      characters,
      environment: parsed.environment ? {
        locationType: parsed.environment.locationType ?? "any",
        timeOfDay:    parsed.environment.timeOfDay    ?? "any",
        keyElements:  parsed.environment.keyElements  ?? [],
        atmosphere:   parsed.environment.atmosphere   ?? "",
        raw:          parsed.environment.raw          ?? "",
      } : null,
      objects: { props: parsed.objects?.props ?? [] },
      hasCharacter,
    };
  } catch {
    return { character: null, characters: [], environment: null, objects: { props: [] }, hasCharacter: false };
  }
}

// ── Character prefix (PREPEND to each prompt for maximum Kling weight) ────────

/**
 * Returns a compact identity string to place BEFORE the scene description.
 * Putting character details first ensures Kling locks on them before reading scene content.
 */
export function buildCharacterPrefix(bibles: ContinuityBibles): string {
  if (!bibles.character) return "";
  const c = bibles.character;
  const details = c.raw
    || [c.gender, c.ageRange, c.hair, ...c.clothing, ...c.accessories].filter(Boolean).join(", ");
  return `the same ${details}, `;
}

// ── Consistency suffix (environment + objects only — character handled by prefix) ──

export function buildConsistencySuffix(bibles: ContinuityBibles): string {
  const parts: string[] = [];

  if (bibles.environment) {
    const e = bibles.environment;
    const envDesc = e.raw || [e.locationType, e.timeOfDay, e.atmosphere].filter(Boolean).join(", ");
    parts.push(`same ${envDesc}`);
    if (e.keyElements.length) parts.push(`keep ${e.keyElements.join(", ")}`);
  }

  if (bibles.objects.props.length) {
    const objList = bibles.objects.props.map(p => `${p.count}x ${p.name}`).join(", ");
    parts.push(`exact objects: ${objList}`);
  }

  return parts.length ? ", " + parts.join(", ") : "";
}

// ── Frame comparison via Claude Vision ───────────────────────────────────────

export async function validateFrameConsistency(
  imageUrlA: string,
  imageUrlB: string,
  sceneIndexA: number,
  sceneIndexB: number,
  bibles: ContinuityBibles,
): Promise<FrameConsistencyResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { characterScore: 100, environmentScore: 100, objectScore: 100, issues: [], sceneA: sceneIndexA, sceneB: sceneIndexB };
  }

  const client = new Anthropic({ apiKey });
  const characterDesc = bibles.character?.raw || "no specific character";
  const envDesc       = bibles.environment?.raw || "any environment";

  let text = "{}";
  try {
    const response = await client.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 350,
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: `Compare these two consecutive video frames for visual continuity.

Expected character: ${characterDesc}
Expected environment: ${envDesc}

Score each dimension 0-100 for consistency between Image A (scene ${sceneIndexA + 1}) and Image B (scene ${sceneIndexB + 1}):
- characterScore: same person appearance, gender, hair, clothing
- environmentScore: same setting, lighting, background
- objectScore: same props and object counts

Return ONLY valid JSON:
{
  "characterScore": 95,
  "environmentScore": 88,
  "objectScore": 100,
  "issues": ["character changed clothing colour"]
}`,
          },
          { type: "image", source: { type: "url", url: imageUrlA } },
          { type: "image", source: { type: "url", url: imageUrlB } },
        ],
      }],
    });
    text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
  } catch (err) {
    console.warn("[visual-continuity] validateFrameConsistency failed:", err instanceof Error ? err.message : err);
    return { characterScore: 100, environmentScore: 100, objectScore: 100, issues: [], sceneA: sceneIndexA, sceneB: sceneIndexB };
  }

  try {
    type RawConsistency = { characterScore?: number; environmentScore?: number; objectScore?: number; issues?: string[] };
    const parsed = (tryParseJson<RawConsistency>(text) ?? {}) as RawConsistency;
    return {
      characterScore:    Math.min(100, Math.max(0, Number(parsed.characterScore    ?? 100))),
      environmentScore:  Math.min(100, Math.max(0, Number(parsed.environmentScore  ?? 100))),
      objectScore:       Math.min(100, Math.max(0, Number(parsed.objectScore       ?? 100))),
      issues:            Array.isArray(parsed.issues) ? parsed.issues : [],
      sceneA:            sceneIndexA,
      sceneB:            sceneIndexB,
    };
  } catch {
    return { characterScore: 100, environmentScore: 100, objectScore: 100, issues: [], sceneA: sceneIndexA, sceneB: sceneIndexB };
  }
}

// ── Score aggregation ─────────────────────────────────────────────────────────

export function computeContinuityScore(frameResults: FrameConsistencyResult[]): ContinuityScore {
  if (!frameResults.length) {
    return { character: 100, environment: 100, object: 100, overall: 100, frameResults: [] };
  }

  const n = frameResults.length;
  const character   = Math.round(frameResults.reduce((s, r) => s + r.characterScore,   0) / n);
  const environment = Math.round(frameResults.reduce((s, r) => s + r.environmentScore, 0) / n);
  const object      = Math.round(frameResults.reduce((s, r) => s + r.objectScore,      0) / n);
  const overall     = Math.round(character * 0.5 + environment * 0.3 + object * 0.2);

  return { character, environment, object, overall, frameResults };
}
