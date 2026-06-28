/**
 * Director AI — Layer 1
 *
 * Creates a LOCKED DirectorPlan + SceneSkeletons before any generation.
 * SceneSkeletons define what each scene IS (action, entities, camera intent).
 * They do NOT contain timing — that is the Voice Engine's domain.
 *
 * Nothing downstream may rewrite or contradict the Director's output.
 */

import Anthropic from "@anthropic-ai/sdk";
import type {
  DirectorPlan,
  SceneSkeleton,
  CharacterSpec,
  LocationSpec,
  CameraSpec,
  NarrativeRole,
  TransitionType,
} from "./types";

const client = new Anthropic();

export interface DirectorOutput {
  plan:      DirectorPlan;
  skeletons: SceneSkeleton[];
}

// ── Prompt ────────────────────────────────────────────────────────────────────

function buildDirectorPrompt(
  script: string,
  niche: string,
  sceneCount: number,
  referenceImageUrl?: string,
): string {
  const roles: NarrativeRole[] = ["hook", "development", "development", "climax", "climax", "resolution", "resolution", "resolution", "resolution"];
  const roleAssignment = roles.slice(0, sceneCount).join(", ");

  return `You are the Creative Director and Director of Photography for a professional short film.

SCRIPT:
"""
${script}
"""

NICHE: ${niche}
SCENE COUNT: ${sceneCount}
NARRATIVE ROLES (in order): ${roleAssignment}
${referenceImageUrl ? `REFERENCE IMAGE (describe the character to match): ${referenceImageUrl}` : ""}

ABSOLUTE RULES:
1. Character CLOTHING is locked. Same exact garment in every scene — no changes.
2. Full coverage clothing ONLY. No bare shoulders, strapless, low-cut, off-shoulder.
3. ONE action per scene. Never compound actions. "turns and smiles and waves" is forbidden.
4. Camera spec: never use "cinematic". Always: lens (e.g. 50mm) + shotSize + movement + height.
5. imagePrompt MUST include the character's full promptFragment verbatim.
6. videoPrompt MUST describe ONE motion only, reference character by name, include camera.
7. forbiddenElements MUST include: "other people", "text or signs", "bare skin", "nsfw".
8. Distribute narrationBeat so all scenes TOGETHER equal the complete script. No words dropped.
9. Clothing must visually read as full-coverage — long sleeves, or layers, or jacket.
10. Each scene action must be completable in 5-10 seconds of video.

Return ONLY valid JSON. No markdown. No explanation outside the JSON.

JSON SCHEMA:
{
  "plan": {
    "title": "string",
    "logline": "string — one sentence",
    "emotionalArc": "string — the emotional journey from first to last scene",
    "cameraLanguage": {
      "dominantLens": "string — e.g. 50mm",
      "colorGrade": "string — e.g. teal-orange film grade",
      "lightingApproach": "string — e.g. natural window light, soft fill",
      "motionStyle": "string — e.g. slow push-ins, locked-off statics, handheld intimacy"
    },
    "characters": [{
      "name": "string",
      "age": "string — e.g. woman in her early 30s",
      "sex": "string",
      "hair": "string — exact color, length, style",
      "eyes": "string — color",
      "skinTone": "string",
      "clothing": "string — EXACT locked clothing, no changes allowed — e.g. oversized cream knit sweater, dark wash straight-leg jeans, white sneakers",
      "accessories": "string — none OR exact items",
      "facialFeatures": "string",
      "bodyType": "string",
      "promptFragment": "string — 30-40 words verbatim for prompt injection — e.g. woman in her early 30s shoulder-length wavy auburn hair green eyes fair skin cream knit sweater dark jeans white sneakers soft jaw"
    }],
    "locations": [{
      "name": "string",
      "environment": "string",
      "lighting": "string — SPECIFIC, not 'nice' — e.g. warm golden hour side-light through large window, soft orange cast",
      "weather": "string",
      "timeOfDay": "string",
      "colors": "string — dominant palette",
      "promptFragment": "string — 20-30 words verbatim for prompt injection"
    }]
  },
  "skeletons": [{
    "index": 0,
    "narrativeRole": "hook",
    "narrationBeat": "string — exact words from script for this scene, verbatim",
    "actionUnit": "string — ONE action in 5-10 words — e.g. walks three steps to kitchen window",
    "emotionalState": "string — single word",
    "characterIndices": [0],
    "locationIndex": 0,
    "requiredProps": ["string"],
    "forbiddenElements": ["other people", "text or signs", "bare skin", "nsfw"],
    "cameraOverride": null,
    "transitionOut": "cut"
  }]
}`;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runDirectorAI(
  script:             string,
  voiceId:            string,
  niche:              string,
  targetDuration:     30 | 60 | 90,
  referenceImageUrl?: string,
): Promise<DirectorOutput> {
  const sceneCount = targetDuration === 30 ? 3 : targetDuration === 60 ? 6 : 9;

  console.log(`[DIRECTOR] planning ${sceneCount} scenes for ${targetDuration}s niche=${niche}`);

  const response = await client.messages.create({
    model:      "claude-opus-4-8",
    max_tokens: 8000,
    system:     "You are a professional film director. Return ONLY valid JSON. No explanation, no markdown fences.",
    messages:   [{ role: "user", content: buildDirectorPrompt(script, niche, sceneCount, referenceImageUrl) }],
  });

  const raw = response.content[0].type === "text" ? response.content[0].text : "";

  // Parse — be resilient to trailing text
  const jsonStart = raw.indexOf("{");
  const jsonEnd   = raw.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1) {
    console.error("[DIRECTOR] No JSON found. Raw:", raw.slice(0, 800));
    throw new Error("Director AI returned no valid JSON");
  }

  let parsed: { plan: Record<string, unknown>; skeletons: Record<string, unknown>[] };
  try {
    parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
  } catch (e) {
    console.error("[DIRECTOR] JSON parse failed:", (e as Error).message, "Raw:", raw.slice(jsonStart, jsonStart + 300));
    throw new Error("Director AI returned malformed JSON");
  }

  const plan      = assemblePlan(parsed.plan, voiceId, niche, sceneCount);
  const skeletons = assembleSkeletons(parsed.skeletons, sceneCount);

  console.log(`[DIRECTOR] plan="${plan.title}" characters=${plan.characters.length} locations=${plan.locations.length} skeletons=${skeletons.length}`);
  return { plan, skeletons };
}

