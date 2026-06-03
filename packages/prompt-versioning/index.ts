// Prompt Versioning — immutable prompt registry.
// RULE: prompts are IMMUTABLE once released. New version = new folder.
// Backward compatibility required for 2 versions.

export interface PromptVersion {
  version: string;           // semver: "v3.2"
  releasedAt: number;
  deprecated: boolean;
  characterEnforcement: boolean;
  environmentEnforcement: boolean;
  styleLock: string;
  suffixRules: SuffixRule[];
  buildPrompt: (context: PromptContext) => string;
}

export interface SuffixRule {
  condition: (context: PromptContext) => boolean;
  suffix: string;
  enforcementLevel: "low" | "medium" | "high" | "strict";
}

export interface PromptContext {
  scene: string;
  sceneType: string;
  brandState: {
    hasCharacter: boolean;
    characterDesc?: string;
    environmentDesc?: string;
    objects?: Array<{ name: string; count: number }>;
  };
  motionRequirements?: {
    humanMotion: number;    // 0-100
    envMotion: number;      // 0-100
    cameraMotion: number;   // 0-100
  };
}

// ── Version registry ──────────────────────────────────────────────────────────

const registry = new Map<string, PromptVersion>();
const COMPATIBILITY_WINDOW = 2; // keep last N versions active

export function registerVersion(v: PromptVersion): void {
  registry.set(v.version, v);
}

export function getVersion(version: string): PromptVersion | null {
  return registry.get(version) ?? null;
}

export function getLatestVersion(): PromptVersion | null {
  let latest: PromptVersion | null = null;
  for (const v of registry.values()) {
    if (v.deprecated) continue;
    if (!latest || v.releasedAt > latest.releasedAt) latest = v;
  }
  return latest;
}

export function listActiveVersions(): PromptVersion[] {
  return Array.from(registry.values())
    .filter(v => !v.deprecated)
    .sort((a, b) => b.releasedAt - a.releasedAt)
    .slice(0, COMPATIBILITY_WINDOW);
}

export function deprecateVersion(version: string): void {
  const v = registry.get(version);
  if (v) v.deprecated = true;
}

// ── v1 — baseline cinematic motion prompt ────────────────────────────────────

registerVersion({
  version: "v1.0",
  releasedAt: new Date("2026-01-01").getTime(),
  deprecated: false,
  characterEnforcement: false,
  environmentEnforcement: false,
  styleLock: "cinematic_v1",
  suffixRules: [],
  buildPrompt: (ctx: PromptContext) => {
    return `${ctx.scene}, ultra realistic, cinematic, 9:16 portrait, professional photography`;
  },
});

// ── v2 — motion enforcement ───────────────────────────────────────────────────

registerVersion({
  version: "v2.0",
  releasedAt: new Date("2026-03-01").getTime(),
  deprecated: false,
  characterEnforcement: true,
  environmentEnforcement: true,
  styleLock: "cinematic_v2",
  suffixRules: [
    {
      condition: (ctx) => ctx.brandState.hasCharacter,
      suffix: " MAINTAIN EXACT CHARACTER APPEARANCE THROUGHOUT.",
      enforcementLevel: "high",
    },
    {
      condition: (ctx) => !!(ctx.motionRequirements && ctx.motionRequirements.humanMotion < 60),
      suffix: " ENSURE VISIBLE HUMAN MOVEMENT WITHIN FIRST 2 SECONDS.",
      enforcementLevel: "medium",
    },
  ],
  buildPrompt: (ctx: PromptContext) => {
    const motion = ctx.motionRequirements;
    const motionSuffix = motion
      ? `, human motion≥${motion.humanMotion}, env motion≥${motion.envMotion}, camera motion≥${motion.cameraMotion}`
      : "";
    let prompt = `${ctx.scene}${motionSuffix}, ultra realistic, cinematic, 9:16, photorealistic`;

    for (const rule of (getVersion("v2.0")?.suffixRules ?? [])) {
      if (rule.condition(ctx)) prompt += rule.suffix;
    }

    if (ctx.brandState.characterDesc) {
      prompt += ` MAINTAIN EXACT CHARACTER: ${ctx.brandState.characterDesc}.`;
    }
    if (ctx.brandState.environmentDesc) {
      prompt += ` MAINTAIN ENVIRONMENT: ${ctx.brandState.environmentDesc}.`;
    }
    return prompt;
  },
});

// ── v3 — strict continuity (current) ─────────────────────────────────────────

registerVersion({
  version: "v3.0",
  releasedAt: new Date("2026-06-01").getTime(),
  deprecated: false,
  characterEnforcement: true,
  environmentEnforcement: true,
  styleLock: "cinematic_v3",
  suffixRules: [
    {
      condition: (ctx) => ctx.brandState.hasCharacter,
      suffix: " STRICT CHARACTER LOCK: NO IDENTITY DRIFT PERMITTED.",
      enforcementLevel: "strict",
    },
    {
      condition: (ctx) => (ctx.brandState.objects?.length ?? 0) > 0,
      suffix: " MAINTAIN EXACT OBJECT COUNTS AND POSITIONS.",
      enforcementLevel: "high",
    },
  ],
  buildPrompt: (ctx: PromptContext) => {
    const v3 = getVersion("v3.0")!;
    const motion = ctx.motionRequirements;
    const motionSuffix = motion
      ? `, human_motion≥${motion.humanMotion}, env_motion≥${motion.envMotion}, camera_motion≥${motion.cameraMotion}`
      : "";

    let prompt = `${ctx.scene}${motionSuffix}, ultra realistic, cinematic 9:16, photorealistic, professional`;

    if (ctx.brandState.characterDesc) {
      prompt += ` MAINTAIN EXACT CHARACTER: ${ctx.brandState.characterDesc}.`;
    }
    if (ctx.brandState.environmentDesc) {
      prompt += ` MAINTAIN ENVIRONMENT: ${ctx.brandState.environmentDesc}.`;
    }
    if (ctx.brandState.objects?.length) {
      prompt += ` OBJECT COUNT: ${ctx.brandState.objects.map(o => `${o.count}x ${o.name}`).join(", ")}.`;
    }
    for (const rule of v3.suffixRules) {
      if (rule.condition(ctx)) prompt += rule.suffix;
    }
    return prompt;
  },
});

export function compilePrompt(context: PromptContext, version = "v3.0"): string {
  const v = getVersion(version) ?? getLatestVersion();
  if (!v) throw new Error("No prompt version available");
  return v.buildPrompt(context);
}
