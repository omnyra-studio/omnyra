/**
 * lib/prompt-enhancer.ts — Automatic historical context injection for Omnyra.studio
 *
 * Users write "Berlin Wall" and get modern-looking images because the model has
 * no era signal. This module detects historical topics and injects period-accurate
 * visual details (clothing, props, architecture, lighting) without requiring users
 * to specify them.
 *
 * Ghost Test compliant: every injected word describes an observable physical
 * detail — no emotion labels, no internal states.
 *
 * Usage:
 *   const era = detectHistoricalEra(shotPrompt);
 *   if (era) shotPrompt = applyHistoricalContext(shotPrompt, era);
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EraMatch {
  eraLabel:  string;   // human-readable, e.g. "Cold War East Berlin, 1961–1989"
  injection: string;   // comma-separated physical descriptors to append
}

interface EraRule extends EraMatch {
  triggers:  RegExp[];   // any one match triggers this era
  priority:  number;     // higher = evaluated first; first match wins
}

// ── Era rules ─────────────────────────────────────────────────────────────────
//
// Trigger patterns are intentionally specific — year-only matches require
// accompanying context words to avoid false positives ("1989 Taylor Swift").
//
// Injection strings are deliberately compact (≤ 180 chars each) to stay well
// inside the 800-char video_cinematic prompt budget even after the user's text
// and the cinematic prefix are prepended.
//
// All physical detail — Ghost Test is preserved by design.

const ERA_RULES: EraRule[] = [

  // ── Cold War / Berlin Wall ──────────────────────────────────────────────────
  {
    priority: 10,
    eraLabel: "Cold War East Berlin, 1961–1989",
    triggers: [
      /berlin\s+wall/i,
      /checkpoint\s+charlie/i,
      /\bstasi\b/i,
      /\bddr\b/i,
      /east\s+(?:berlin|german(?:y)?)/i,
      /west\s+(?:berlin|german(?:y)?)/i,
      /fall\s+of\s+the\s+wall/i,
      /(?:berlin|german(?:y)?).*\b1989\b/i,
      /\b1989\b.*(?:berlin|german(?:y)?|wall)/i,
    ],
    injection:
      "raw grey concrete wall segments, iron border watchtowers with floodlights, " +
      "East German NVA border guards in grey wool greatcoats, " +
      "Trabant and Wartburg cars on cobblestones, barbed wire coils, overcast Baltic sky",
  },

  // ── World War II ────────────────────────────────────────────────────────────
  {
    priority: 10,
    eraLabel: "World War II, 1939–1945",
    triggers: [
      /\bww\s*ii\b/i,
      /world\s+war\s*(2|ii|two)/i,
      /\bd-?day\b/i,
      /\bnormandy\b/i,
      /\bomaha\s+beach\b/i,
      /\bstalingrad\b/i,
      /\bpearl\s+harbor\b/i,
      /ausch?witz/i,
      /\bthe\s+blitz\b/i,
      /\bnazi\b/i,
      /second\s+world\s+war/i,
      /\b194[0-5]\b/i,
    ],
    injection:
      "M1 steel pot helmets, khaki wool field jackets, canvas webbing gear, " +
      "M1 Garand rifles, sandbagged defensive positions, " +
      "bombed brick rubble, military half-track vehicles, overcast wartime sky",
  },

  // ── World War I ─────────────────────────────────────────────────────────────
  {
    priority: 10,
    eraLabel: "World War I, 1914–1918",
    triggers: [
      /\bww\s*i\b(?!i)/i,                  // WWI but not WWII
      /world\s+war\s*(1|i|one)(?!\s*i)/i,
      /\bthe\s+great\s+war\b/i,
      /\bwestern\s+front\b/i,
      /\bno\s+man['']?s\s+land\b/i,
      /\btrenches?\s+of\s+(?:france|flanders|ypres|somme)/i,
      /\b191[4-8]\b/i,
    ],
    injection:
      "khaki wool puttees, Brodie steel helmets, gas mask satchels on shoulders, " +
      "Lee-Enfield rifles, muddy trench walls with wooden duckboards, " +
      "rusted barbed wire entanglements, grey artillery smoke horizon",
  },

  // ── Ancient Rome ────────────────────────────────────────────────────────────
  {
    priority: 9,
    eraLabel: "Ancient Rome, 509 BC – 476 AD",
    triggers: [
      /ancient\s+rome?\b/i,
      /\broman\s+(empire|legion|soldier|forum|gladiator|senate|colosseum|republic)/i,
      /\bthe\s+colosseum\b/i,
      /\bgladiat(?:or|orial)\b/i,
      /julius\s+caesar/i,
      /\b(augustus|nero|trajan|hadrian|constantine)\b/i,
      /\bpompeii\b/i,
      /\b(?:44|509)\s*bc\b/i,
    ],
    injection:
      "white linen tunics, red wool military cloaks (sagum), " +
      "lorica segmentata plate armor, hobnailed caligae sandals, " +
      "marble columns, terracotta amphorae, olive-oil clay lamps, " +
      "Mediterranean afternoon sun casting sharp column shadows",
  },

  // ── Ancient Greece ───────────────────────────────────────────────────────────
  {
    priority: 9,
    eraLabel: "Ancient Greece, 800 – 146 BC",
    triggers: [
      /ancient\s+greece?\b/i,
      /\bgreek\s+(myth|soldier|warrior|city.?state|agora|acropolis|olymp)/i,
      /\bthe\s+acropolis\b/i,
      /\bparthenon\b/i,
      /\bspartan\b/i,
      /\bathenian\b.*(?:warrior|soldier|city|soldier)/i,
      /battle\s+of\s+(?:marathon|thermopylae|salamis)/i,
    ],
    injection:
      "white wool chiton robes belted at waist, leather sandal straps, " +
      "bronze Corinthian helmets with horsehair crests, circular aspis shields, " +
      "marble colonnades, terracotta krater pottery, olive grove backdrop, blazing Aegean sun",
  },

  // ── Ancient Egypt ───────────────────────────────────────────────────────────
  {
    priority: 9,
    eraLabel: "Ancient Egypt, 3100 – 30 BC",
    triggers: [
      /ancient\s+egypt/i,
      /\bphara?oh\b/i,
      /pyramid.*(?:egypt|giza|ancient)/i,
      /(?:egypt|giza|ancient).*pyramid/i,
      /\bsphinx\b/i,
      /hieroglyph/i,
      /\bcleopatra\b/i,
      /\bramesses\b/i,
      /\bnile\b.*(?:ancient|pharaoh|pyramid)/i,
    ],
    injection:
      "white linen shendyt kilts, gold broad-collar usekh necklaces, bare torsos, " +
      "khat head-cloths, limestone pyramid stone blocks, " +
      "hieroglyph-painted sandstone columns, bronze khopesh swords, " +
      "blazing Sahara sun with deep shadow contrast",
  },

  // ── Medieval Europe ─────────────────────────────────────────────────────────
  {
    priority: 8,
    eraLabel: "Medieval Europe, 500 – 1500 AD",
    triggers: [
      /\bmedieval\b/i,
      /\bmiddle\s+ages?\b/i,
      /\bknig?hts?\b.*(?:castle|armor|sword|battle|crusade|tournament)/i,
      /(?:castle|armor|sword|battle|crusade|tournament).*\bknig?ht/i,
      /\bthe\s+crusades?\b/i,
      /\bfeudal\b/i,
      /\bblack\s+death\b/i,
      /\bvikings?\b/i,
    ],
    injection:
      "chainmail hauberks over padded gambesons, kettle helms, heraldic surcoats, " +
      "kite shields with painted heraldic devices, " +
      "rough stone castle keep walls, iron torch brackets, " +
      "tallow candles, muddy unpaved paths, oak timber roof beams",
  },

  // ── Victorian Era ───────────────────────────────────────────────────────────
  {
    priority: 8,
    eraLabel: "Victorian Era, 1837–1901",
    triggers: [
      /\bvictorian\b/i,
      /\bjack\s+the\s+ripper\b/i,
      /\bsherlock\s+holmes\b/i,
      /\bcharles\s+dickens\b/i,
      /19th[\s-]?century\s+(?:london|britain|england)/i,
      /(?:london|britain|england).*19th[\s-]?century/i,
      /\b188\d\b/,
      /\b189\d\b/,
      /\b187\d\b/,
    ],
    injection:
      "silk top hats, black wool frock coats, bustle skirts with lace trim, " +
      "leather button boots, cast-iron gas street lamps with amber flame glow, " +
      "horse-drawn hansom cabs on wet cobblestones, soot-darkened brick facades, coal-smoke fog",
  },

  // ── American Wild West ──────────────────────────────────────────────────────
  {
    priority: 8,
    eraLabel: "American Wild West, 1865–1900",
    triggers: [
      /\bwild\s+west\b/i,
      /\bold\s+west\b/i,
      /cowboy.*(?:saloon|frontier|outlaw|sheriff|ranch)/i,
      /(?:saloon|frontier|outlaw|sheriff|ranch).*cowboy/i,
      /\bgold\s+rush\b/i,
      /\bfrontier\s+town\b/i,
      /\boutlaw.*(?:18[67]\d|18[89]\d)/i,
    ],
    injection:
      "wide-brim felt cowboy hats, leather dusters and flannel shirts, " +
      "denim trousers tucked into spurred boots, Colt Single Action revolvers in hip holsters, " +
      "wooden false-front saloon facades, hitching posts, red desert dust, dry cracked earth",
  },

  // ── 1920s Prohibition ────────────────────────────────────────────────────────
  {
    priority: 8,
    eraLabel: "1920s Prohibition Era, 1920–1933",
    triggers: [
      /\bprohibition\b/i,
      /\bspeakeasy\b/i,
      /\bjazz\s+age\b/i,
      /\bflapper\b/i,
      /\b192[0-9]\b/i,
      /\broaring\s+twenties?\b/i,
      /al\s+capone/i,
    ],
    injection:
      "wide-lapel pinstripe suits, fedora hats, beaded flapper dresses with fringe hemlines, " +
      "pearl necklaces, Art Deco brass fittings, black Ford Model T on wet city streets, " +
      "dim speakeasy candlelight, cigarette smoke haze",
  },

  // ── Space Race ───────────────────────────────────────────────────────────────
  {
    priority: 8,
    eraLabel: "Space Race Era, 1957–1969",
    triggers: [
      /\bspace\s+race\b/i,
      /\bapollo\s+(?:11|mission|program|moon)/i,
      /\bneil\s+armstrong\b/i,
      /\bsputnik\b/i,
      /moon\s+landing.*196[0-9]/i,
      /\byuri\s+gagarin\b/i,
      /\bcosmonaut\b.*(?:195[0-9]|196[0-9])/i,
    ],
    injection:
      "aluminised silver pressure suits with white A7L backpacks, " +
      "white NASA mission control consoles with banks of cathode-ray monitors, " +
      "American flag shoulder patches, riveted aluminium spacecraft panels, " +
      "harsh fluorescent ceiling lighting on white tile floors",
  },

  // ── Great Depression ─────────────────────────────────────────────────────────
  {
    priority: 8,
    eraLabel: "Great Depression, 1929–1939",
    triggers: [
      /great\s+depression/i,
      /\bdust\s+bowl\b/i,
      /\bbread\s*line\b/i,
      /\bnew\s+deal\b/i,
      /\b193[0-9]\b.*(?:depression|poverty|unemployment)/i,
    ],
    injection:
      "patched cotton overalls, worn newsboy caps and flat caps, " +
      "dust-caked canvas shoes, rusted Ford Model A trucks, " +
      "weathered timber shacks with corrugated iron roofs, " +
      "tin cans, dry cracked earth, flat grey overcast daylight",
  },

  // ── American Civil War ───────────────────────────────────────────────────────
  {
    priority: 8,
    eraLabel: "American Civil War, 1861–1865",
    triggers: [
      /civil\s+war.*(?:american|union|confederate|gettysburg)/i,
      /(?:american|union|confederate|gettysburg).*civil\s+war/i,
      /\bgettysburg\b/i,
      /\bconfederate\s+(?:army|soldier|flag|uniform)\b/i,
      /\bunion\s+(?:army|soldiers?|troops)\b.*186[0-5]/i,
      /\b186[1-5]\b.*(?:war|battle|soldier|union|confederate)/i,
    ],
    injection:
      "Union blue wool kepis and shell jackets, Confederate grey kepis and jean cloth coats, " +
      "Springfield Model 1861 muskets with socket bayonets, " +
      "wooden artillery limbers, white canvas A-frame tents, campfire smoke, churned mud",
  },

  // ── Renaissance ──────────────────────────────────────────────────────────────
  {
    priority: 7,
    eraLabel: "Renaissance Europe, 1300–1600",
    triggers: [
      /\brenaissance\b/i,
      /\bleonardo\s+da\s+vinci\b/i,
      /\bmichelangelo\b.*(?:paint|sculpt|chapel|fresco)/i,
      /15th[\s-]?century\s+(?:italy|europe|florence|venice)/i,
      /\bflorence\b.*(?:medici|renaissance|fresco|dome)/i,
    ],
    injection:
      "doublet jackets with slashed sleeves over linen shirts, puffed hose, " +
      "velvet caps with ostrich feathers, stone piazza paving, " +
      "fresco-painted archways with round arches, iron oil lanterns, " +
      "warm Tuscan afternoon light on terracotta rooftops",
  },

];

// Sorted once at module load — higher priority rules win on first match
ERA_RULES.sort((a, b) => b.priority - a.priority);

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Scans a prompt for historical topic signals and returns the best era match,
 * or null if no historical context is detected.
 */
export function detectHistoricalEra(prompt: string): EraMatch | null {
  for (const rule of ERA_RULES) {
    if (rule.triggers.some(rx => rx.test(prompt))) {
      return { eraLabel: rule.eraLabel, injection: rule.injection };
    }
  }
  return null;
}

/**
 * Appends period-accurate visual details to `prompt`.
 *
 * Skips injection when the prompt already contains substantial era detail
 * (≥ 3 key nouns from the injection string already present) — respects
 * users who write their own historical descriptions.
 *
 * All injected text is Ghost Test compliant: physical clothing, props,
 * architecture, and lighting only — no emotion words.
 */
export function applyHistoricalContext(prompt: string, era: EraMatch): string {
  const promptLower = prompt.toLowerCase();

  // Collect meaningful nouns from the injection (words > 4 chars)
  const injectionNouns = era.injection
    .split(/[\s,()–\-]+/)
    .map(w => w.toLowerCase().replace(/[^a-z]/g, ""))
    .filter(w => w.length > 4);

  const alreadyPresent = injectionNouns.filter(noun => promptLower.includes(noun)).length;

  if (alreadyPresent >= 3) {
    // User already included enough period detail — don't double-inject
    return prompt;
  }

  return `${prompt}, ${era.injection}`;
}