// ── Assemblers ────────────────────────────────────────────────────────────────

function assemblePlan(
  raw: Record<string, unknown>,
  voiceId: string,
  niche:   string,
  sceneCount: number,
): DirectorPlan {
  const rawCam  = (raw.cameraLanguage as Record<string, string>) ?? {};
  const chars   = (raw.characters as Record<string, string>[]) ?? [];
  const locs    = (raw.locations  as Record<string, string>[]) ?? [];

  return {
    title:        String(raw.title       ?? "Untitled"),
    logline:      String(raw.logline     ?? ""),
    emotionalArc: String(raw.emotionalArc ?? ""),
    cameraLanguage: {
      dominantLens:     String(rawCam.dominantLens     ?? "50mm"),
      colorGrade:       String(rawCam.colorGrade       ?? "teal-orange film grade"),
      lightingApproach: String(rawCam.lightingApproach ?? "natural light"),
      motionStyle:      String(rawCam.motionStyle      ?? "slow push-ins"),
    },
    characters: chars.map(c => ({
      name:           String(c.name           ?? "Character"),
      age:            String(c.age            ?? ""),
      sex:            String(c.sex            ?? ""),
      hair:           String(c.hair           ?? ""),
      eyes:           String(c.eyes           ?? ""),
      skinTone:       String(c.skinTone       ?? ""),
      clothing:       String(c.clothing       ?? ""),
      accessories:    String(c.accessories    ?? "none"),
      facialFeatures: String(c.facialFeatures ?? ""),
      bodyType:       String(c.bodyType       ?? ""),
      promptFragment: String(c.promptFragment ?? ""),
    } as CharacterSpec)),
    locations: locs.map(l => ({
      name:           String(l.name           ?? ""),
      environment:    String(l.environment    ?? ""),
      lighting:       String(l.lighting       ?? ""),
      weather:        String(l.weather        ?? ""),
      timeOfDay:      String(l.timeOfDay      ?? ""),
      colors:         String(l.colors         ?? ""),
      promptFragment: String(l.promptFragment ?? ""),
    } as LocationSpec)),
    voiceId,
    niche,
    sceneCount,
  };
}

function assembleSkeletons(
  raws: Record<string, unknown>[],
  expectedCount: number,
): SceneSkeleton[] {
  if (!Array.isArray(raws) || raws.length === 0) {
    throw new Error(`Director returned 0 skeletons (expected ${expectedCount})`);
  }

  const roles: NarrativeRole[] = ["hook", "development", "development", "climax", "climax", "resolution", "resolution", "resolution", "resolution"];

  return raws.slice(0, expectedCount).map((s, i) => ({
    index:             i,
    narrativeRole:     (s.narrativeRole as NarrativeRole) ?? roles[i] ?? "development",
    narrationBeat:     String(s.narrationBeat  ?? ""),
    actionUnit:        String(s.actionUnit     ?? ""),
    emotionalState:    String(s.emotionalState ?? "neutral"),
    characterIndices:  Array.isArray(s.characterIndices) ? (s.characterIndices as number[]) : [0],
    locationIndex:     typeof s.locationIndex === "number" ? s.locationIndex : 0,
    requiredProps:     Array.isArray(s.requiredProps) ? (s.requiredProps as string[]) : [],
    forbiddenElements: Array.isArray(s.forbiddenElements)
      ? (s.forbiddenElements as string[])
      : ["other people", "text or signs", "bare skin", "nsfw"],
    cameraOverride:    s.cameraOverride as Partial<CameraSpec> | undefined ?? undefined,
    transitionOut:     (s.transitionOut as TransitionType) ?? "cut",
  }));
}
