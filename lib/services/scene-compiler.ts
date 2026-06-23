/**
 * Scene Compiler Service
 *
 * Converts free-form user input into a deterministic SceneCompilerProject.
 * Claude generates the full scene graph; this service assembles it into
 * typed, validated output that both image and video pipelines consume.
 *
 * Pipeline:
 *   CompilerInput → compileSceneGraph() → SceneCompilerProject
 *     ↓ image pipeline: scene.image_prompt → Flux Dev
 *     ↓ video pipeline: scene.video_prompt + scene.continuity → Kling i2v
 */

import Anthropic from "@anthropic-ai/sdk";
import { getNicheSettings } from "@/lib/config/nicheSettings";
import { buildBrandMemoryInjection, type BrandMemory } from "@/lib/memory/brand-memory";
import { buildStoryMemoryInjection, type StoryMemory } from "@/lib/memory/story-memory";
import { runAgentSwarm } from "@/lib/agents/swarm";
import type {
  CompilerInput,
  SceneCompilerProject,
  SceneNode,
  GlobalStyle,
  Character,
  NarrativeRole,
  ShotType,
  FrameAnchorStrength,
} from "@/lib/types/scene-compiler";

const COMPILER_VERSION = "scene-compiler-v1";

// ── Narrative structure map ───────────────────────────────────────────────────

const NARRATIVE_ROLES: NarrativeRole[] = ["hook", "development", "climax", "resolution"];

// Shot distance progression — each scene forces visual variety
const SHOT_PROGRESSION: ShotType[] = [
  "wide shot",
  "medium shot",
  "close-up",
  "medium wide",
];

// ── Negative prompt base (Kling + Flux shared) ────────────────────────────────

export const COMPILER_NEGATIVE_BASE =
  "blur, low quality, watermark, text overlay, written words, legible text, " +
  "extra limbs, extra fingers, mutated hands, deformed anatomy, " +
  "sand from mouth, particles from mouth, liquid from mouth, smoke from mouth, " +
  "sand from eyes, liquid from eyes, glowing eyes, supernatural aura, " +
  "body horror, melting skin, floating objects, disconnected limbs, " +
  "unstable motion, chaotic jitter, back of head, rear view of subject";

// ── Global style by niche ─────────────────────────────────────────────────────

function buildGlobalStyle(niche: string, aspectRatio: string): GlobalStyle {
  const nicheSettings = getNicheSettings(niche);
  return {
    visual_style:    nicheSettings.imagePromptPrefix.split(".")[0] ?? "cinematic realism",
    lighting:        nicheSettings.cinemaStyle,
    color_grade:     "teal orange cinematic grade, film-look",
    fps:             24,
    aspect_ratio:    aspectRatio,
    camera_language: "slow cinematic tracking, shallow depth of field, subtle motion",
  };
}

// ── Claude scene graph compiler ───────────────────────────────────────────────

