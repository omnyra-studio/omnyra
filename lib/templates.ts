/*  Omnyra template registry — v3 2026-06-23
 *  Internal prompts (video_prompt, negative_prompt, scene_structure) are NEVER
 *  sent to the client. Use toPublicTemplate() before any client-facing response.
 */

export interface SceneBlock {
  label: string;
  timing: string;
  camera: string;
}

export interface BriefField {
  id: string;
  label: string;
  placeholder: string;
}

export interface Template {
  id: string;
  name: string;
  description?: string;
  emoji: string;
  default_duration: number;
  default_energy: string;
  default_camera: string;
  default_style: string;
  apis: string[];
  brief_fields: BriefField[];
  hook_formula: string;
  script_persona: string;
  voiceover_template?: string;
  /** INTERNAL — never send to client */
  video_prompt?: string;
  /** INTERNAL — never send to client */
  negative_prompt?: string;
  /** INTERNAL — never send to client */
  scene_structure?: SceneBlock[];
  /**
   * INTERNAL — niche-specific reference image guidance.
   * Describes what images to collect for optimal Kling consistency.
   * Never send to client.
   */
  reference_guide?: string;
}

export type PublicTemplate = Omit<Template, 'video_prompt' | 'negative_prompt' | 'scene_structure' | 'reference_guide'>;

export function toPublicTemplate(t: Template): PublicTemplate {
  const { video_prompt: _vp, negative_prompt: _np, scene_structure: _ss, reference_guide: _rg, ...pub } = t;
  void _vp; void _np; void _ss; void _rg;
  return pub;
}

/**
 * Return the template's full Kling prompt.
 * Reference guidance (character + Deakins style) is already embedded per-template.
 * INTERNAL — only call server-side.
 */
export function buildTemplateVideoPrompt(template: Template): string {
  return template.video_prompt ?? '';
}

