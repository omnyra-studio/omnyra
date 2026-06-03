// Distribution Intelligence Engine
// Platform Abstraction Layer + Niche Intent Classifier + Audience Memory + Content Strategy Engine

// ── Platform Types ────────────────────────────────────────────────────────────

export type Platform = "tiktok" | "instagram_reels" | "youtube_shorts" | "youtube_longform" | "linkedin" | "twitter";

export type ContentGoal = "growth" | "engagement" | "virality" | "storytelling" | "authority" | "conversion";

// ── Niche Registry ────────────────────────────────────────────────────────────

export type NicheCategory =
  | "beauty_skincare"
  | "fitness_wellness"
  | "health_nutrition"
  | "psychology_mental_health"
  | "relationships_parenting"
  | "finance_investing"
  | "business_entrepreneurship"
  | "saas_tech_ai"
  | "education_productivity"
  | "entertainment_storytelling"
  | "gaming"
  | "travel_lifestyle"
  | "food_cooking"
  | "marketing_creator_economy"
  | "internet_culture_memes"
  | "sports_athletics"
  | "fashion"
  | "parenting"
  | "personal_development"
  | "real_estate"
  | "other";

// ── Content Intent Contract ───────────────────────────────────────────────────

export interface PlatformTarget {
  platform: Platform;
  primaryFormat: "short_form" | "long_form" | "story" | "live";
  audienceSize: "micro" | "mid" | "macro" | "mega";
}

export interface ContentIntentContract {
  userId: string;
  sessionId: string;
  platformTargets: PlatformTarget[];
  niche: NicheCategory;
  targetAudience: {
    demographics: string[];
    psychographics: string[];
    painPoints: string[];
  };
  pastWins: string[];           // previously successful angles or hooks
  competitors: string[];        // competing accounts/creators to differentiate from
  constraints: {
    maxHookWords: number;
    forbiddenTopics: string[];
    requiredTone: "professional" | "casual" | "educational" | "entertaining" | "inspirational" | "raw";
  };
  outputGoal: ContentGoal;
  topicInput: string;
}

// ── Platform Abstraction Layer ────────────────────────────────────────────────

export interface PlatformProfile {
  platform: Platform;
  dominantContentLength: "< 15s" | "15-30s" | "30-60s" | "60-180s" | "3-10min" | "10min+";
  peakEngagementTriggers: string[];
  algorithmWeights: {
    watchTime: number;
    saves: number;
    shares: number;
    comments: number;
    likes: number;
  };
  nativeFormats: string[];
  hookWindowSeconds: number; // seconds before user scrolls
}

const PLATFORM_PROFILES: Record<Platform, PlatformProfile> = {
  tiktok: {
    platform: "tiktok",
    dominantContentLength: "15-30s",
    peakEngagementTriggers: ["pattern interrupt", "emotional confession", "unexpected twist", "controversy"],
    algorithmWeights: { watchTime: 0.4, saves: 0.25, shares: 0.2, comments: 0.1, likes: 0.05 },
    nativeFormats: ["duet", "stitch", "trending_sound", "green_screen"],
    hookWindowSeconds: 2,
  },
  instagram_reels: {
    platform: "instagram_reels",
    dominantContentLength: "15-30s",
    peakEngagementTriggers: ["aesthetic", "relatability", "aspirational", "educational"],
    algorithmWeights: { watchTime: 0.35, saves: 0.3, shares: 0.2, comments: 0.1, likes: 0.05 },
    nativeFormats: ["collab", "remix", "trending_audio"],
    hookWindowSeconds: 3,
  },
  youtube_shorts: {
    platform: "youtube_shorts",
    dominantContentLength: "30-60s",
    peakEngagementTriggers: ["curiosity gap", "tutorial", "list format", "behind the scenes"],
    algorithmWeights: { watchTime: 0.45, saves: 0.15, shares: 0.2, comments: 0.15, likes: 0.05 },
    nativeFormats: ["voiceover", "text_overlay", "reaction"],
    hookWindowSeconds: 3,
  },
  youtube_longform: {
    platform: "youtube_longform",
    dominantContentLength: "10min+",
    peakEngagementTriggers: ["authority", "deep dive", "storytelling", "investigation"],
    algorithmWeights: { watchTime: 0.5, saves: 0.1, shares: 0.15, comments: 0.2, likes: 0.05 },
    nativeFormats: ["vlog", "documentary", "interview", "tutorial"],
    hookWindowSeconds: 30,
  },
  linkedin: {
    platform: "linkedin",
    dominantContentLength: "< 15s",
    peakEngagementTriggers: ["authority insight", "career lesson", "industry data", "personal story"],
    algorithmWeights: { watchTime: 0.2, saves: 0.15, shares: 0.35, comments: 0.25, likes: 0.05 },
    nativeFormats: ["carousel", "text_post", "document"],
    hookWindowSeconds: 5,
  },
  twitter: {
    platform: "twitter",
    dominantContentLength: "< 15s",
    peakEngagementTriggers: ["hot take", "data", "thread starter", "community reference"],
    algorithmWeights: { watchTime: 0.1, saves: 0.1, shares: 0.45, comments: 0.3, likes: 0.05 },
    nativeFormats: ["thread", "spaces", "poll"],
    hookWindowSeconds: 2,
  },
};