async function callClaudeCompiler(
  input: CompilerInput,
  sceneCount: number,
  nicheSettings: ReturnType<typeof getNicheSettings>,
  brandMemory?: BrandMemory,
  storyMemory?: StoryMemory,
): Promise<SceneNode[]> {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const characterAppearance = input.characterRef?.trim()
    || input.concept.trim().split(/[.!?]/)[0].trim()
    || "Caucasian person, natural-looking, realistic";

  // ── Layer 1: Brand Memory injection ─────────────────────────────────────────
  const brandBlock = brandMemory ? buildBrandMemoryInjection(brandMemory) : "";

  // ── Layer 2: Story Memory injection ──────────────────────────────────────────
  const storyBlock = storyMemory ? buildStoryMemoryInjection(storyMemory) : "";

  const memoryPreamble = [brandBlock, storyBlock].filter(Boolean).join("\n\n");

  const systemPrompt = `You are Omnyra's Scene Compiler — a visual director that converts scripts into a deterministic scene graph.

Your output is a JSON scene graph used directly by video render pipelines (Flux Dev for images, Kling for video).
Every field you write becomes a machine instruction. Be precise, specific, and visually concrete.

${memoryPreamble ? `=== INJECTED MEMORY LAYERS (MANDATORY — override nothing here) ===\n${memoryPreamble}\n=== END MEMORY LAYERS ===\n` : ""}
SCENE STRUCTURE — always output exactly ${sceneCount} scenes in this order:
${NARRATIVE_ROLES.slice(0, sceneCount).map((role, i) => `  Scene ${i + 1}: "${role}" — ${narrativeRoleDescription(role)}`).join("\n")}

SHOT DIVERSITY — each scene MUST use a different shot distance:
${SHOT_PROGRESSION.slice(0, sceneCount).map((shot, i) => `  Scene ${i + 1}: ${shot}`).join("\n")}

CHARACTER RULES:
- Primary character: ${characterAppearance}
- Maintain identical appearance across all scenes (wardrobe_lock: true)
- Subject always faces the camera — never show back of head
- One subject unless script explicitly describes two people

ENVIRONMENT:
- Include: ${nicheSettings.environmentInclude || "setting appropriate to script"}
- Exclude: ${nicheSettings.environmentExclude || "nothing specific"}

IMAGE PROMPT RULES (used by Flux Dev — must follow prompts precisely):
- 35–55 words per image_prompt
- Begin with the shot type: e.g. "Wide shot —" or "Close-up —"
- Describe the EXACT action from that story beat — no generic substitutes
- Include lighting from global_style
- End with: "photorealistic, cinematic, front-facing subject"
- NEVER describe particles/smoke/liquid from face/mouth/eyes
- NEVER describe supernatural effects, glowing eyes, magical auras

VIDEO PROMPT RULES (used by Kling i2v — motion instructions):
- 20–35 words per video_prompt
- Describe the MOTION only — what physically moves, how, at what speed
- Reference: "${nicheSettings.videoPromptPrefix.substring(0, 120)}"
- Include camera movement from the scene's camera spec
- NO static descriptions — every word must imply motion

CONTINUITY RULES:
- Scene 1: uses_previous_frame: false
- Scenes 2–${sceneCount}: uses_previous_frame: true, frame_anchor_strength: "high"
- All scenes share the same seed_lock value (pick a random 5-digit number, use it consistently)
- For scenes 2+: transition_instruction must describe pose continuation from prior scene's end

OUTPUT: valid JSON only. No markdown. No explanation.
{
  "scenes": [
    {
      "scene_id": "scene_01",
      "timing": { "start": 0, "end": 10, "duration": 10 },
      "narrative_role": "hook",
      "character_state": {
        "primary_character_id": "char_001",
        "emotion": "string",
        "action_state": "string",
        "wardrobe_lock": true
      },
      "environment": {
        "location": "string",
        "weather": "string",
        "key_objects": ["string"]
      },
      "camera": {
        "shot_type": "wide shot",
        "movement": "string",
        "position_lock": true,
        "transition_anchor": "string"
      },
      "motion_brush_instructions": ["string"],
      "dialogue": { "text": "", "voice_style": "none", "sync_required": false },
      "continuity": {
        "uses_previous_frame": false,
        "frame_anchor_strength": "high",
        "seed_lock": 12345
      },
      "image_prompt": "string",
      "video_prompt": "string",
      "negative_prompt": "string"
    }
  ]
}`;

  const userMessage = `Script: ${input.script.trim()}

Concept: ${input.concept}${input.hook ? `\nHook: ${input.hook}` : ""}${input.targetAudience ? `\nTarget audience: ${input.targetAudience}` : ""}

Generate exactly ${sceneCount} scenes. Each scene must visually match a DIFFERENT beat of this script. Different shot distances, different actions, different emotional expressions. The 4 scenes together should tell the complete story of the script.`;

  const res = await anthropic.messages.create({
    model:      "claude-sonnet-4-6",
    max_tokens: 2400,
    system:     systemPrompt,
    messages:   [{ role: "user", content: userMessage }],
  });

  const raw = res.content[0]?.type === "text" ? res.content[0].text : "";
  const start = raw.indexOf("{");
  const end   = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("[SCENE_COMPILER] Claude returned no JSON");

  const parsed = JSON.parse(raw.slice(start, end + 1)) as { scenes?: unknown[] };
  if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
    throw new Error("[SCENE_COMPILER] Claude returned empty scene graph");
  }

  return parsed.scenes as SceneNode[];
}

