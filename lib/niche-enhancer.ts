// lib/niche-enhancer.ts — Automatic modern-niche context injection for Omnyra.studio
//
// Detects content category from prompt text and appends realistic physical
// details (clothing, props, tools, lighting) that users rarely think to specify.
//
// History/era topics are handled by lib/prompt-enhancer.ts (14 era rules).
// This module covers modern-era niches only (trades, hospitality, fitness, etc.).
//
// Ghost Test: every injected word is an observable physical detail.
// No emotion words, internal states, or evaluative adjectives.

export interface NicheMatch {
  nicheLabel: string;
  injection:  string;
}

interface NicheRule extends NicheMatch {
  triggers: RegExp[];
}

const NICHE_RULES: NicheRule[] = [

  // ── Trades / Construction ───────────────────────────────────────────────────
  {
    nicheLabel: "Trades / Construction",
    triggers: [
      /\bplumber\b/i, /\belectrician\b/i, /\bbuilder\b/i,
      /\btradesman\b/i, /\bhandyman\b/i, /\bcontractor\b/i,
      /\bcarpenter\b/i, /\bwelding\b/i, /\bscaffolding\b/i,
    ],
    injection:
      "hi-vis safety vest, leather tool belt with hammer and measuring tape, " +
      "steel-capped work boots, calloused hands gripping tools with practiced grip, " +
      "raw concrete floor, exposed timber framing, overhead fluorescent job site lighting",
  },

  // ── Cafe / Hospitality ───────────────────────────────────────────────────────
  {
    nicheLabel: "Cafe / Hospitality",
    triggers: [
      /\bcafe\b/i, /\bbarista\b/i, /\bcoffee\s+shop\b/i,
      /\brestaurant\b/i, /\bhospitality\b/i, /\bwaiter\b/i,
      /\bwaitress\b/i, /\bbarmaid\b/i, /\bbarman\b/i,
    ],
    injection:
      "white barista apron, ceramic pour-over filter held in both hands, " +
      "deliberate circular wrist motion, steam wand angled in milk pitcher, " +
      "warm amber pendant lighting over counter, polished timber bar surface, " +
      "stacked paper cups, glass pastry cabinet",
  },

  // ── Fitness / Wellness ───────────────────────────────────────────────────────
  {
    nicheLabel: "Fitness / Wellness",
    triggers: [
      /\bfitness\b/i, /\bworkout\b/i, /\bpersonal\s+trainer\b/i,
      /\bgym\b/i, /\byoga\b/i, /\bpilates\b/i, /\bweightlifting\b/i,
      /\bcross\s*fit\b/i,
    ],
    injection:
      "moisture-wicking athletic shorts and fitted tank top, " +
      "bare feet on rubber gym mat, chest visibly rising and falling, " +
      "chalk dust on palms, barbell plates on steel rack, " +
      "north-facing window daylight, mirrored wall behind",
  },

  // ── Beauty / Skincare ────────────────────────────────────────────────────────
  {
    nicheLabel: "Beauty / Skincare",
    triggers: [
      /\bskincare\b/i, /\bmakeup\b/i, /\bbeauty\b/i,
      /\bcosmetics\b/i, /\bfoundation\b/i, /\bserum\b/i,
      /\beyeliner\b/i, /\blipstick\b/i, /\bblush\b/i,
    ],
    injection:
      "white cotton robe, glass dropper bottle held between thumb and index finger, " +
      "fingertips pressing serum into cheek skin, soft diffused north-facing window light, " +
      "marble vanity surface, ceramic pump bottle, cotton rounds, rose gold compact mirror",
  },

  // ── Real Estate ──────────────────────────────────────────────────────────────
  {
    nicheLabel: "Real Estate",
    triggers: [
      /\breal\s+estate\b/i, /\bproperty\b/i, /\bhouse\s+tour\b/i,
      /\bopen\s+home\b/i, /\bhome\s+inspection\b/i, /\bfor\s+sale\b/i,
    ],
    injection:
      "tailored blazer and pressed trousers, arm extended pointing toward window, " +
      "deliberate walking pace through doorway, " +
      "natural daylight through sash windows, polished hardwood floor, " +
      "freshly painted white walls, staged neutral-cushion sofa",
  },

  // ── Agriculture / Rural ──────────────────────────────────────────────────────
  // Placed before Luxury: "wine making in Tuscany winery" is agricultural, not luxury.
  // More specific triggers (vineyard, winery, farm) win over the broader \btuscany\b.
  {
    nicheLabel: "Agriculture / Rural",
    triggers: [
      /\bvineyard\b/i, /\bwinery\b/i, /\bfarm(?:er|ing)?\b/i,
      /\bagriculture\b/i, /\bwine\s+grape\b/i, /\bwine[\s-]?making\b/i,
      /\borchard\b/i, /\bcrop\b/i, /\bharvest\b/i,
    ],
    injection:
      "sun-worn canvas wide-brim hat, long-sleeve cotton work shirt rolled to elbows, " +
      "leather gardening gloves, pruning shears held against vine cane, " +
      "terracotta soil underfoot, rows of trellised vines receding to horizon, " +
      "golden late-afternoon raking sidelight",
  },

  // ── Luxury / Travel ──────────────────────────────────────────────────────────
  {
    nicheLabel: "Luxury / Travel",
    triggers: [
      /\bluxury\b/i, /\bboutique\s+hotel\b/i, /\bhigh[\s-]?end\b/i,
      /\btuscany\b/i, /\briviera\b/i, /\byacht\b/i, /\bfive.?star\b/i,
    ],
    injection:
      "soft golden-hour sidelight through sheer linen curtains, " +
      "linen weave upholstery, brass fittings, " +
      "unhurried hand lifting crystal glass, " +
      "terracotta tile floor, cypress trees through open archway, dusk light on stone walls",
  },

  // ── Medical / Healthcare ─────────────────────────────────────────────────────
  {
    nicheLabel: "Medical / Healthcare",
    triggers: [
      /\bdoctor\b/i, /\bnurse\b/i, /\bclinic\b/i, /\bhospital\b/i,
      /\bphysician\b/i, /\bsurgeon\b/i, /\bmedical\b/i, /\bpharmacist\b/i,
    ],
    injection:
      "white lab coat over navy scrubs, stethoscope draped around neck, " +
      "clipboard with printed patient chart in one hand, " +
      "overhead LED surgical lighting, blue privacy curtain, " +
      "stainless steel instrument tray, antiseptic-clean tile floor",
  },

  // ── Education / Teaching ─────────────────────────────────────────────────────
  {
    nicheLabel: "Education / Teaching",
    triggers: [
      /\bteacher\b/i, /\bprofessor\b/i, /\bclassroom\b/i,
      /\btutor\b/i, /\blecture\b/i, /\bschool\b/i, /\bchalkboard\b/i,
    ],
    injection:
      "long-sleeve collared shirt, marker pen in hand raised toward whiteboard, " +
      "rows of desks with open notebooks, overhead projector beam, " +
      "printed diagrams pinned to cork board, afternoon window light from the left",
  },

  // ── Corporate / Professional ─────────────────────────────────────────────────
  {
    nicheLabel: "Corporate / Professional",
    triggers: [
      /\bcorporate\b/i, /\bbusiness\s+meeting\b/i, /\bexecutive\b/i,
      /\bboardroom\b/i, /\boffice\s+(?:environment|setting|scene)\b/i,
      /\bpresentation\s+(?:to|for|at)\b/i,
    ],
    injection:
      "charcoal wool blazer over white collared shirt, leather portfolio in one hand, " +
      "standing at glass whiteboard with marker raised, " +
      "floor-to-ceiling office windows, city skyline behind, " +
      "overhead recessed LED panel lighting, polished concrete floor",
  },

  // ── Fashion & Style ──────────────────────────────────────────────────────────
  {
    nicheLabel: "Fashion & Style",
    triggers: [
      /\bfashion\b/i, /\bfashion\s+model\b/i, /\brunway\b/i,
      /\bhigh\s+fashion\b/i, /\bstreet\s+style\b/i, /\boutfit\s+(?:of|reveal|showcase)\b/i,
    ],
    injection:
      "structured blazer over slip dress, model walking toward camera in three-quarter stride, " +
      "fabric edge catching wind, hair swept to one side, " +
      "stark white studio backdrop, overhead softbox key light with hard shadow fill",
  },

  // ── Food & Cooking ───────────────────────────────────────────────────────────
  // restaurant/cafe triggers land in Hospitality (evaluated earlier). This rule
  // catches cooking-specific content: home kitchen, recipe demos, chef prep work.
  {
    nicheLabel: "Food & Cooking",
    triggers: [
      /\bcooking\b/i, /\brecipe\b/i, /\bkitchen\b/i,
      /\bchef\b/i, /\bchop(?:ping)?\b/i, /\bstir[\s-]?fry\b/i,
      /\bbaking\b/i, /\bpasta\b/i, /\bplating\b/i,
    ],
    injection:
      "bare hands rolling dough on floured marble surface, chef's knife slicing through herbs, " +
      "cast iron pan with visible steam rising, " +
      "clay bowl and wooden spoon in frame, " +
      "warm tungsten pendant lighting over wooden chopping board, herb sprigs scattered on counter",
  },

  // ── Relationship / Couple ────────────────────────────────────────────────────
  {
    nicheLabel: "Relationship / Couple",
    triggers: [
      /\bcouple\b/i, /\bromantic\s+(?:walk|date|dinner|scene|moment)\b/i,
      /\btwo\s+people\s+(?:walk|hold|share|sit|laugh)\b/i,
      /\bdate\s+night\b/i, /\bproposal\b/i, /\banniversary\b/i,
    ],
    injection:
      "two people walking shoulder to shoulder on footpath, " +
      "one arm draped around the other's waist, heads angled close, hands interlaced, " +
      "natural park or urban backdrop, late-afternoon golden side light",
  },

  // ── Parenting / Family ───────────────────────────────────────────────────────
  {
    nicheLabel: "Parenting / Family",
    triggers: [
      /\bparenting\b/i, /\bmom\s+and\s+(?:kid|child|baby)\b/i,
      /\bdad\s+and\s+(?:kid|child|baby)\b/i, /\bparent\s+and\s+child\b/i,
      /\bbedtime\s+story\b/i, /\bnewborn\b/i, /\btoddler\b/i,
    ],
    injection:
      "adult kneeling to child's eye level, child's hand gripping adult's index finger, " +
      "open picture book spread on carpet between them, " +
      "floor-level natural window light, hardwood floor with soft woven rug",
  },

  // ── Technology / Productivity ────────────────────────────────────────────────
  {
    nicheLabel: "Technology / Productivity",
    triggers: [
      /\bsoftware\b/i, /\bcoding\b/i, /\bdeveloper\b/i,
      /\bapp\s+(?:demo|walkthrough|tutorial)\b/i, /\bproductivity\s+(?:setup|system|hack)\b/i,
      /\bdesk\s+setup\b/i, /\bsaas\b/i,
    ],
    injection:
      "fingers on mechanical keyboard, second monitor showing dark-theme code editor, " +
      "USB-C cable to laptop, desk lamp casting warm cone of light, " +
      "bamboo desk organiser, notebook open to handwritten bullet points beside the keyboard",
  },

  // ── Pets & Animals ───────────────────────────────────────────────────────────
  {
    nicheLabel: "Pets & Animals",
    triggers: [
      /\bpet\b/i, /\bdog\b/i, /\bcat\b/i, /\bpuppy\b/i,
      /\bkitten\b/i, /\bgolden\s+retriever\b/i, /\bfrench\s+bulldog\b/i,
    ],
    injection:
      "dog sitting on hardwood floor with ears forward, tail sweeping the floor, " +
      "owner crouched at dog's eye level with hand extended palm-up, " +
      "afternoon sidelight through window slats, woven pet bed visible in background corner",
  },

];

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Scans a prompt for modern-niche signals and returns the best match,
 * or null if no niche is detected.
 *
 * Historical topics (WWII, Victorian, Ancient Rome, etc.) are handled by
 * detectHistoricalEra() in lib/prompt-enhancer.ts and take precedence.
 */
