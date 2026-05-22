export interface PromptInputs {
  product: string;
  audience: string;
  platform: "tiktok" | "instagram" | "youtube";
  goal: string;
  energy: string;
  camera: string;
  style: string;
  duration: number;
}

const STYLE_MAP: Record<string, string> = {
  "girl-talk":
    "Sound like a real 24-year-old talking to her phone in her bathroom. Self-interrupting. Messy real thoughts. Like a voice note not a script.",
  founder:
    "Direct, confident, zero fluff. Every sentence earns its place. Gary Vee meets calm authority.",
  storytime:
    "Hook with tension. Build narrative arc. Payoff at the end. Keep listener wondering what happens next.",
  luxury:
    "Minimal words. Sensory language. Slow confidence. Like a fragrance ad that makes you feel something.",
  "alex hormozi":
    "Blunt. Data-backed. Confrontational opener. 'Most people get this wrong.' energy.",
  "faceless drama":
    "Third person voiceover. Observational. No personal pronouns. Builds curiosity without showing face.",
  "apple minimal":
    "One idea per sentence. Long pauses implied by short sentences. Premium silence.",
};

const ENERGY_MAP: Record<string, string> = {
  calm: "measured pace, soft authority, no exclamation energy",
  natural: "conversational, real, slightly imperfect",
  "high-energy": "fast cuts between ideas, punchy, momentum-driven",
  hype: "maximum excitement, hyperbolic but believable, viral energy",
};

const CAMERA_MAP: Record<string, string> = {
  selfie: "talking directly to camera, personal, intimate framing",
  ugc: "handheld feel, authentic, slightly shaky energy in the words",
  cinematic: "scene-setting language, visual descriptions embedded in copy",
  documentary:
    "observational tone, third person where possible, journalistic",
};

const PLATFORM_CONTEXT: Record<string, string> = {
  tiktok:
    "TikTok audience. Hook in 1 second or they scroll. Trend-aware. Sound-on assumed.",
  instagram:
    "Instagram Reels audience. Aesthetic matters. Hook fast. Watch time is everything.",
  youtube:
    "YouTube Shorts audience. Slightly longer attention. Context helps. CTA at end.",
};

const WORD_RATE_PER_SECOND = 2.5;

export function buildMasterPrompt(inputs: PromptInputs): string {
  const styleInstruction =
    STYLE_MAP[inputs.style] ??
    "Conversational, platform-native, real human voice.";
  const energyInstruction =
    ENERGY_MAP[inputs.energy] ?? "conversational, real, slightly imperfect";
  const cameraInstruction =
    CAMERA_MAP[inputs.camera] ?? "talking directly to camera, personal";
  const platformContext =
    PLATFORM_CONTEXT[inputs.platform] ?? PLATFORM_CONTEXT.tiktok;

  const maxWords = Math.floor(inputs.duration * WORD_RATE_PER_SECOND);

  return `You are a world-class social media scriptwriter. You write creator-native scripts that convert.

PRODUCT: ${inputs.product}
TARGET AUDIENCE: ${inputs.audience}
PLATFORM: ${inputs.platform.toUpperCase()}
GOAL: ${inputs.goal}
SCRIPT LENGTH: ${inputs.duration} seconds (approximately ${maxWords} spoken words maximum)

PLATFORM CONTEXT:
${platformContext}

VOICE STYLE:
${styleInstruction}

ENERGY:
${energyInstruction}

VISUAL FRAMING LANGUAGE:
${cameraInstruction}

ABSOLUTE RULES — violating any single rule makes the output unusable:
1. The hook must land within the first 2 seconds of speaking. No warmup. No intro.
2. Do NOT include [PAUSE], (pause), or any timing markers.
3. Do NOT include stage directions, action descriptions, or camera notes.
4. Do NOT reference AI, scripts, or the writing process.
5. Do NOT name the product in the first sentence.
6. Every sentence must be 10 words or fewer.
7. Output spoken words ONLY — nothing else.
8. Sound like a real human. Imperfect is correct. Polished is wrong.
9. No filler phrases: "In today's video", "Hey guys", "So basically", "I wanted to share".
10. End with a single clear action the viewer should take. No multiple CTAs.

OUTPUT FORMAT:
Return the script as plain spoken text only. No labels. No headers. No scene numbers. No quotation marks wrapping the whole thing. Just the words the creator says out loud, exactly as they would say them.`;
}
