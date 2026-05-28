import type { ModeConfig, OrchestratorMode } from "./types";

const STORYTIME: ModeConfig = {
  mode:                    "storytime",
  label:                   "TikTok Storytime",
  platform_default:        "tiktok",
  min_shots:               10,
  max_shots:               15,
  shot_density_multiplier: 1.1,  // slightly longer shots — story needs breathing room
  voiceover_style:         "narrative",
  allowed_content_types:   ["avatar", "broll", "text_overlay"],
  pacing_profile:          "slow",
  director_constraints: [
    "At least 30% of shots must use render_assignment='heygen' (avatar presence is mandatory).",
    "emotional_release attention function must appear at least once before the final CTA.",
    "trust_grounding must appear at least once in the middle third of the plan.",
    "Shot 1 must be pattern_interrupt. Never open with avatar.",
  ],
  director_brief_addendum: `
## Mode: Storytime / Narrative
This is a story-driven video. Emotional arc is the primary retention driver.
- Open with a vulnerable or surprising confession that creates immediate parasocial bond.
- Avatar shots (30–50%) maintain personal presence throughout the story.
- B-roll supports the story visually; it never competes with the narration.
- Emotional release is mandatory before the final CTA — the viewer must feel resolved.
- Pacing: slower build with emotional acceleration toward the climax.
- Transitions: prefer "fade" on emotional peaks, hard "cut" on story pivots.
`.trim(),
};

const INFLUENCER: ModeConfig = {
  mode:                    "influencer",
  label:                   "AI Influencer",
  platform_default:        "tiktok",
  min_shots:               8,
  max_shots:               12,
  shot_density_multiplier: 0.85, // faster — influencer content is punchy
  voiceover_style:         "direct",
  allowed_content_types:   ["avatar", "broll"],
  pacing_profile:          "fast",
  director_constraints: [
    "At least 40% of shots must use render_assignment='heygen' — the influencer IS the brand.",
    "No 'fade' transitions — use 'cut' or 'flash' only.",
    "Energy curve must stay at spike or ramp_up for at least 70% of shots.",
    "Shot 1 must be pattern_interrupt. Never open with avatar.",
  ],
  director_brief_addendum: `
## Mode: AI Influencer / Direct-to-Camera
High-energy influencer format. Speed and confidence above all.
- Avatar dominates (40–60% of shots) — the influencer persona IS the product.
- B-roll serves as visual punctuation only, not narrative scaffolding.
- Hook: bold, personally specific, or mildly controversial. No generic openers.
- Transitions: fast cuts only. Use "flash" on pattern_interrupt shots.
- Word density: upper range. Relentless momentum, no dead air.
`.trim(),
};

const PRODUCT_LAUNCH: ModeConfig = {
  mode:                    "product_launch",
  label:                   "Product Launch",
  platform_default:        "instagram_reels",
  min_shots:               10,
  max_shots:               14,
  shot_density_multiplier: 0.95,
  voiceover_style:         "advertising",
  allowed_content_types:   ["avatar", "broll", "text_overlay"],
  pacing_profile:          "medium",
  director_constraints: [
    "Shot 1 must show the product in motion — never a talking head.",
    "desire_activation must appear at least twice.",
    "trust_grounding must appear at least twice.",
    "urgency_trigger must appear in one of the last two shots.",
    "Avatar (heygen) shots limited to maximum 2 — only for founder or testimonial moments.",
  ],
  director_brief_addendum: `
## Mode: Product Launch / Advertising
Every frame earns its place by driving desire or trust. No filler.
- Open with product in action — never a person talking as shot 1.
- Feature reveals: extreme close-up framing with slow push-in camera move.
- Narration focuses on transformation and outcome, not feature lists.
- Aesthetic: premium, high contrast, teal-and-orange grade throughout.
- CTA must create urgency — scarcity or time pressure in the final shots.
`.trim(),
};

const GENERAL: ModeConfig = {
  mode:                    "general",
  label:                   "General / UGC Ad",
  platform_default:        "tiktok",
  min_shots:               8,
  max_shots:               15,
  shot_density_multiplier: 1.0,
  voiceover_style:         "conversational",
  allowed_content_types:   ["avatar", "broll", "text_overlay", "transition"],
  pacing_profile:          "medium",
  director_constraints: [
    "Shot 1 must be pattern_interrupt — never open with avatar.",
    "Include at least one pacing_reset in any plan with 10+ shots.",
  ],
  director_brief_addendum: `
## Mode: General / UGC Ad
Balanced format. Prioritise retention over aesthetic.
- Hook creates immediate curiosity or pattern interrupt.
- Standard attention arc: hook → build → payoff → CTA.
- Mix avatar and b-roll naturally based on content type.
`.trim(),
};

const MODE_MAP: Record<OrchestratorMode, ModeConfig> = {
  storytime:      STORYTIME,
  influencer:     INFLUENCER,
  product_launch: PRODUCT_LAUNCH,
  general:        GENERAL,
};

export function getModeConfig(mode: OrchestratorMode): ModeConfig {
  return MODE_MAP[mode] ?? GENERAL;
}

export const VALID_MODES = Object.keys(MODE_MAP) as OrchestratorMode[];
