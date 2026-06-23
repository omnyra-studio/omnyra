import type { BrandMemoryV2, BrandCharacterV2 } from "@omnyra/continuity-engine";

/**
 * Brand store — constructs and validates BrandMemoryV2 from raw DB data.
 * The brand memory is IMMUTABLE once created — never mutated during a render run.
 */
export function buildBrandMemory(raw: {
  characters?: Array<{
    id?:              string;
    character_id?:    string;
    name?:            string;
    referenceImages?: string[];
    appearance_lock?: string;
    wardrobeLock?:    string;
    voiceId?:         string;
    lighting?:        string;
    colorGrade?:      string;
    cinematicStyle?:  string;
  }>;
  globalStyle?: {
    fps?:        number;
    lighting?:   string;
    colorGrade?: string;
  };
} | null): BrandMemoryV2 {
  const defaultChar: BrandCharacterV2 = {
    id:               "char_001",
    name:             "Protagonist",
    referenceImages:  [],
    appearanceLock:   { face: "Caucasian person, natural-looking", body: "", hair: "" },
    wardrobeLock:     { default: "" },
    voiceId:          "",
    styleProfile:     { lighting: "Roger Deakins golden hour", colorGrade: "teal orange cinematic", cinematicStyle: "cinematic realism" },
  };

  if (!raw?.characters?.length) {
    return {
      characters:  [defaultChar],
      globalStyle: { fps: 24, lighting: "Roger Deakins golden hour", colorGrade: "teal orange cinematic" },
    };
  }

  return {
    characters: raw.characters.map(c => ({
      id:              c.id ?? c.character_id ?? "char_001",
      name:            c.name ?? "Protagonist",
      referenceImages: c.referenceImages ?? [],
      appearanceLock: {
        face: c.appearance_lock ?? "",
        body: "",
        hair: "",
      },
      wardrobeLock:   { default: c.wardrobeLock ?? "" },
      voiceId:        c.voiceId ?? "",
      styleProfile: {
        lighting:       c.lighting        ?? "Roger Deakins golden hour",
        colorGrade:     c.colorGrade      ?? "teal orange cinematic",
        cinematicStyle: c.cinematicStyle  ?? "cinematic realism",
      },
    })),
    globalStyle: {
      fps:        (raw.globalStyle?.fps as 24 | 30) ?? 24,
      lighting:   raw.globalStyle?.lighting   ?? "Roger Deakins golden hour",
      colorGrade: raw.globalStyle?.colorGrade ?? "teal orange cinematic",
    },
  };
}

/** Build the appearance lock injection string for prompt injection */
export function buildAppearanceInjection(brand: BrandMemoryV2): string {
  return brand.characters.map(c =>
    `${c.name}: ${c.appearanceLock.face}${c.appearanceLock.body ? `, ${c.appearanceLock.body}` : ""}. ` +
    `Wardrobe: ${c.wardrobeLock.default || "consistent clothing"}.`,
  ).join("\n");
}
