export interface DirectorSettings {
  energy: string | null;
  camera: string | null;
  style: string | null;
}

export interface Scene {
  scene: number;
  duration: string;
  visual_prompt: string;
  emotion: string;
  motion: string;
  api: "kling" | "runway" | "pika";
}

const HIGH_MOVEMENT_STYLES = new Set(["hype", "high-energy"]);
const CINEMATIC_STYLES = new Set(["cinematic", "documentary"]);

function selectApi(
  energy: string | null,
  camera: string | null,
  sceneIndex: number,
  totalScenes: number
): "kling" | "runway" | "pika" {
  if (energy && HIGH_MOVEMENT_STYLES.has(energy)) return "kling";
  if (camera && CINEMATIC_STYLES.has(camera)) return "runway";
  if (sceneIndex === 0 || sceneIndex === totalScenes - 1) return "pika";
  return "pika";
}

function buildMotionInstruction(
  camera: string | null,
  energy: string | null,
  sceneIndex: number
): string {
  if (camera === "cinematic") {
    const cinematic = [
      "slow dolly push toward subject",
      "gentle crane descent, subject centered",
      "wide establishing shot, subtle zoom in",
      "rack focus from background to subject",
      "static wide, subject walks into frame",
      "low angle tilt up to product",
    ];
    return cinematic[sceneIndex % cinematic.length];
  }

  if (camera === "documentary") {
    const doc = [
      "handheld follow, observer distance",
      "static locked off, subject moves through frame",
      "slow pan across environment",
      "tight handheld on detail, pull back to reveal",
      "over-the-shoulder, natural motivated movement",
      "static wide, minimal intervention",
    ];
    return doc[sceneIndex % doc.length];
  }

  if (camera === "ugc" || camera === "selfie") {
    const ugc = [
      "subtle handheld sway, front-facing",
      "slight tilt and reframe mid-shot",
      "close crop on face, natural drift",
      "pull back from close to medium",
      "static selfie angle, minor micro-movements",
      "casual reframe to show product",
    ];
    return ugc[sceneIndex % ugc.length];
  }

  if (energy === "hype" || energy === "high-energy") {
    const hype = [
      "fast push in, energetic approach",
      "quick whip pan transition",
      "dynamic low-to-high tilt",
      "smash cut motion, rapid reframe",
      "aggressive zoom in on focal point",
      "kinetic handheld with intentional shake",
    ];
    return hype[sceneIndex % hype.length];
  }

  return "static or slow drift, natural motion";
}

function buildVisualPrompt(
  sentence: string,
  camera: string | null,
  style: string | null,
  energy: string | null,
  sceneIndex: number
): string {
  const cameraQuality = (() => {
    if (camera === "cinematic") return "cinematic 4K, shallow depth of field, film grain";
    if (camera === "documentary") return "documentary style, natural light, realistic texture";
    if (camera === "ugc") return "iPhone quality, natural indoor lighting, authentic feel";
    if (camera === "selfie") return "selfie framing, front-facing camera, close crop";
    return "clean sharp video, natural lighting";
  })();

  const styleAtmosphere = (() => {
    if (style === "luxury") return "editorial lighting, muted palette, high-end feel";
    if (style === "apple minimal") return "clean white space, product-forward, minimalist composition";
    if (style === "girl-talk") return "bedroom or bathroom setting, warm ambient light, relatable environment";
    if (style === "founder") return "clean neutral background, confident framing, professional but approachable";
    if (style === "storytime") return "expressive lighting shifts, environment reflects narrative mood";
    if (style === "faceless drama") return "product or hands only, no face, close detail shots";
    if (style === "alex hormozi") return "direct address, bold framing, no decoration";
    return "neutral, clean, platform-native";
  })();

  const energyMood = (() => {
    if (energy === "hype") return "vibrant, saturated, high contrast";
    if (energy === "high-energy") return "punchy color, fast-feeling composition";
    if (energy === "calm") return "soft light, breathing room in frame";
    if (energy === "natural") return "warm tones, organic feel";
    return "balanced exposure, natural color grade";
  })();

  const sceneHint = sentence.trim().replace(/[^a-zA-Z0-9 ,]/g, "").slice(0, 80);

  return `${sceneHint} — ${cameraQuality}, ${styleAtmosphere}, ${energyMood}`;
}

function buildEmotion(
  energy: string | null,
  style: string | null,
  sceneIndex: number,
  totalScenes: number
): string {
  if (sceneIndex === 0) {
    if (energy === "hype") return "urgent curiosity, pattern interrupt";
    if (style === "storytime") return "tension, something is about to happen";
    if (style === "luxury") return "intrigue, elevated desire";
    return "hook, immediate attention";
  }

  if (sceneIndex === totalScenes - 1) {
    if (energy === "hype" || energy === "high-energy") return "conviction, call to action energy";
    if (style === "luxury") return "aspiration, quiet want";
    return "resolution, confident close";
  }

  const mid = [
    "building belief, proof moment",
    "relatability peak, viewer recognition",
    "tension and payoff, mid-arc",
    "social proof, trust building",
    "desire amplification",
  ];
  return mid[sceneIndex % mid.length];
}

function splitIntoSentences(script: string): string[] {
  return script
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function groupSentencesIntoScenes(
  sentences: string[],
  sceneCount: number
): string[] {
  const groups: string[] = [];
  const perScene = Math.ceil(sentences.length / sceneCount);
  for (let i = 0; i < sceneCount; i++) {
    const chunk = sentences.slice(i * perScene, (i + 1) * perScene);
    if (chunk.length > 0) groups.push(chunk.join(" "));
  }
  return groups;
}

function estimateSceneCount(script: string): number {
  const sentences = splitIntoSentences(script);
  const count = Math.min(6, Math.max(3, Math.ceil(sentences.length / 2)));
  return count;
}

function estimateSceneDuration(
  sceneText: string,
  totalDurationSeconds: number,
  totalWords: number
): string {
  const sceneWords = sceneText.split(/\s+/).length;
  const ratio = totalWords > 0 ? sceneWords / totalWords : 1;
  const seconds = Math.round(ratio * totalDurationSeconds);
  return `${Math.max(2, seconds)}s`;
}

export function buildScenePrompts(
  script: string,
  directorSettings: DirectorSettings,
  totalDurationSeconds = 30
): Scene[] {
  const { energy, camera, style } = directorSettings;
  const sentences = splitIntoSentences(script);
  const totalWords = script.split(/\s+/).length;
  const sceneCount = estimateSceneCount(script);
  const sceneTexts = groupSentencesIntoScenes(sentences, sceneCount);

  return sceneTexts.map((text, i) => ({
    scene: i + 1,
    duration: estimateSceneDuration(text, totalDurationSeconds, totalWords),
    visual_prompt: buildVisualPrompt(text, camera, style, energy, i),
    emotion: buildEmotion(energy, style, i, sceneTexts.length),
    motion: buildMotionInstruction(camera, energy, i),
    api: selectApi(energy, camera, i, sceneTexts.length),
  }));
}
