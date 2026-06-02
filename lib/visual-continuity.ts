import Anthropic from "@anthropic-ai/sdk";

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
  character: CharacterBible | null;
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
    return { character: null, environment: null, objects: { props: [] }, hasCharacter: false };
  }

  const client = new Anthropic({ apiKey });
  const combined = prompts.slice(0, 8).join("\n---\n").substring(0, 2000);
  const scriptContext = script ? `\nScript context: ${script.substring(0, 400)}` : "";

  let text = "{}";
  try {
    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      messages: [{
        role: "user",
        content: `Analyze these video scene prompts and extract recurring visual elements for continuity enforcement.
${scriptContext}
Scene Prompts:
${combined}

Identify any recurring characters, environments, or objects that must remain consistent across all scenes.
Return ONLY valid JSON — no markdown, no explanation:
{
  "character": {
    "present": true,
    "gender": "woman",
    "ageRange": "late 20s",
    "hair": "dark brown wavy hair",
    "clothing": ["white linen shirt", "high-waisted jeans"],
    "accessories": ["gold hoop earrings"],
    "raw": "one-sentence description of the character"
  },
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

If NO recurring character appears in these scenes, set character.present = false and return null values.
If no specific environment is repeated, set environment to null.`,
      }],
    });
    text = response.content[0]?.type === "text" ? response.content[0].text : "{}";
  } catch (err) {
    console.warn("[visual-continuity] extractBibles failed:", err instanceof Error ? err.message : err);
    return { character: null, environment: null, objects: { props: [] }, hasCharacter: false };
  }

  try {
    const parsed = JSON.parse(text);
    const hasCharacter = parsed.character?.present === true;
    return {
      character: hasCharacter ? {
        gender:      parsed.character.gender      ?? "person",
        ageRange:    parsed.character.ageRange    ?? "adult",
        hair:        parsed.character.hair        ?? "",
        clothing:    parsed.character.clothing    ?? [],
        accessories: parsed.character.accessories ?? [],
        raw:         parsed.character.raw         ?? "",
      } : null,
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
    return { character: null, environment: null, objects: { props: [] }, hasCharacter: false };
  }
}

// ── Consistency suffix builder ────────────────────────────────────────────────

export function buildConsistencySuffix(bibles: ContinuityBibles): string {
  const parts: string[] = [];

  if (bibles.character) {
    const c = bibles.character;
    const desc = c.raw || [c.gender, c.hair, c.clothing.join(", ")].filter(Boolean).join(", ");
    parts.push(`MAINTAIN EXACT CHARACTER: ${desc}.`);
    if (c.clothing.length)    parts.push(`SAME CLOTHING: ${c.clothing.join(", ")}.`);
    if (c.accessories.length) parts.push(`SAME ACCESSORIES: ${c.accessories.join(", ")}.`);
  }

  if (bibles.environment) {
    const e = bibles.environment;
    if (e.raw)              parts.push(`MAINTAIN ENVIRONMENT: ${e.raw}.`);
    if (e.keyElements.length) parts.push(`KEEP ELEMENTS: ${e.keyElements.join(", ")}.`);
  }

  if (bibles.objects.props.length) {
    const objList = bibles.objects.props.map(p => `${p.count}x ${p.name}`).join(", ");
    parts.push(`OBJECT COUNT: ${objList}.`);
  }

  return parts.length ? " " + parts.join(" ") : "";
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
    const parsed = JSON.parse(text);
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
