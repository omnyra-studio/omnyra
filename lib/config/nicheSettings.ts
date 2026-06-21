export type NicheSettings = {
  eraDetection:          boolean;
  imagePromptPrefix:     string;
  videoPromptPrefix:     string;
  ghostTestStrict:       boolean;
  defaultDuration:       number;
  lightningModeDefault:  boolean;
  negativePrompt:        string;
  cinemaStyle:           string;
};

export const NICHE_HIDDEN_SETTINGS: Record<string, NicheSettings> = {
  history: {
    eraDetection:          true,
    imagePromptPrefix:     "Period-accurate historical setting. No modern objects, fluorescent lighting, synthetic materials, or contemporary clothing.",
    videoPromptPrefix:     "Historically authentic. Era-accurate costume and environment.",
    ghostTestStrict:       true,
    defaultDuration:       10,
    lightningModeDefault:  false,
    negativePrompt:        "modern, contemporary, fluorescent light, plastic, synthetic, digital screen, smartphone, LED, neon",
    cinemaStyle:           "cinematic desaturated colour, film grain, natural candlelight or daylight only",
  },
  "tiktok-storytime": {
    eraDetection:          false,
    imagePromptPrefix:     "Contemporary setting, natural lighting, real and relatable everyday environment.",
    videoPromptPrefix:     "Natural human movement, relatable everyday setting.",
    ghostTestStrict:       true,
    defaultDuration:       8,
    lightningModeDefault:  true,
    negativePrompt:        "fantasy, sci-fi, unrealistic, studio lighting, heavily posed",
    cinemaStyle:           "handheld feel, shallow depth of field, golden hour or soft window light",
  },
  relationships: {
    eraDetection:          false,
    imagePromptPrefix:     "Intimate, warm, emotionally grounded setting. Real locations, soft natural light.",
    videoPromptPrefix:     "Slow deliberate movement, proximity between subjects, natural gesture.",
    ghostTestStrict:       true,
    defaultDuration:       10,
    lightningModeDefault:  true,
    negativePrompt:        "dramatic harsh lighting, fantasy, unrealistic, overly staged",
    cinemaStyle:           "warm tones, soft focus, natural indoor or outdoor light",
  },
  "self-improvement": {
    eraDetection:          false,
    imagePromptPrefix:     "Aspirational but grounded. Real person in real environment showing visible effort.",
    videoPromptPrefix:     "Purposeful physical movement, visible effort, forward momentum.",
    ghostTestStrict:       true,
    defaultDuration:       8,
    lightningModeDefault:  true,
    negativePrompt:        "fantasy, magic, unrealistic transformation, CGI",
    cinemaStyle:           "high contrast, sharp, motivational warm colour grade",
  },
  gaming: {
    eraDetection:          false,
    imagePromptPrefix:     "Gaming environment or reaction shot. Screen glow, natural desk setup.",
    videoPromptPrefix:     "Gaming energy, expressive reaction, screen-lit environment.",
    ghostTestStrict:       false,
    defaultDuration:       8,
    lightningModeDefault:  true,
    negativePrompt:        "fantasy world, outdoors, nature, historical",
    cinemaStyle:           "cool blue screen glow, high contrast, energetic framing",
  },
  "beauty-skincare": {
    eraDetection:          false,
    imagePromptPrefix:     "Clean, well-lit beauty setting. Soft studio or natural window light. Product clearly visible.",
    videoPromptPrefix:     "Close-up product application, gentle deliberate hand movements, clean aesthetic.",
    ghostTestStrict:       true,
    defaultDuration:       8,
    lightningModeDefault:  true,
    negativePrompt:        "harsh lighting, outdoor harsh sun, busy background, clutter",
    cinemaStyle:           "soft diffused light, pastel tones, clean white or neutral background",
  },
  spirituality: {
    eraDetection:          false,
    imagePromptPrefix:     "Serene, peaceful, sacred or nature setting. Warm or ethereal light.",
    videoPromptPrefix:     "Slow mindful movement, still contemplative posture, natural sacred space.",
    ghostTestStrict:       true,
    defaultDuration:       10,
    lightningModeDefault:  false,
    negativePrompt:        "busy, chaotic, urban noise, harsh lighting, commercial",
    cinemaStyle:           "golden soft light, shallow depth of field, gentle lens flare",
  },
  friendships: {
    eraDetection:          false,
    imagePromptPrefix:     "Casual social setting. Multiple people, genuine expression, natural light.",
    videoPromptPrefix:     "Genuine group interaction, laughter, natural social movement.",
    ghostTestStrict:       true,
    defaultDuration:       8,
    lightningModeDefault:  true,
    negativePrompt:        "staged, formal, business, solo only, stiff",
    cinemaStyle:           "warm candid tone, natural outdoor or cafe light, authentic feel",
  },
  lifestyle: {
    eraDetection:          false,
    imagePromptPrefix:     "Aspirational everyday moment. Real home, cafe, or outdoor setting.",
    videoPromptPrefix:     "Relaxed purposeful movement, daily ritual, natural environment.",
    ghostTestStrict:       true,
    defaultDuration:       8,
    lightningModeDefault:  true,
    negativePrompt:        "studio, artificial, overly staged, commercial",
    cinemaStyle:           "golden hour, warm tones, lifestyle editorial feel",
  },
  "viral-ugc": {
    eraDetection:          false,
    imagePromptPrefix:     "Real person in authentic everyday setting. Natural and unpolished.",
    videoPromptPrefix:     "Natural unscripted movement, genuine reaction, relatable setting.",
    ghostTestStrict:       true,
    defaultDuration:       6,
    lightningModeDefault:  true,
    negativePrompt:        "studio, professional shoot, artificial, overly posed",
    cinemaStyle:           "phone camera look, natural lighting, authentic grain",
  },
  finance: {
    eraDetection:          false,
    imagePromptPrefix:     "Professional or aspirational financial setting. Office, chart, city backdrop.",
    videoPromptPrefix:     "Confident deliberate movement, professional environment, focused expression.",
    ghostTestStrict:       true,
    defaultDuration:       8,
    lightningModeDefault:  true,
    negativePrompt:        "casual, messy, informal, fantasy",
    cinemaStyle:           "clean sharp tones, professional blue or neutral grade, crisp focus",
  },
  fitness: {
    eraDetection:          false,
    imagePromptPrefix:     "Gym, outdoor workout, or active setting. Dynamic movement, real body.",
    videoPromptPrefix:     "Athletic physical movement, visible exertion, gym or outdoor environment.",
    ghostTestStrict:       true,
    defaultDuration:       8,
    lightningModeDefault:  true,
    negativePrompt:        "sedentary, indoor casual, fantasy body",
    cinemaStyle:           "high contrast, saturated, energetic motion blur or freeze frame",
  },
  food: {
    eraDetection:          false,
    imagePromptPrefix:     "Food styling with natural light. Hero dish clearly visible, clean background.",
    videoPromptPrefix:     "Slow deliberate food preparation movement, close-up texture and steam.",
    ghostTestStrict:       true,
    defaultDuration:       8,
    lightningModeDefault:  true,
    negativePrompt:        "messy, poorly lit, blurry food, fast movement",
    cinemaStyle:           "warm natural light, macro focus, steam and texture detail",
  },
  travel: {
    eraDetection:          false,
    imagePromptPrefix:     "Scenic travel location, landmark or landscape. Golden hour preferred.",
    videoPromptPrefix:     "Exploratory movement through environment, wide cinematic establishing shot.",
    ghostTestStrict:       false,
    defaultDuration:       10,
    lightningModeDefault:  true,
    negativePrompt:        "indoor, office, city clutter, flat light",
    cinemaStyle:           "cinematic wide angle, golden hour, travel documentary colour grade",
  },
  parenting: {
    eraDetection:          false,
    imagePromptPrefix:     "Warm family home setting. Parent and child, natural light, genuine moment.",
    videoPromptPrefix:     "Gentle nurturing movement, child-adult interaction, home environment.",
    ghostTestStrict:       true,
    defaultDuration:       8,
    lightningModeDefault:  true,
    negativePrompt:        "staged, commercial, studio, harsh light",
    cinemaStyle:           "warm home tones, soft window light, intimate close-up",
  },
  business: {
    eraDetection:          false,
    imagePromptPrefix:     "Professional business setting. Modern office or meeting room, confident subject.",
    videoPromptPrefix:     "Confident professional movement, boardroom or office environment.",
    ghostTestStrict:       true,
    defaultDuration:       8,
    lightningModeDefault:  true,
    negativePrompt:        "casual, home, messy, unprofessional",
    cinemaStyle:           "clean sharp tones, professional grade, confident framing",
  },
  "mental-health": {
    eraDetection:          false,
    imagePromptPrefix:     "Calm, safe, emotionally resonant setting. Natural light, quiet environment.",
    videoPromptPrefix:     "Slow mindful movement, breathing visible, safe interior or nature.",
    ghostTestStrict:       true,
    defaultDuration:       10,
    lightningModeDefault:  false,
    negativePrompt:        "chaotic, busy, harsh, clinical, dramatic",
    cinemaStyle:           "soft warm tones, gentle natural light, shallow depth of field",
  },
  "true-crime": {
    eraDetection:          true,
    imagePromptPrefix:     "Dramatic documentary style. Period-accurate setting if historical. Dark or moody.",
    videoPromptPrefix:     "Documentary movement, cinematic suspense, period-accurate environment.",
    ghostTestStrict:       true,
    defaultDuration:       10,
    lightningModeDefault:  false,
    negativePrompt:        "cartoon, bright colours, fantasy, unrealistic",
    cinemaStyle:           "desaturated or high-contrast, film noir style, dramatic shadow",
  },
};

