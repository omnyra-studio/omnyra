/**
 * Agent Swarm Orchestrator
 *
 * Executes the 5-agent pipeline:
 *   Director → Scene Planner → [Cinematography ‖ Emotion Engine] → Prompt Compiler
 *
 * Flow:
 *   1. Director:       defines tone, arc, intent           (sequential — others depend on it)
 *   2. Scene Planner:  breaks into scenes                  (sequential — Cinematography depends on it)
 *   3. Cinematography + Emotion Engine:  run in parallel   (independent given planner output)
 *   4. Prompt Compiler: one per scene, parallel            (final synthesis)
 *
 * Returns a fully compiled SceneCompilerProject-compatible structure.
 */

import { runDirectorAgent, type DirectorOutput } from "./director";
import { runScenePlannerAgent, type ScenePlannerOutput } from "./scene-planner";
import { runCinematographyAgent, type CinematographySpec } from "./cinematography";
import { runEmotionEngine, type EmotionBeat } from "./emotion-engine";
import { runPromptCompilerAgent, type CompiledScenePrompts } from "./prompt-compiler";
import { getNicheSettings } from "@/lib/config/nicheSettings";
import type { BrandMemory } from "@/lib/memory/brand-memory";

export interface SwarmInput {
  script:               string;
  concept:              string;
  niche:                string;
  hook?:                string;
  targetAudience?:      string;
  characterDescription: string;
  brandMemory:          BrandMemory | null;
  sceneCount:           number;
}

export interface SwarmResult {
  director:       DirectorOutput;
  plan:           ScenePlannerOutput;
  cinematography: CinematographySpec[];
  emotions:       EmotionBeat[];
  prompts:        CompiledScenePrompts[];
  totalAgentMs:   number;
}

export async function runAgentSwarm(input: SwarmInput): Promise<SwarmResult> {
  const t0 = Date.now();
  const nicheSettings = getNicheSettings(input.niche);
  const envContext = nicheSettings.environmentInclude || "appropriate setting for the script";

  console.log(`[SWARM] starting — niche=${input.niche} scenes=${input.sceneCount}`);

  // ── Stage 1: Director ──────────────────────────────────────────────────────
  const director = await runDirectorAgent(input.script, input.concept, input.niche, input.hook);
  console.log(`[SWARM:DIRECTOR] arc="${director.emotional_arc}" tone="${director.tone}" pacing=${director.pacing}`);

  // ── Stage 2: Scene Planner ─────────────────────────────────────────────────
  const plan = await runScenePlannerAgent(input.script, director, input.sceneCount);
  console.log(`[SWARM:PLANNER] ${plan.scenes.length} scenes planned`);

  // ── Stage 3: Cinematography + Emotion Engine (parallel) ────────────────────
  const [cinematography, emotions] = await Promise.all([
    runCinematographyAgent(plan.scenes, director),
    Promise.resolve(runEmotionEngine(plan.scenes, director)),  // deterministic — no await needed
  ]);
  console.log(`[SWARM:CINE+EMOTION] specs for ${cinematography.length} scenes`);

  // ── Stage 4: Prompt Compiler (parallel per scene) ──────────────────────────
  const prompts = await Promise.all(
    plan.scenes.map((scene, i) => {
      const cinSpec    = cinematography[i] ?? cinematography[0];
      const emotionBeat = emotions[i]     ?? emotions[0];
      return runPromptCompilerAgent(
        scene,
        cinSpec,
        emotionBeat,
        director,
        input.brandMemory,
        input.characterDescription,
        envContext,
      );
    }),
  );
  console.log(`[SWARM:COMPILER] ${prompts.length} prompts compiled`);

  const totalAgentMs = Date.now() - t0;
  console.log(`[SWARM] complete in ${totalAgentMs}ms`);

  return { director, plan, cinematography, emotions, prompts, totalAgentMs };
}