function narrativeRoleDescription(role: NarrativeRole): string {
  switch (role) {
    case "hook":        return "grabbing opening moment that matches script's first beat";
    case "development": return "building the middle — key action or teaching point";
    case "climax":      return "most dramatic or emotionally intense moment";
    case "resolution":  return "payoff, closing emotion, or call to action";
  }
}

// ── Character bank builder ────────────────────────────────────────────────────

function buildCharacterBank(input: CompilerInput): Character[] {
  const appearance = input.characterRef?.trim()
    || input.concept.trim().split(/[.!?]/)[0].trim()
    || "Caucasian person, natural-looking";

  const characters: Character[] = [{
    character_id:     "char_001",
    name:             "Protagonist",
    reference_images: input.referenceImages ?? [],
    appearance_lock:  appearance,
    emotion_default:  "neutral",
  }];

  // Add second character if concept mentions two people
  const COUPLE_RE = /\b(couple|two people|together|partner|walking with|holding hands|helper|young man|elderly|companion)\b/i;
  if (COUPLE_RE.test(input.script) || COUPLE_RE.test(input.concept)) {
    characters.push({
      character_id:     "char_002",
      name:             "Supporting Character",
      reference_images: [],
      appearance_lock:  "natural-looking secondary character, complementary styling",
      emotion_default:  "warm",
    });
  }

  return characters;
}

// ── Fallback scene graph ──────────────────────────────────────────────────────

function buildFallbackScenes(
  input: CompilerInput,
  sceneCount: number,
  nicheSettings: ReturnType<typeof getNicheSettings>,
): SceneNode[] {
  const seed = Math.floor(10000 + Math.random() * 89999);
  const roles = NARRATIVE_ROLES.slice(0, sceneCount);
  const shots  = SHOT_PROGRESSION.slice(0, sceneCount);
  const characterAppearance = input.characterRef?.trim() || "Caucasian person, realistic";

  return roles.map((role, i) => ({
    scene_id:   `scene_0${i + 1}`,
    timing:     { start: i * 10, end: (i + 1) * 10, duration: 10 },
    narrative_role: role,
    character_state: {
      primary_character_id: "char_001",
      emotion:      i === 0 ? "focused" : i === sceneCount - 1 ? "resolved" : "engaged",
      action_state: `natural ${role} pose`,
      wardrobe_lock: true,
    },
    environment: {
      location:    nicheSettings.environmentInclude?.split(",")[0] ?? "appropriate setting",
      weather:     "clear natural light",
      key_objects: [],
    },
    camera: {
      shot_type:     shots[i],
      movement:      i === 0 ? "slow push-in" : i === sceneCount - 1 ? "slow pull-back" : "static",
      position_lock: true,
    },
    motion_brush_instructions: ["subtle natural body motion", "slight head movement"],
    dialogue:    { text: "", voice_style: "none", sync_required: false },
    continuity: {
      uses_previous_frame:   i > 0,
      frame_anchor_strength: i > 0 ? "high" : "none" as FrameAnchorStrength,
      seed_lock:             seed,
    },
    image_prompt:    `${shots[i]} — ${characterAppearance} in ${nicheSettings.environmentInclude?.split(",")[0] ?? "natural setting"}, ${role} moment, ${nicheSettings.cinemaStyle}, photorealistic, cinematic, front-facing subject`,
    video_prompt:    `${nicheSettings.videoPromptPrefix} Natural forward motion, ${shots[i]} camera ${i === 0 ? "pushing in slowly" : "holding steady"}.`,
    negative_prompt: COMPILER_NEGATIVE_BASE + ", " + (nicheSettings.negativePrompt ?? ""),
  }));
}