/**
 * Detect era/year from a script or prompt.
 * Returns the first found year or era label.
 */
export function detectEra(text: string): string | null {
  const yearMatch = text.match(/\b(1[89]\d{2}|20[01]\d)\b/);
  if (yearMatch) return yearMatch[1];

  const eraMap: Array<[RegExp, string]> = [
    [/\bd-day\b|world war (?:two|ii|2)\b/i,     "World War II, 1944"],
    [/\bworld war (?:one|i|1)\b/i,              "World War I, 1917"],
    [/\bvictorian\b/i,                          "Victorian era, 1880s"],
    [/\bmediev(?:al|eval)\b/i,                  "Medieval era"],
    [/\b(?:roaring\s+)?twenties\b/i,            "1920s"],
    [/\bcold war\b/i,                           "Cold War era, 1960s"],
    [/\bgreat depression\b/i,                   "Great Depression, 1930s"],
    [/\b(?:wild\s+)?west\b/i,                   "American Old West, 1880s"],
  ];

  for (const [re, label] of eraMap) {
    if (re.test(text)) return label;
  }

  return null;
}

export function getNicheSettings(niche: string | null | undefined): NicheSettings {
  if (!niche?.trim()) return NICHE_HIDDEN_SETTINGS["tiktok-storytime"];

  const raw = niche.toLowerCase().trim().replace(/\s+/g, "-");

  // 1. Direct match (exact key)
  if (NICHE_HIDDEN_SETTINGS[raw]) {
    console.log(`[NICHE_RESOLVED] input="${niche}" resolved="${raw}"`);
    return NICHE_HIDDEN_SETTINGS[raw];
  }

  // 2. Partial key match — any known key appears inside the niche string
  const keys = Object.keys(NICHE_HIDDEN_SETTINGS);
  const partialKey = keys.find(k => raw.includes(k));
  if (partialKey) {
    console.log(`[NICHE_RESOLVED] input="${niche}" resolved="${partialKey}" (partial)`);
    return NICHE_HIDDEN_SETTINGS[partialKey];
  }

  // 3. Keyword fallbacks for compound niche labels (e.g. "HISTORY, TRUE STORIES, DOCUMENTARY")
  const rawWords = niche.toLowerCase();
  if (/histor|documentary|true stor|war|soldier|ancient|medieval|victorian/.test(rawWords)) {
    console.log(`[NICHE_RESOLVED] input="${niche}" resolved="history" (keyword)`);
    return NICHE_HIDDEN_SETTINGS["history"];
  }
  if (/relation|love|couple|romance|dating|partner|marriage/.test(rawWords)) {
    console.log(`[NICHE_RESOLVED] input="${niche}" resolved="relationships" (keyword)`);
    return NICHE_HIDDEN_SETTINGS["relationships"];
  }
  if (/self.?improv|motivat|mindset|disciplin|personal.?dev/.test(rawWords)) {
    console.log(`[NICHE_RESOLVED] input="${niche}" resolved="self-improvement" (keyword)`);
    return NICHE_HIDDEN_SETTINGS["self-improvement"];
  }
  if (/tiktok|storytime|story time|viral/.test(rawWords)) {
    console.log(`[NICHE_RESOLVED] input="${niche}" resolved="tiktok-storytime" (keyword)`);
    return NICHE_HIDDEN_SETTINGS["tiktok-storytime"];
  }
  if (/true.crime|crime|murder|mystery/.test(rawWords)) {
    console.log(`[NICHE_RESOLVED] input="${niche}" resolved="true-crime" (keyword)`);
    return NICHE_HIDDEN_SETTINGS["true-crime"];
  }
  if (/mental.health|anxiety|depression|wellbeing|therapy/.test(rawWords)) {
    console.log(`[NICHE_RESOLVED] input="${niche}" resolved="mental-health" (keyword)`);
    return NICHE_HIDDEN_SETTINGS["mental-health"];
  }
  if (/fitness|gym|workout|exercise|training|weight/.test(rawWords)) {
    console.log(`[NICHE_RESOLVED] input="${niche}" resolved="fitness" (keyword)`);
    return NICHE_HIDDEN_SETTINGS["fitness"];
  }
  if (/finance|money|invest|wealth|budget|trading/.test(rawWords)) {
    console.log(`[NICHE_RESOLVED] input="${niche}" resolved="finance" (keyword)`);
    return NICHE_HIDDEN_SETTINGS["finance"];
  }
  if (/food|recipe|cook|eat|cuisine|restaurant/.test(rawWords)) {
    console.log(`[NICHE_RESOLVED] input="${niche}" resolved="food" (keyword)`);
    return NICHE_HIDDEN_SETTINGS["food"];
  }
  if (/travel|trip|adventure|explore|destination/.test(rawWords)) {
    console.log(`[NICHE_RESOLVED] input="${niche}" resolved="travel" (keyword)`);
    return NICHE_HIDDEN_SETTINGS["travel"];
  }
  if (/beauty|skincare|makeup|skin|glow|cosmetic/.test(rawWords)) {
    console.log(`[NICHE_RESOLVED] input="${niche}" resolved="beauty-skincare" (keyword)`);
    return NICHE_HIDDEN_SETTINGS["beauty-skincare"];
  }
  if (/gaming|game|stream|esport|playthrough/.test(rawWords)) {
    console.log(`[NICHE_RESOLVED] input="${niche}" resolved="gaming" (keyword)`);
    return NICHE_HIDDEN_SETTINGS["gaming"];
  }
  if (/spiritual|meditation|mindful|chakra|manifest|consciou/.test(rawWords)) {
    console.log(`[NICHE_RESOLVED] input="${niche}" resolved="spirituality" (keyword)`);
    return NICHE_HIDDEN_SETTINGS["spirituality"];
  }
  if (/parent|mom|dad|child|family|baby|toddler/.test(rawWords)) {
    console.log(`[NICHE_RESOLVED] input="${niche}" resolved="parenting" (keyword)`);
    return NICHE_HIDDEN_SETTINGS["parenting"];
  }
  if (/business|entrepreneur|startup|founder|brand|market/.test(rawWords)) {
    console.log(`[NICHE_RESOLVED] input="${niche}" resolved="business" (keyword)`);
    return NICHE_HIDDEN_SETTINGS["business"];
  }
  if (/lifestyle|life|daily|routine|vlog/.test(rawWords)) {
    console.log(`[NICHE_RESOLVED] input="${niche}" resolved="lifestyle" (keyword)`);
    return NICHE_HIDDEN_SETTINGS["lifestyle"];
  }
  if (/friend|social|togeth|bond|crew/.test(rawWords)) {
    console.log(`[NICHE_RESOLVED] input="${niche}" resolved="friendships" (keyword)`);
    return NICHE_HIDDEN_SETTINGS["friendships"];
  }

  // 4. Default
  console.log(`[NICHE_RESOLVED] input="${niche}" resolved="tiktok-storytime" (default)`);
  return NICHE_HIDDEN_SETTINGS["tiktok-storytime"];
}