export function getPlatformProfile(platform: Platform): PlatformProfile {
  return PLATFORM_PROFILES[platform];
}

// ── Niche Intent Classifier ───────────────────────────────────────────────────

export function classifyNiche(topicInput: string): NicheCategory {
  const lower = topicInput.toLowerCase();

  const nicheMap: Array<[string[], NicheCategory]> = [
    [["beauty", "skincare", "makeup", "glow", "skin"], "beauty_skincare"],
    [["fitness", "gym", "workout", "muscle", "weight loss", "bodybuilding"], "fitness_wellness"],
    [["health", "nutrition", "diet", "food", "meal", "cooking", "recipe"], "health_nutrition"],
    [["psychology", "mental health", "anxiety", "therapy", "mindset"], "psychology_mental_health"],
    [["relationship", "dating", "marriage", "parenting", "family", "kids"], "relationships_parenting"],
    [["finance", "investing", "stocks", "money", "wealth", "budget"], "finance_investing"],
    [["business", "entrepreneur", "startup", "hustle", "side hustle"], "business_entrepreneurship"],
    [["saas", "software", "ai", "tech", "coding", "developer", "app"], "saas_tech_ai"],
    [["education", "productivity", "study", "learning", "course"], "education_productivity"],
    [["entertainment", "comedy", "story", "storytelling", "funny"], "entertainment_storytelling"],
    [["gaming", "game", "esports", "stream", "twitch"], "gaming"],
    [["travel", "lifestyle", "adventure", "vacation", "digital nomad"], "travel_lifestyle"],
    [["food", "restaurant", "chef", "baking", "cooking"], "food_cooking"],
    [["marketing", "content", "creator", "social media", "growth hacking"], "marketing_creator_economy"],
    [["meme", "culture", "viral", "trend", "internet"], "internet_culture_memes"],
    [["sports", "athlete", "training", "competition"], "sports_athletics"],
    [["fashion", "style", "outfit", "streetwear", "luxury"], "fashion"],
    [["personal development", "self improvement", "habits", "discipline"], "personal_development"],
    [["real estate", "property", "mortgage", "rent", "house"], "real_estate"],
  ];

  for (const [keywords, niche] of nicheMap) {
    if (keywords.some(kw => lower.includes(kw))) return niche;
  }

  return "other";
}

// ── Audience Memory Vector ────────────────────────────────────────────────────

export interface AudienceMemory {
  userId: string;
  niche: NicheCategory;
  highPerformingAngles: string[];
  failedAngles: string[];
  audienceResponsePattern: "emotional" | "educational" | "entertainment" | "aspirational";
  avgRetentionScore: number;
  lastUpdated: number;
}

const audienceMemoryStore = new Map<string, AudienceMemory>();

export function updateAudienceMemory(userId: string, angle: string, score: number): void {
  const existing = audienceMemoryStore.get(userId) ?? {
    userId,
    niche: "other",
    highPerformingAngles: [],
    failedAngles: [],
    audienceResponsePattern: "educational",
    avgRetentionScore: 50,
    lastUpdated: Date.now(),
  };

  if (score >= 70) {
    if (!existing.highPerformingAngles.includes(angle)) {
      existing.highPerformingAngles.push(angle);
    }
  } else if (score < 40) {
    if (!existing.failedAngles.includes(angle)) {
      existing.failedAngles.push(angle);
    }
  }

  const total = existing.avgRetentionScore + score;
  existing.avgRetentionScore = Math.round(total / 2);
  existing.lastUpdated = Date.now();

  audienceMemoryStore.set(userId, existing);
}

export function getAudienceMemory(userId: string): AudienceMemory | null {
  return audienceMemoryStore.get(userId) ?? null;
}

// ── Content Strategy Engine ───────────────────────────────────────────────────

export interface ContentStrategyRecommendation {
  primaryPlatform: Platform;
  recommendedFormats: string[];
  toneGuidance: string;
  differentiationAngle: string;
  audienceInsight: string;
}

export function buildContentStrategy(intent: ContentIntentContract): ContentStrategyRecommendation {
  const primaryTarget = intent.platformTargets[0];
  const primaryPlatform: Platform = primaryTarget?.platform ?? "tiktok";
  const profile = getPlatformProfile(primaryPlatform);

  const memory = getAudienceMemory(intent.userId);
  const differentiationAngle = intent.competitors.length
    ? `Differentiate from ${intent.competitors.slice(0, 2).join(", ")} by focusing on ${intent.targetAudience.painPoints[0] ?? "underserved angle"}`
    : `Lead with authentic ${intent.niche.replace(/_/g, " ")} perspective`;

  const audienceInsight = memory?.highPerformingAngles.length
    ? `Historical wins: ${memory.highPerformingAngles.slice(0, 2).join(", ")}`
    : `Target ${intent.targetAudience.demographics.join(", ")} — focus on ${intent.targetAudience.painPoints[0] ?? "core pain point"}`;

  return {
    primaryPlatform,
    recommendedFormats: profile.nativeFormats,
    toneGuidance: `${intent.constraints.requiredTone} tone — ${profile.peakEngagementTriggers[0]} as primary trigger`,
    differentiationAngle,
    audienceInsight,
  };
}