// ── Main export ───────────────────────────────────────────────────────────────

/** Use Agent Swarm when ENABLE_AGENT_SWARM=true in env, otherwise fallback to direct Claude call */
const USE_SWARM = process.env.ENABLE_AGENT_SWARM === "true";

/** Convert Agent Swarm output (PlannedScene + CompiledScenePrompts) into SceneNode[] */
async function buildScenesFromSwarm(
  input: CompilerInput,
  sceneCount: number,
  nicheSettings: ReturnType<typeof getNicheSettings>,
): Promise<SceneNode[]> {
  const characterAppearance = input.characterRef?.trim()
    || input.concept.trim().split(/[.!?]/)[0].trim()
    || "Caucasian person, natural-looking, realistic";

  const swarm = await runAgentSwarm({
    script:               input.script,
    concept:              input.concept,
    niche:                input.niche ?? "lifestyle",
    hook:                 input.hook,
    targetAudience:       input.targetAudience,
    characterDescription: characterAppearance,
    brandMemory:          input.brandMemory ?? null,
    sceneCount,
  });

  const seed = Math.floor(10000 + Math.random() * 89999);

  return swarm.plan.scenes.map((planned, i) => {
    const compiled = swarm.prompts[i];
    const cinSpec  = swarm.cinematography[i];
    return {
      scene_id:   `scene_0${i + 1}`,
      timing:     { start: i * planned.duration_secs, end: (i + 1) * planned.duration_secs, duration: planned.duration_secs },
      narrative_role: planned.narrative_role,
      character_state: {
        primary_character_id: "char_001",
        emotion:      swarm.emotions[i]?.emotion ?? "neutral",
        action_state: planned.emotional_beat,
        wardrobe_lock: true,
      },
      environment: {
        location:    nicheSettings.environmentInclude?.split(",")[0] ?? "appropriate setting",
        weather:     "natural light",
        key_objects: [],
      },
      camera: {
        shot_type:     cinSpec?.shot_type ?? SHOT_PROGRESSION[i % 4],
        movement:      cinSpec?.movement ?? "static",
        position_lock: true,
        transition_anchor: planned.transition_in,
      },
      motion_brush_instructions: [`${cinSpec?.movement ?? "subtle motion"}`],
      dialogue:    { text: "", voice_style: "none", sync_required: false },
      continuity: {
        uses_previous_frame:   planned.continues_from_previous,
        frame_anchor_strength: planned.continues_from_previous ? "high" as FrameAnchorStrength : "none" as FrameAnchorStrength,
        seed_lock:             seed,
        transition_instruction: planned.continues_from_previous ? `Continue from previous scene — ${planned.transition_in}` : undefined,
      },
      image_prompt:    compiled?.image_prompt ?? `${cinSpec?.shot_type ?? "medium shot"} — ${characterAppearance} in ${nicheSettings.environmentInclude?.split(",")[0] ?? "natural setting"}, photorealistic cinematic`,
      video_prompt:    compiled?.video_prompt ?? nicheSettings.videoPromptPrefix,
      negative_prompt: compiled?.negative_prompt ?? COMPILER_NEGATIVE_BASE,
    } as SceneNode;
  });
}

