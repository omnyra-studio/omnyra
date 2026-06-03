// Prompt AST — structured program, not freeform text.
// Prompts are compiled from this AST, never authored as raw strings.

export interface CharacterConstraints {
  identityLock: string[];       // traits that MUST remain constant
  forbiddenVariations: string[]; // traits that MUST NOT change
  enforcementStrength: number;  // 0.0-1.0
}

export interface EnvironmentConstraints {
  locationLock: string;
  lightingRules: string[];
  atmosphereLock?: string;
  allowedVariations: string[];
}

export interface MotionRules {
  humanMotion: number;   // 0-100 minimum
  envMotion: number;     // 0-100 minimum
  cameraMotion: number;  // 0-100 minimum
  cameraType?: string;
}

export interface StyleRules {
  visualStyle: string;
  colorPalette?: string[];
  aspectRatio: "9:16" | "16:9" | "1:1";
  qualityLevel: "draft" | "standard" | "cinematic";
}

export interface PromptAST {
  version: string;
  scene: string;
  sceneType: string;

  characterConstraints: CharacterConstraints | null;
  environmentConstraints: EnvironmentConstraints | null;
  motionRules: MotionRules;
  styleRules: StyleRules;

  objectConstraints: Array<{ name: string; count: number; required: boolean }>;
  negativeConstraints: string[];  // things the model MUST NOT generate
  priorityOrder: Array<keyof PromptAST>; // order matters for model bias
}

export function createDefaultAST(scene: string, sceneType: string): PromptAST {
  return {
    version: "v3.0",
    scene,
    sceneType,
    characterConstraints: null,
    environmentConstraints: null,
    motionRules: { humanMotion: 70, envMotion: 60, cameraMotion: 60 },
    styleRules: {
      visualStyle: "cinematic",
      aspectRatio: "9:16",
      qualityLevel: "cinematic",
    },
    objectConstraints: [],
    negativeConstraints: [],
    priorityOrder: ["characterConstraints", "environmentConstraints", "motionRules", "scene"],
  };
}

export function serializeAST(ast: PromptAST): string {
  const parts: string[] = [];

  // Scene base — highest priority
  parts.push(ast.scene);

  // Motion requirements
  parts.push(
    `human_motion≥${ast.motionRules.humanMotion}`,
    `env_motion≥${ast.motionRules.envMotion}`,
    `camera_motion≥${ast.motionRules.cameraMotion}`,
  );
  if (ast.motionRules.cameraType) parts.push(ast.motionRules.cameraType);

  // Style
  parts.push(ast.styleRules.visualStyle, ast.styleRules.qualityLevel, ast.styleRules.aspectRatio);

  // Character constraints (ordered by priority)
  if (ast.characterConstraints) {
    const c = ast.characterConstraints;
    if (c.identityLock.length) parts.push(`MAINTAIN EXACT CHARACTER: ${c.identityLock.join(", ")}.`);
    if (c.forbiddenVariations.length) parts.push(`NO: ${c.forbiddenVariations.join(", ")}.`);
  }

  // Environment constraints
  if (ast.environmentConstraints) {
    const e = ast.environmentConstraints;
    parts.push(`ENVIRONMENT: ${e.locationLock}.`);
    if (e.lightingRules.length) parts.push(`LIGHTING: ${e.lightingRules.join(", ")}.`);
  }

  // Object constraints
  if (ast.objectConstraints.length) {
    parts.push(`OBJECTS: ${ast.objectConstraints.map(o => `${o.count}x ${o.name}`).join(", ")}.`);
  }

  // Negative constraints — appended last
  if (ast.negativeConstraints.length) {
    parts.push(`NO ${ast.negativeConstraints.join(", NO ")}.`);
  }

  return parts.join(", ");
}
