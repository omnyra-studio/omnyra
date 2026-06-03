// Prompt Compiler Engine — AST-based compilation pipeline.
// RAW PROMPT → PARSE → AST → APPLY CONSTRAINTS → EMIT VERSIONED PROMPT
// Rule: compiler is the sole author of production prompts.
// Humans define initial structure only. System defines evolution.

export type { PromptAST, CharacterConstraints, EnvironmentConstraints, MotionRules, StyleRules } from "./ast";
export { createDefaultAST, serializeAST } from "./ast";
export { mutatAST } from "./mutators";
export type { MutationType, DriftReport, MutationResult } from "./mutators";

import { createDefaultAST, serializeAST, type PromptAST } from "./ast";
import type { BrandStateContract } from "../brand-core";

export interface CompileOptions {
  promptVersion?: string;
  sceneType?: string;
  motionMinimums?: { human: number; env: number; camera: number };
}

export interface CompileResult {
  promptVersion: string;
  ast: PromptAST;
  compiledPrompt: string;
  suffixInjection: {
    enforcementLevel: "low" | "medium" | "high" | "strict";
    continuityLocks: string[];
  };
}

export function compileFromBrandState(
  rawScene: string,
  brandState: BrandStateContract,
  options: CompileOptions = {},
): CompileResult {
  const sceneType = options.sceneType ?? "lifestyle_broll";
  const version = options.promptVersion ?? "v3.0";
  const motion = options.motionMinimums ?? { human: 70, env: 60, camera: 60 };

  const ast = createDefaultAST(rawScene, sceneType);

  // Inject brand state into AST
  if (brandState.character) {
    ast.characterConstraints = {
      identityLock: [
        brandState.character.raw,
        ...brandState.character.clothingLock,
        ...brandState.character.accessoriesLock,
      ].filter(Boolean),
      forbiddenVariations: brandState.character.forbiddenDrift,
      enforcementStrength: 0.9,
    };
  }

  if (brandState.environment) {
    ast.environmentConstraints = {
      locationLock: brandState.environment.locationType,
      lightingRules: brandState.environment.lightingRules,
      atmosphereLock: brandState.environment.atmosphere,
      allowedVariations: [],
    };
  }

  if (brandState.objects.persistentObjects.length) {
    ast.objectConstraints = brandState.objects.persistentObjects.map(o => ({
      name: o.name,
      count: o.count,
      required: true,
    }));
  }

  ast.motionRules = {
    humanMotion: motion.human,
    envMotion: motion.env,
    cameraMotion: motion.camera,
  };

  const compiledPrompt = serializeAST(ast);

  const continuityLocks: string[] = [];
  if (brandState.character) continuityLocks.push("character_identity");
  if (brandState.environment) continuityLocks.push("environment");
  if (brandState.objects.persistentObjects.length) continuityLocks.push("objects");

  const enforcementLevel = continuityLocks.length >= 2 ? "strict"
    : continuityLocks.length === 1 ? "high"
    : "medium";

  return {
    promptVersion: version,
    ast,
    compiledPrompt,
    suffixInjection: { enforcementLevel, continuityLocks },
  };
}