export async function compileSceneGraph(input: CompilerInput): Promise<SceneCompilerProject> {
  const sceneCount  = input.sceneCount ?? 4;
  const niche       = input.niche ?? "lifestyle";
  const aspectRatio = input.aspectRatio ?? "9:16";
  const nicheSettings = getNicheSettings(niche);

  console.log(`[SCENE_COMPILER] compiling project niche=${niche} scenes=${sceneCount} swarm=${USE_SWARM}`);

  const sceneBuilder = USE_SWARM
    ? buildScenesFromSwarm(input, sceneCount, nicheSettings).catch(err => {
        console.warn(`[SCENE_COMPILER] Swarm failed, falling back to Claude: ${(err as Error).message}`);
        return callClaudeCompiler(input, sceneCount, nicheSettings, input.brandMemory, input.storyMemory);
      })
    : callClaudeCompiler(input, sceneCount, nicheSettings, input.brandMemory, input.storyMemory).catch(err => {
        console.warn(`[SCENE_COMPILER] Claude failed, using fallback: ${(err as Error).message}`);
        return buildFallbackScenes(input, sceneCount, nicheSettings);
      });

  const [characterBank, rawScenes] = await Promise.all([
    Promise.resolve(buildCharacterBank(input)),
    sceneBuilder,
  ]);

  // Ensure we have exactly sceneCount scenes
  const scenes = rawScenes.slice(0, sceneCount);
  while (scenes.length < sceneCount) {
    scenes.push(...buildFallbackScenes(input, sceneCount - scenes.length, nicheSettings));
  }

  // Normalise negative_prompt on every scene — merge with niche base
  const nicheNeg = nicheSettings.negativePrompt ?? "";
  for (const scene of scenes) {
    if (!scene.negative_prompt || scene.negative_prompt.trim().length < 10) {
      scene.negative_prompt = COMPILER_NEGATIVE_BASE + (nicheNeg ? ", " + nicheNeg : "");
    }
  }

  const project: SceneCompilerProject = {
    project_id:       `proj_${Date.now()}`,
    title:            input.concept.slice(0, 60),
    niche,
    global_style:     buildGlobalStyle(niche, aspectRatio),
    character_bank:   characterBank,
    scene_graph:      scenes,
    compiled_at:      new Date().toISOString(),
    compiler_version: COMPILER_VERSION,
  };

  console.log(`[SCENE_COMPILER] compiled ${scenes.length} scenes for "${project.title}"`);
  scenes.forEach((s, i) =>
    console.log(`[SCENE_COMPILER] scene_${i + 1} role=${s.narrative_role} shot=${s.camera?.shot_type} img="${s.image_prompt?.substring(0, 80)}"`),
  );

  return project;
}

// ── Runtime helpers used by video pipeline ────────────────────────────────────

/** Attach last-frame URL from prior clip into the next scene's continuity block */
export function attachLastFrame(
  project: SceneCompilerProject,
  sceneIndex: number,
  lastFrameUrl: string,
): void {
  const scene = project.scene_graph[sceneIndex];
  if (scene) {
    scene.continuity.last_frame_url   = lastFrameUrl;
    scene.continuity.uses_previous_frame = true;
    if (scene.continuity.frame_anchor_strength === "none") {
      scene.continuity.frame_anchor_strength = "high";
    }
  }
}

/** Build the full Kling video prompt from a scene node */
export function buildKlingPromptFromScene(
  scene: SceneNode,
  project: SceneCompilerProject,
): string {
  const globalStyle  = project.global_style;
  const charState    = scene.character_state;
  const continuityNote = scene.continuity.uses_previous_frame && scene.continuity.transition_instruction
    ? `Continue from previous frame: ${scene.continuity.transition_instruction}. `
    : "";

  return [
    continuityNote,
    scene.video_prompt,
    `Character: ${charState.emotion} expression, ${charState.action_state}.`,
    `${scene.camera.movement}.`,
    globalStyle.lighting + ".",
  ].filter(Boolean).join(" ").slice(0, 2500);
}

/** Build the full Flux image prompt from a scene node */
export function buildFluxPromptFromScene(
  scene: SceneNode,
  project: SceneCompilerProject,
): string {
  const char = project.character_bank.find(c => c.character_id === scene.character_state.primary_character_id);
  const appearance = char?.appearance_lock ?? "";
  const COMPACT_SAFETY =
    "No text or writing anywhere. Subject facing camera. Photorealistic. Clean anatomy. " +
    "No particles from mouth. No sand or liquid from face. No supernatural effects.";

  return [
    scene.image_prompt,
    appearance ? `Character: ${appearance}.` : "",
    COMPACT_SAFETY,
  ].filter(Boolean).join(" ").slice(0, 3000);
}
