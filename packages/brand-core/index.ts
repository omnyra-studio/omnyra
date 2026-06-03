// Brand Core — persistent identity state for all generation passes.
// This is the sole authority for character, environment, and object consistency.
// NO model calls live here — pure state CRUD + versioning.

export interface CharacterIdentity {
  gender?: string;
  ageRange?: string;
  physicalTraits: string[];
  hair?: string;
  clothingLock: string[];
  accessoriesLock: string[];
  forbiddenDrift: string[];
  raw: string;
}

export interface EnvironmentBible {
  locationType: string;
  timeOfDay: string;
  lightingRules: string[];
  keyElements: string[];
  spatialConstraints: string[];
  atmosphere: string;
  raw: string;
}

export interface ObjectRegistry {
  persistentObjects: Array<{ name: string; count: number; sceneAnchors: string[] }>;
}

export interface BrandStateContract {
  id: string;
  version: string;
  character: CharacterIdentity | null;
  environment: EnvironmentBible | null;
  objects: ObjectRegistry;
  hasCharacter: boolean;
  createdAt: number;
  updatedAt: number;
}

export function createEmptyBrandState(id: string): BrandStateContract {
  return {
    id,
    version: "1.0.0",
    character: null,
    environment: null,
    objects: { persistentObjects: [] },
    hasCharacter: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function bumpVersion(state: BrandStateContract): BrandStateContract {
  const parts = state.version.split(".").map(Number);
  parts[2] += 1;
  return { ...state, version: parts.join("."), updatedAt: Date.now() };
}

export function buildConsistencySuffix(state: BrandStateContract): string {
  const parts: string[] = [];

  if (state.character) {
    const c = state.character;
    const desc = c.raw || [c.gender, c.hair, c.clothingLock.join(", ")].filter(Boolean).join(", ");
    parts.push(`MAINTAIN EXACT CHARACTER: ${desc}.`);
    if (c.clothingLock.length) parts.push(`SAME CLOTHING: ${c.clothingLock.join(", ")}.`);
    if (c.accessoriesLock.length) parts.push(`SAME ACCESSORIES: ${c.accessoriesLock.join(", ")}.`);
    if (c.forbiddenDrift.length) parts.push(`FORBIDDEN DRIFT: ${c.forbiddenDrift.join(", ")}.`);
  }

  if (state.environment) {
    const e = state.environment;
    if (e.raw) parts.push(`MAINTAIN ENVIRONMENT: ${e.raw}.`);
    if (e.keyElements.length) parts.push(`KEEP ELEMENTS: ${e.keyElements.join(", ")}.`);
    if (e.lightingRules.length) parts.push(`LIGHTING: ${e.lightingRules.join(", ")}.`);
  }

  if (state.objects.persistentObjects.length) {
    const list = state.objects.persistentObjects.map(o => `${o.count}x ${o.name}`).join(", ");
    parts.push(`OBJECT COUNT: ${list}.`);
  }

  return parts.length ? " " + parts.join(" ") : "";
}

// Merge a partial state update (used by self-heal loop only)
export function mergeStateUpdate(
  base: BrandStateContract,
  patch: Partial<Pick<BrandStateContract, "character" | "environment" | "objects">>,
): BrandStateContract {
  return bumpVersion({ ...base, ...patch });
}