export function detectNiche(prompt: string): NicheMatch | null {
  for (const rule of NICHE_RULES) {
    if (rule.triggers.some(rx => rx.test(prompt))) {
      return { nicheLabel: rule.nicheLabel, injection: rule.injection };
    }
  }
  return null;
}

/**
 * Appends niche-specific physical descriptors to `prompt`.
 *
 * Skips injection when the prompt already contains substantial niche detail
 * (≥ 3 key nouns from the injection already present) — respects users who
 * write their own setting descriptions.
 */
export function applyNicheContext(prompt: string, niche: NicheMatch): string {
  const promptLower = prompt.toLowerCase();

  const injectionNouns = niche.injection
    .split(/[\s,()–\-]+/)
    .map(w => w.toLowerCase().replace(/[^a-z]/g, ""))
    .filter(w => w.length > 4);

  const alreadyPresent = injectionNouns.filter(noun => promptLower.includes(noun)).length;
  if (alreadyPresent >= 3) return prompt;

  return `${prompt}, ${niche.injection}`;
}

// ── Faceless / hands-only modifier ────────────────────────────────────────────
//
// "Faceless" is a popular aesthetic content format: hands and objects only,
// no identifiable face in frame. It's a composition flag, not a niche — it
// applies on top of any niche or historical enhancement.

const FACELESS_TRIGGERS = /\b(faceless|no\s+face|hands[\s-]only|pov\s+shot|first[\s-]person\s+pov)\b/i;

export function isFacelessContent(prompt: string): boolean {
  return FACELESS_TRIGGERS.test(prompt);
}

/**
 * Prepends a framing directive so the camera operator instruction lands
 * before the cinematic/animation prefix that processKlingShot appends.
 */
export function applyFacelessModifier(prompt: string): string {
  return `Extreme close-up of hands and objects only, no face visible in frame, ${prompt}`;
}
