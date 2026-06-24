/**
 * Default 30-second scene plans for each niche (3 scenes × 10s).
 *
 * These are used by the AI Director as a starting scaffold when the user
 * provides a minimal or generic concept. The Director can override any
 * scene if the concept warrants a custom structure.
 *
 * Format: [scene1_description, scene2_description, scene3_description]
 *
 * INTERNAL — never sent to the client.
 */

export type ScenePlan30s = [string, string, string];

export const SCENE_PLANS_30S: Record<string, ScenePlan30s> = {

  motivation: [
    "Person facing a challenge — hesitant, pausing at the crossroads. Golden hour light, emotional close-up.",
    "Moment of decision: first deliberate action taken. Body language shifts — shoulders back, eyes forward.",
    "Breakthrough and hopeful look forward. Triumph visible — slow push-in on face, sunlight breaking through.",
  ],

  "personal-finance-side-hustles": [
    "Current financial struggle made visible — bills, calculator, worried expression at home desk.",
    "Simple explanation of a key concept — hands gesture confidently over laptop, income chart visible.",
    "Vision of future financial freedom — calm confident expression, morning light, clean organized space.",
  ],

  fitness: [
    "Before state: tired, sedentary. Visible turning point — person looks up with quiet determination.",
    "Workout effort — controlled explosive movement, sweat, form, determination in a dramatic gym or outdoor setting.",
    "Strong transformation reveal — body language confident, golden hour light, before/after energy contrast.",
  ],

  "beauty-skincare": [
    "Skin concern close-up — person examining skin in mirror, soft morning light, authentic moment.",
    "Simple routine steps — precise serum application, smooth blending, gentle tapping. Extreme close-up on skin texture.",
    "Glowing final look reveal — radiant dewy skin, warm soft light, confident smile at camera.",
  ],

  "food-recipes": [
    "Fresh ingredients prepped on kitchen counter — vibrant colors, warm overhead light, anticipation.",
    "Quick cooking action — sizzle in pan, rhythmic chopping, steam rising. Dynamic close-ups.",
    "Final plated dish reveal — elegant presentation, golden light, close-up on texture and color.",
  ],

  "product-reviews": [
    "Unboxing hook — hands opening packaging with curiosity, product emerging into clean studio light.",
    "Key features demonstration — deliberate handling, turning product for camera, pointing to detail.",
    "Final honest verdict — reviewer faces camera directly, natural expression, product visible beside them.",
  ],

  "faceless-stoic": [
    "Challenge symbolism — silhouette alone at dusk, weight of a difficult moment, moody landscape.",
    "Inner resolve — slow deliberate forward walk, wind in coat, mist rolling. No face shown.",
    "Peaceful resolution — wide epic landscape reveal, lone figure at peace, golden accent light breaking through.",
  ],

  luxury: [
    "Beautiful location establishing shot — pristine luxury environment, golden hour through tall windows.",
    "Elegant moment — slow deliberate gesture, champagne glass, marble surface, shallow depth of field.",
    "Aspirational feeling payoff — person gazes outward with calm satisfaction, world-class view behind them.",
  ],

  "technology-ai": [
    "Problem made visible — frustrated expression at current limitation, ordinary environment.",
    "Tool demonstration — hands on interface, screen shows capability, neon-accented tech lighting.",
    "Future benefit revealed — calm confident face, technology working seamlessly, clean professional space.",
  ],

  relationships: [
    "Common relationship struggle — two people at distance, subtle tension visible, warm but muted light.",
    "Emotional connection moment — genuine eye contact, soft reach, conversation finding understanding.",
    "Hopeful resolution — both facing forward together, warm golden light, natural authentic smile.",
  ],

  "mental-health": [
    "Stress moment — overwhelmed expression, chaotic environment, shallow breathing visible.",
    "Simple calming practice — hands on chest, slow breath, eyes closing. Peaceful environment emerging.",
    "Peaceful resolution — serene face, soft morning light, calm body language. The weight has lifted.",
  ],

  gaming: [
    "Epic establishing shot of the game world — cinematic wide, dramatic in-game lighting.",
    "Dynamic gameplay highlight — intense hands on controller, fast reaction, strategy in action.",
    "Victory moment — triumphant expression, screen shows success, RGB glow, earned celebration.",
  ],

  "pet-care": [
    "Cute pet introduction — expressive animal face close-up, warm natural light, personality on display.",
    "Playful training or heartwarming interaction — joyful movement, tail wagging, human-animal bond.",
    "Sweet emotional conclusion — pet and owner together, soft warm light, quiet contentment.",
  ],

  "animation-3d": [
    "Character and world introduction — rich 3D environment reveal, expressive character design, cinematic wide.",
    "Small but meaningful action — squash-and-stretch movement, emotional facial expression, story beat.",
    "Emotional payoff — character reaches their moment, lighting swells, Deakins-inspired shadow and depth.",
  ],
};

/**
 * Returns the 30-second scene plan for a niche key.
 * Falls back to a generic motivational plan if the key is not found.
 */
export function getScenePlan30s(nicheKey: string): ScenePlan30s {
  return SCENE_PLANS_30S[nicheKey] ?? [
    "Compelling opening — character or situation established with emotional weight.",
    "Core moment — the key action, decision, or insight made visible.",
    "Resonant close — meaningful resolution, forward momentum, lingering feeling.",
  ];
}