export const templates: Template[] = [

  // ─── 1. Motivation / Success ────────────────────────────────────────────────
  {
    id: "motivation",
    name: "Motivation / Success",
    description: "Overcome obstacles, achieve breakthrough. Built to inspire.",
    emoji: "🔥",
    default_duration: 60,
    default_energy: "High-energy",
    default_camera: "Tracking",
    default_style: "Cinematic",
    apis: ["elevenlabs", "kling"],
    brief_fields: [
      { id: "subject",   label: "Who is the subject?",    placeholder: "determined man, 30s, athletic build..." },
      { id: "struggle",  label: "What's the struggle?",   placeholder: "losing a job, hitting rock bottom..." },
      { id: "lesson",    label: "What's the lesson?",     placeholder: "daily discipline, consistency..." },
    ],
    hook_formula: "Hook (struggle) → Reveal (discipline) → Triumph",
    script_persona: "Inspirational narrator — declarative, urgent, warm",
    voiceover_template: "Have you ever felt stuck? [Share struggle]. The key is daily discipline and [lesson]. Every champion starts as a beginner. Your future self is counting on you — start today.",
    video_prompt: `Create a cinematic motivational video, 120-180 seconds, 4K.

Character references: Upload 4-5 images (front, side, full body, expressions).
Style references: Upload 2-3 Roger Deakins inspired images showing dramatic practical lighting, golden hour highlights, and high contrast shadows (Blade Runner 2049 or 1917 style). Perfectly match both character and Deakins lighting style throughout.

Subject: Determined 30-year-old athletic man in workout clothes, exact match to references.
Action: Overcomes obstacles with powerful emotional breakthrough.
Scene: Urban challenge to mountain sunrise.
Camera: Scene 1 (0-45s) slow tracking push-in. Scene 2 (45-110s) dynamic orbiting montage. Scene 3 (110-180s) empowering wide ascending shot.
Style: Inspirational cinematic realism, Deakins-style dramatic lighting, warm tones, realistic physics, perfect character consistency, natural lip sync.`,
    negative_prompt: "blur, unstable motion, facial warping, extra limbs, jitter, plastic skin",
    scene_structure: [
      { label: "Challenge",      timing: "0–45s",    camera: "slow forward tracking push-in" },
      { label: "Effort montage", timing: "45–110s",  camera: "dynamic orbiting" },
      { label: "Triumph",        timing: "110–180s", camera: "empowering wide ascending" },
    ],
    reference_guide: "4–5 images: neutral face, smiling/confident, side profile, full body standing, dynamic action pose (walking/running). Consistent outfit. Clear facial features and body type.",
  },

  // ─── 2. Personal Finance & Investing ────────────────────────────────────────
  {
    id: "finance",
    name: "Personal Finance & Investing",
    description: "Wealth-building journey with clear visual demonstrations.",
    emoji: "💰",
    default_duration: 60,
    default_energy: "Confident",
    default_camera: "Studio",
    default_style: "Cinematic",
    apis: ["elevenlabs", "kling"],
    brief_fields: [
      { id: "concept",  label: "What financial concept?",      placeholder: "compound interest, index funds, budgeting..." },
      { id: "audience", label: "Who's watching?",              placeholder: "20-somethings, new investors..." },
      { id: "outcome",  label: "What's the promised outcome?", placeholder: "retire at 40, pay off debt in 2 years..." },
    ],
    hook_formula: "Shocking stat → Problem framing → Step-by-step plan → Aspirational payoff",
    script_persona: "Trustworthy advisor — clear, no-jargon, practical",
    voiceover_template: "Most people stay broke because they never understand [concept]. Here's exactly how it works — and how you can use it to [outcome].",
    video_prompt: `Create a professional cinematic finance explainer, 120-180 seconds, 4K.

Character references: Upload 3-5 images.
Style references: Upload 2 Roger Deakins inspired clean professional lighting with controlled window light and subtle shadows.

Subject: Confident 35-year-old advisor.
Action: Clear wealth building explanation.
Scene: Modern office to aspirational future.
Camera: Steady push-ins and smooth orbits.
Style: Clean cinematic with Deakins naturalistic lighting and elegant color grading, perfect consistency.`,
    negative_prompt: "blur, chaotic charts, unstable motion, jitter",
    scene_structure: [
      { label: "Problem setup", timing: "0–40s",    camera: "steady wide push-in with chart overlays" },
      { label: "Explanation",   timing: "40–110s",  camera: "smooth orbiting" },
      { label: "Aspiration",    timing: "110–180s", camera: "tracking to freedom vision" },
    ],
    reference_guide: "4–5 images: neutral face, confident/smiling, side profile, full body in business attire, in-action (presenting/pointing). Consistent professional outfit. Sharp studio lighting.",
  },

  // ─── 3. Side Hustles & Money Making ─────────────────────────────────────────
  {
    id: "side-hustle",
    name: "Side Hustles & Money Making",
    description: "Step-by-step profitable hustle with real results shown.",
    emoji: "💻",
    default_duration: 45,
    default_energy: "High-energy",
    default_camera: "Handheld",
    default_style: "Cinematic",
    apis: ["elevenlabs", "kling"],
    brief_fields: [
      { id: "hustle", label: "What's the hustle?",       placeholder: "Etsy shop, video editing, UGC content..." },
      { id: "income", label: "Target monthly income?",   placeholder: "$1,000, $3,000..." },
      { id: "time",   label: "Time investment?",         placeholder: "2 hours/day, weekends only..." },
    ],
    hook_formula: "Income hook → 'No experience needed' → 3 steps → Get started CTA",
    script_persona: "Relatable entrepreneur — energetic, practical, encouraging",
    voiceover_template: "Want an extra [income] per month with no experience? This simple side hustle — [hustle] — is how I did it in [timeframe].",
    video_prompt: `Create a dynamic side hustle tutorial, 120-150 seconds, 4K.

Character references: Upload 4 images.
Style references: Upload 2 Roger Deakins style practical workspace lighting with warm productivity feel.

Subject: Relatable entrepreneur at home.
Action: Step-by-step demonstration.
Camera: Clear tracking and push shots.
Style: Energetic cinematic with Deakins lighting, high clarity, realistic motion.`,
    negative_prompt: "blur, messy, unstable motion, jitter",
    scene_structure: [
      { label: "Hook",         timing: "0–40s",    camera: "engaging wide push" },
      { label: "Step-by-step", timing: "40–100s",  camera: "close-up tracking" },
      { label: "Results",      timing: "100–150s", camera: "upward success tracking" },
    ],
    reference_guide: "4–5 images: neutral face, smiling/confident, side profile, full body at home desk, in-action typing/reviewing. Casual-professional home outfit. Natural indoor lighting.",
  },

  // ─── 4. Health & Fitness ─────────────────────────────────────────────────────
  {
    id: "fitness",
    name: "Health & Fitness",
    description: "Transformation arc. Form, effort, result. Built to motivate.",
    emoji: "💪",
    default_duration: 45,
    default_energy: "High-energy",
    default_camera: "Tracking",
    default_style: "Cinematic",
    apis: ["elevenlabs", "kling"],
    brief_fields: [
      { id: "goal",     label: "What's the fitness goal?",     placeholder: "lose 10kg, build muscle, run 5k..." },
      { id: "duration", label: "Transformation timeline?",     placeholder: "30 days, 90 days..." },
      { id: "method",   label: "What's the method?",           placeholder: "HIIT, strength training, calisthenics..." },
    ],
    hook_formula: "Before state → Effort montage → After reveal → Your turn CTA",
    script_persona: "Fitness coach — motivational, direct, no excuses",
    voiceover_template: "Day 1 vs Day [duration]. This is what consistency looks like. Here's the exact [method] that changed everything.",
    video_prompt: `Create a motivational fitness transformation, 120-180 seconds, 4K.

Character references: Upload 4-5 images.
Style references: Upload 2 Roger Deakins dramatic natural light athletic scenes with golden highlights.

Subject: Athletic person in workout gear.
Action: Proper form exercises.
Camera: Tracking workout montage + powerful reveals.
Style: Energetic cinematic with Deakins naturalistic lighting and sweat details.`,
    negative_prompt: "blur, bad form, facial warping, jitter",
    scene_structure: [
      { label: "Before state",   timing: "0–45s",    camera: "wide before with slow push" },
      { label: "Effort montage", timing: "45–120s",  camera: "side tracking" },
      { label: "After reveal",   timing: "120–180s", camera: "powerful orbit" },
    ],
    reference_guide: "4–5 images: neutral face, side profile, full body in workout gear, mid-exercise action pose, strong confident stance. Same outfit across all. Natural gym or outdoor lighting.",
  },

  // ─── 5. Beauty / Skincare / Makeup ──────────────────────────────────────────
  {
    id: "beauty",
    name: "Beauty / Skincare / Makeup",
    description: "Luxurious routine with visible transformation and glow.",
    emoji: "✨",
    default_duration: 45,
    default_energy: "Calm",
    default_camera: "Close-up",
    default_style: "Cinematic",
    apis: ["elevenlabs", "kling"],
    brief_fields: [
      { id: "product",  label: "What product or routine?", placeholder: "moisturizer, serum, full skincare routine..." },
      { id: "benefit",  label: "Key benefit?",             placeholder: "glass skin, clear pores, anti-aging..." },
      { id: "timeline", label: "Results in?",              placeholder: "7 days, 30 days..." },
    ],
    hook_formula: "Skin problem → Routine reveal → Before/after → 'Try it' CTA",
    script_persona: "Beauty expert — soft, trustworthy, aspirational",
    voiceover_template: "Want [benefit] in [timeline]? Follow this simple routine — and watch what happens to your skin.",
    video_prompt: `Create a luxurious beauty routine, 90-150 seconds, 4K.

Character references: Upload 4-5 images.
Style references: Upload 2 Roger Deakins soft flattering beauty lighting with gentle highlights.

Subject: Woman performing skincare/makeup.
Camera: Close-up orbiting and smooth tracking.
Style: Soft cinematic with Deakins skin lighting and glowing textures.`,
    negative_prompt: "blur, unnatural skin, facial warping",
    scene_structure: [
      { label: "Product showcase", timing: "0–40s",    camera: "close-up product push" },
      { label: "Application",      timing: "40–100s",  camera: "smooth orbiting" },
      { label: "Glow reveal",      timing: "100–150s", camera: "glowing wide" },
    ],
    reference_guide: "5 images: clean bare face (no makeup), half-makeup, full glam look, skin close-up (pores/texture), 3/4 angle with product. Consistent hair and lighting across all. Soft natural window light.",
  },

  // ─── 6. Food & Recipes ───────────────────────────────────────────────────────
  {
    id: "food",
    name: "Food & Recipes",
    description: "Mouth-watering recipe video. Steam. Texture. Reveal.",
    emoji: "🍽️",
    default_duration: 45,
    default_energy: "Calm",
    default_camera: "Close-up",
    default_style: "Cinematic",
    apis: ["elevenlabs", "kling"],
    brief_fields: [
      { id: "recipe", label: "What's the recipe?",  placeholder: "high-protein pasta, viral feta salad..." },
      { id: "time",   label: "Cook time?",          placeholder: "15 minutes, 5 minutes..." },
      { id: "angle",  label: "Hook angle?",         placeholder: "easiest meal ever, under $5, weight loss..." },
    ],
    hook_formula: "Time/result hook → Ingredient reveal → Cook process → Final money shot",
    script_persona: "Enthusiastic home cook — approachable, practical, sensory",
    voiceover_template: "[time]-minute [angle] dinner that tastes incredible. Three ingredients. Zero effort. Here's how.",
    video_prompt: `Create an appetizing recipe video, 90-150 seconds, 4K.

Style references: Upload 2-3 Roger Deakins warm practical kitchen lighting with rich food textures.

Subject: Fresh ingredients to finished dish.
Camera: Overhead + close-up tracking.
Style: Cinematic food photography with Deakins moody warm lighting and steam details.`,
    negative_prompt: "blur, melted food, jitter",
    scene_structure: [
      { label: "Ingredient hero", timing: "0–30s",    camera: "overhead display" },
      { label: "Cook process",    timing: "30–100s",  camera: "close-up tracking" },
      { label: "Dish reveal",     timing: "100–150s", camera: "slow orbit" },
    ],
    reference_guide: "Style references only: 3–4 appetizing plated dishes, ingredient close-ups, kitchen setup. If presenter: 3–4 hand/arm shots with consistent skin tone. Warm task lighting.",
  },

  // ─── 7. Product Reviews / Launches ──────────────────────────────────────────
  {
    id: "product-review",
    name: "Product Reviews / Launches",
    description: "Unboxing → demo → honest verdict. Crisp and premium.",
    emoji: "📦",
    default_duration: 60,
    default_energy: "Confident",
    default_camera: "Orbit",
    default_style: "Cinematic",
    apis: ["elevenlabs", "kling"],
    brief_fields: [
      { id: "product",  label: "What product?",     placeholder: "phone, skincare, gadget, software..." },
      { id: "verdict",  label: "Honest verdict?",   placeholder: "worth it, overrated, hidden gem..." },
      { id: "audience", label: "Who needs this?",   placeholder: "content creators, fitness people, students..." },
    ],
    hook_formula: "Bold verdict hook → Unboxing moment → Feature deep-dive → Final verdict",
    script_persona: "Honest reviewer — direct, credible, no fluff",
    voiceover_template: "I bought the [product] so you don't have to make the same mistake I almost did. Here's the honest truth after [duration] of testing.",
    video_prompt: `Create an honest product review, 120-180 seconds, 4K.

Style references: Upload 2 Roger Deakins clean studio lighting with elegant practical highlights.

Subject: Premium product.
Camera: Orbiting feature shots.
Style: Professional cinematic with Deakins crisp lighting and reflections.`,
    negative_prompt: "blur, floating product, jitter",
    scene_structure: [
      { label: "Unboxing",    timing: "0–40s",    camera: "unboxing push" },
      { label: "Feature demo", timing: "40–120s", camera: "orbiting" },
      { label: "Verdict",     timing: "120–180s", camera: "wide verdict" },
    ],
    reference_guide: "Product: 4+ angles (front, back, side, in-use). Optional presenter: 3–4 images in clean casual outfit, neutral face + confident expression. Crisp studio lighting.",
  },

  // ─── 8. Faceless Motivation / Stoic ─────────────────────────────────────────
  {
    id: "faceless-stoic",
    name: "Faceless Motivation / Stoic",
    description: "Voice + visual metaphors. No face required. Built for depth.",
    emoji: "🧠",
    default_duration: 60,
    default_energy: "Calm",
    default_camera: "Static",
    default_style: "Cinematic",
    apis: ["elevenlabs", "kling"],
    brief_fields: [
      { id: "theme",  label: "What's the theme?",  placeholder: "discipline, stoicism, solitude, purpose..." },
      { id: "hook",   label: "Opening line?",       placeholder: "The obstacle is the way..." },
      { id: "lesson", label: "Core lesson?",        placeholder: "embrace difficulty, control what you can..." },
    ],
    hook_formula: "Philosophical hook → 3 visual metaphors → Resolution beat → Memorable close",
    script_persona: "Stoic narrator — measured, declarative, cinematic pacing",
    voiceover_template: "The obstacle is the way. [Struggle]. [Lesson]. Most people run from discomfort — the few who embrace it become extraordinary.",
    video_prompt: `Create a faceless stoic motivation video, 120-180 seconds, 4K.

Style references: Upload 2-3 Roger Deakins moody epic landscape lighting with dramatic shadows (Blade Runner 2049 style).

Subject: Symbolic nature and objects.
Camera: Sweeping wide + slow tracking.
Style: Dark cinematic with powerful Deakins atmosphere.`,
    negative_prompt: "blur, unstable motion, jitter",
    scene_structure: [
      { label: "Epic establish",  timing: "0–50s",    camera: "sweeping wide" },
      { label: "Symbolic B-roll", timing: "50–120s",  camera: "slow tracking" },
      { label: "Resolution",      timing: "120–180s", camera: "ascending hopeful wide" },
    ],
    reference_guide: "Style references only (no faces): epic landscapes, symbolic objects (lone mountain, candle, clock, chess piece), dark moody cinematic stills. Color palette refs — deep charcoal, gold, blue-black.",
  },

  // ─── 9. Luxury Lifestyle ─────────────────────────────────────────────────────
  {
    id: "luxury-lifestyle",
    name: "Luxury Lifestyle",
    description: "Aspirational living. Cinematic, tasteful, elevated.",
    emoji: "🥂",
    default_duration: 45,
    default_energy: "Confident",
    default_camera: "Tracking",
    default_style: "Cinematic",
    apis: ["elevenlabs", "kling"],
    brief_fields: [
      { id: "lifestyle",   label: "Lifestyle element?",       placeholder: "morning routine, travel, wardrobe..." },
      { id: "aspiration",  label: "What do viewers want?",    placeholder: "freedom, taste, status..." },
      { id: "hook",        label: "Hook angle?",              placeholder: "habits of the wealthy, what money actually buys..." },
    ],
    hook_formula: "Aspirational visual hook → Reveal the detail → 'You can have this' beat → Soft CTA",
    script_persona: "Tasteful aspirational narrator — measured, confident, never crass",
    voiceover_template: "This is what [aspiration] actually looks like when you stop chasing — and start building.",
    video_prompt: `Create an aspirational luxury lifestyle video, 120-150 seconds, 4K.

Style references: Upload 2 Roger Deakins luxury interior and golden hour villa lighting.

Subject: Elegant individual.
Camera: Sweeping drone + smooth tracking.
Style: High-end cinematic with Deakins rich, dramatic lighting.`,
    negative_prompt: "blur, tacky, jitter",
    scene_structure: [
      { label: "Establish",  timing: "0–40s",    camera: "sweeping drone" },
      { label: "Routines",   timing: "40–100s",  camera: "smooth tracking" },
      { label: "Lifestyle",  timing: "100–150s", camera: "serene wide" },
    ],
    reference_guide: "4–5 images: elegant full-body outfit, relaxed confident expression, side profile, lifestyle pose (terrace/pool), close-up accessory/texture shot. Consistent premium wardrobe. Golden hour or soft studio lighting.",
  },

  // ─── 10. Technology & AI ─────────────────────────────────────────────────────
  {
    id: "technology-ai",
    name: "Technology & AI",
    description: "Explain, demonstrate, and future-cast. Clean and credible.",
    emoji: "🤖",
    default_duration: 45,
    default_energy: "Confident",
    default_camera: "Studio",
    default_style: "Cinematic",
    apis: ["elevenlabs", "kling"],
    brief_fields: [
      { id: "tool",     label: "What tool or concept?", placeholder: "Claude, GPT-4, automation, AI agents..." },
      { id: "use_case", label: "Use case?",             placeholder: "save 10 hours/week, replace your VA..." },
      { id: "audience", label: "Who's watching?",       placeholder: "founders, marketers, developers..." },
    ],
    hook_formula: "Time-saving hook → Tool reveal → Live demo → 'Try it now' CTA",
    script_persona: "Tech-savvy explainer — confident, practical, slight urgency",
    voiceover_template: "This AI tool just saved me [time]. Here's exactly how [tool] works — and why [audience] should be using it today.",
    video_prompt: `Create a futuristic tech explainer, 120-180 seconds, 4K.

Style references: Upload 2 Roger Deakins Blade Runner 2049 neon + practical tech lighting.

Subject: Modern professional with gadget.
Camera: Controlled orbits and push-ins.
Style: Sleek futuristic with Deakins cinematic lighting.`,
    negative_prompt: "blur, glitch, jitter",
    scene_structure: [
      { label: "Problem hook", timing: "0–40s",    camera: "clean push-in" },
      { label: "Demo",         timing: "40–120s",  camera: "controlled orbit" },
      { label: "Vision",       timing: "120–180s", camera: "visionary wide tracking" },
    ],
    reference_guide: "Product/tool: multiple angle shots + UI/screen screenshots. Optional presenter: 3–4 images in clean tech-casual outfit, confident neutral expression. Neutral studio or desk background.",
  },

  // ─── 11. Relationships / Dating ──────────────────────────────────────────────
  {
    id: "relationships",
    name: "Relationships & Psychology",
    description: "Emotional insight with human depth. Relatable and shareable.",
    emoji: "❤️",
    default_duration: 45,
    default_energy: "Intimate",
    default_camera: "Handheld",
    default_style: "Cinematic",
    apis: ["elevenlabs", "kling"],
    brief_fields: [
      { id: "topic",   label: "Topic?",              placeholder: "attachment styles, red flags, communication..." },
      { id: "insight", label: "Core insight?",       placeholder: "why you attract avoidants, the real reason you fight..." },
      { id: "audience", label: "Who's this for?",    placeholder: "people healing, dating, in relationships..." },
    ],
    hook_formula: "Relatable pain point → Psychological reframe → 'This is why' insight → Empowering close",
    script_persona: "Empathetic psychology explainer — warm, validating, gently challenging",
    voiceover_template: "If you've ever [pain point], this is exactly why it keeps happening — and what [insight] actually means for your relationships.",
    video_prompt: `Create a heartfelt relationship advice video, 120-150 seconds, 4K.

Style references: Upload 2 Roger Deakins warm intimate lighting for emotional scenes.

Subject: Warm couple.
Camera: Gentle tracking shots.
Style: Warm cinematic with Deakins soft emotional lighting.`,
    negative_prompt: "blur, dramatic warping, jitter",
    scene_structure: [
      { label: "Establish",   timing: "0–40s",    camera: "gentle establishing" },
      { label: "Interaction", timing: "40–100s",  camera: "smooth intimate tracking" },
      { label: "Resolution",  timing: "100–150s", camera: "warm wide" },
    ],
    reference_guide: "Couple: together + individual shots, warm natural expressions. Solo presenter: 3–4 images, warm candid expressions. Consistent casual warm outfits. Natural indoor or café lighting.",
  },

  // ─── 12. Mental Health & Mindfulness ─────────────────────────────────────────
  {
    id: "mental-health",
    name: "Mental Health & Mindfulness",
    description: "Calming, grounding content. Safe, clear, human.",
    emoji: "🧘",
    default_duration: 45,
    default_energy: "Calm",
    default_camera: "Static",
    default_style: "Cinematic",
    apis: ["elevenlabs", "kling"],
    brief_fields: [
      { id: "topic",    label: "Topic?",               placeholder: "anxiety, burnout, self-worth, boundaries..." },
      { id: "practice", label: "Grounding practice?",  placeholder: "breathing, journaling, body scan..." },
      { id: "audience", label: "Who's this for?",      placeholder: "people in burnout, anxious people..." },
    ],
    hook_formula: "Validation → Simple reframe → Grounded practice → 'You're okay' close",
    script_persona: "Calm therapeutic voice — gentle, non-judgmental, grounding",
    voiceover_template: "If you're feeling [topic], you're not broken. Here's a simple practice that can help right now.",
    video_prompt: `Create a calming mental health video, 120-180 seconds, 4K.

Style references: Upload 2 Roger Deakins serene natural diffused lighting.

Subject: Peaceful person.
Camera: Slow gentle movements.
Style: Soft serene cinematic with Deakins calm atmosphere.`,
    negative_prompt: "blur, sudden motion, jitter",
    scene_structure: [
      { label: "Grounding",  timing: "0–50s",    camera: "wide calming push" },
      { label: "Practice",   timing: "50–120s",  camera: "slow gentle close" },
      { label: "Resolution", timing: "120–180s", camera: "peaceful wide" },
    ],
    reference_guide: "Style references: calm expressions, peaceful seated/standing poses, soft natural settings (garden, morning window, lake). Muted earthy tones. Diffused natural lighting only.",
  },

  // ─── 13. Gaming ──────────────────────────────────────────────────────────────
  {
    id: "gaming",
    name: "Gaming",
    description: "High-energy content. Tension → clutch moment → reaction.",
    emoji: "🎮",
    default_duration: 45,
    default_energy: "High-energy",
    default_camera: "Tracking",
    default_style: "Cinematic",
    apis: ["elevenlabs", "kling"],
    brief_fields: [
      { id: "game",   label: "Game?",         placeholder: "Fortnite, Elden Ring, Minecraft..." },
      { id: "moment", label: "Key moment?",   placeholder: "clutch win, impossible shot, speedrun record..." },
      { id: "style",  label: "Content style?", placeholder: "tutorial, reaction, highlight reel..." },
    ],
    hook_formula: "Hype moment tease → Build-up → Clutch payoff → Subscribe CTA",
    script_persona: "Enthusiastic gamer — reactive, excited, community-driven",
    voiceover_template: "Nobody expected this [moment] in [game]. Watch what happens next.",
    video_prompt: `Create an exciting gaming video, 120-180 seconds, 4K.

Style references: Upload 2 Roger Deakins dramatic in-game cinematic lighting.

Subject: Immersive game world.
Camera: Epic establishing + action tracking.
Style: Vibrant cinematic gaming with Deakins lighting.`,
    negative_prompt: "blur, unstable camera, jitter",
    scene_structure: [
      { label: "World intro",  timing: "0–40s",    camera: "epic wide establishing" },
      { label: "Action",       timing: "40–120s",  camera: "smooth tracking" },
      { label: "Climax",       timing: "120–180s", camera: "victorious shot" },
    ],
    reference_guide: "Character model screenshots (front, side, back + expressions). Style references: similar genre game screenshots, color palette, UI aesthetic. Consistent game world environment shots.",
  },

  // ─── 14. Pets ─────────────────────────────────────────────────────────────────
  {
    id: "pets",
    name: "Pets",
    description: "Wholesome, heartwarming, viral-ready pet content.",
    emoji: "🐾",
    default_duration: 30,
    default_energy: "Calm",
    default_camera: "Handheld",
    default_style: "Cinematic",
    apis: ["elevenlabs", "kling"],
    brief_fields: [
      { id: "animal", label: "What animal?",   placeholder: "golden retriever, cat, rabbit..." },
      { id: "moment", label: "Key moment?",    placeholder: "first meeting, funny habit, training win..." },
      { id: "hook",   label: "Hook angle?",    placeholder: "this dog does X every morning, when we adopted..." },
    ],
    hook_formula: "Relatable/wholesome hook → Personality reveal → Heartwarming moment → Emotional close",
    script_persona: "Warm pet lover — authentic, joyful, naturally human",
    voiceover_template: "[Animal] does [habit] every single day — and I finally caught it on camera.",
    video_prompt: `Create a wholesome pet video, 90-150 seconds, 4K.

Style references: Upload 2 Roger Deakins warm natural sunlight pet photography style.

Subject: Cute expressive pet.
Camera: Playful tracking shots.
Style: Warm cinematic with Deakins natural lighting.`,
    negative_prompt: "blur, unnatural motion, jitter",
    scene_structure: [
      { label: "Personality",   timing: "0–40s",    camera: "cute establishing" },
      { label: "Play moment",   timing: "40–100s",  camera: "playful tracking" },
      { label: "Bond",          timing: "100–150s", camera: "heartwarming close" },
    ],
    reference_guide: "5+ photos of the pet: different angles (front, side, 3/4), playing + resting poses, expressive face close-up, full body. Consistent natural indoor lighting.",
  },

  // ─── 15. 3D Animation / Cinematic ─────────────────────────────────────────────
  {
    id: "3d-animation",
    name: "3D Animation / Cinematic",
    description: "Stylised 3D world-building with Pixar-quality polish.",
    emoji: "🌐",
    default_duration: 60,
    default_energy: "Dramatic",
    default_camera: "Orbit",
    default_style: "Cinematic",
    apis: ["elevenlabs", "kling"],
    brief_fields: [
      { id: "world",     label: "World or style?",   placeholder: "Pixar-style, dark fantasy, sci-fi, anime..." },
      { id: "character", label: "Main character?",   placeholder: "robot hero, fantasy knight, cute animal..." },
      { id: "story",     label: "Story beat?",       placeholder: "first adventure, overcoming fear, discovery..." },
    ],
    hook_formula: "World reveal → Character intro → Conflict or wonder → Emotional payoff",
    script_persona: "Cinematic narrator — epic, measured, world-building tone",
    voiceover_template: "In a world where [world premise], one [character] discovers [story beat] — and nothing will ever be the same.",
    video_prompt: `Create a high-quality 3D animated story, 120-180 seconds, 4K.

Style references: Upload 2 Roger Deakins dramatic cinematic lighting references.

Subject: Expressive 3D character.
Camera: Dynamic world + character tracking.
Style: Pixar-quality 3D with Deakins-inspired lighting and shadows.`,
    negative_prompt: "blur, rigid movement, bad rigging, jitter",
    scene_structure: [
      { label: "World reveal", timing: "0–50s",    camera: "dynamic establishing" },
      { label: "Journey",      timing: "50–120s",  camera: "character tracking" },
      { label: "Climax",       timing: "120–180s", camera: "emotional orbit" },
    ],
    reference_guide: "Character turnaround sheet (front, side, back, expressions). Style references: similar 3D renders or Pixar/DreamWorks-style examples. Consistent world environment concept art or screenshots.",
  },

  // ─── Legacy (backward compat) ─────────────────────────────────────────────────
  {
    id: "ugc-ad",
    name: "Viral UGC Ad",
    description: "Product → hook → motion → download. 60 seconds.",
    emoji: "🎬",
    default_duration: 30,
    default_energy: "High-energy",
    default_camera: "Selfie",
    default_style: "Realistic",
    apis: ["elevenlabs", "kling", "hedra"],
    brief_fields: [
      { id: "product",    label: "What are you advertising?", placeholder: "skincare serum, SaaS tool, fitness app..." },
      { id: "audience",   label: "Who's watching?",           placeholder: "Gen Z women, founders, busy moms..." },
      { id: "hook_angle", label: "What's the hook angle?",    placeholder: "transformation, controversy, secret method..." },
    ],
    hook_formula: "Hook → Pain → Reveal product → Proof → Soft CTA",
    script_persona: "Authentic friend recommending a product they actually use, conversational and warm",
  },
  {
    id: "storytime",
    name: "TikTok Storytime",
    description: "Narrative arc. Tension. Payoff. Built to retain.",
    emoji: "📱",
    default_duration: 60,
    default_energy: "Intimate",
    default_camera: "Handheld",
    default_style: "Cinematic",
    apis: ["elevenlabs", "runway", "hedra"],
    brief_fields: [
      { id: "topic",    label: "What's the story about?", placeholder: "the time I quit my job, my worst date..." },
      { id: "twist",    label: "What's the twist?",       placeholder: "what actually happened, the unexpected ending..." },
      { id: "audience", label: "Who's watching?",         placeholder: "Gen Z, working women, expats..." },
    ],
    hook_formula: "Inciting line → Build tension → Twist → Cathartic payoff",
    script_persona: "First-person storyteller, intimate and confessional, builds with natural pauses",
  },
  {
    id: "influencer",
    name: "AI Influencer Clip",
    description: "Your AI persona. Any scene. Any vibe.",
    emoji: "👤",
    default_duration: 30,
    default_energy: "Confident",
    default_camera: "Studio",
    default_style: "Cinematic",
    apis: ["elevenlabs", "kling", "hedra"],
    brief_fields: [
      { id: "persona",  label: "Who is your AI persona?", placeholder: "fashion editor, tech founder, fitness coach..." },
      { id: "scene",    label: "What's the scene?",       placeholder: "Milan rooftop, kitchen, backstage at a runway..." },
      { id: "message",  label: "What are they saying?",   placeholder: "the message, opinion, or moment to capture" },
    ],
    hook_formula: "Visual hook → Persona POV → Aspirational beat → Signature tagline",
    script_persona: "Confident AI persona with a consistent voice and aesthetic, speaks directly to camera",
  },
  {
    id: "product-launch",
    name: "Product Launch Reel",
    description: "Turn product into cinematic social content.",
    emoji: "🛍️",
    default_duration: 30,
    default_energy: "Dramatic",
    default_camera: "Tracking",
    default_style: "Cinematic",
    apis: ["elevenlabs", "runway", "falai"],
    brief_fields: [
      { id: "product",   label: "What are you launching?", placeholder: "new collection, hardware drop, app update..." },
      { id: "value_prop", label: "What's the one promise?", placeholder: "the single benefit that matters most" },
      { id: "audience",  label: "Who is this for?",        placeholder: "early adopters, designers, gym owners..." },
    ],
    hook_formula: "Cinematic open → Problem framing → Product reveal → Hero moment → CTA",
    script_persona: "Brand-voice narrator with cinematic pacing, restrained and aspirational",
  },
  {
    id: "faceless",
    name: "Faceless Content",
    description: "Voice + visuals. No face required.",
    emoji: "😶",
    default_duration: 45,
    default_energy: "Calm",
    default_camera: "Static",
    default_style: "Cinematic",
    apis: ["elevenlabs", "kling"],
    brief_fields: [
      { id: "topic",      label: "What's the topic?",  placeholder: "money, productivity, mindset, history..." },
      { id: "hook_angle", label: "What's the hook?",   placeholder: "contrarian take, hidden truth, surprising stat..." },
      { id: "audience",   label: "Who's watching?",    placeholder: "indie hackers, students, finance bros..." },
    ],
    hook_formula: "Provocative claim → 3 supporting beats → Final reveal",
    script_persona: "Authoritative voice-over with visual essay pacing, declarative and confident",
  },
];

export function findTemplate(id: string | null | undefined): Template | null {
  if (!id) return null;
  return templates.find((t) => t.id === id) ?? null;
}

export function getTemplatesByCategory(): { primary: Template[]; legacy: Template[] } {
  const legacyIds = new Set(["ugc-ad", "storytime", "influencer", "product-launch", "faceless"]);
  return {
    primary: templates.filter(t => !legacyIds.has(t.id)),
    legacy:  templates.filter(t => legacyIds.has(t.id)),
  };
}
