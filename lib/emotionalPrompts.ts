// Emotional Intelligence prompt builder.
// Constructs high-priority emotional directives that are injected into scene prompts
// before being sent to the generation engine (Kling, Runway, Veo, Seedance).

interface SceneInput {
  description: string;
  emotion?: string;
  camera?: string;
}

export function buildEmotionalPrompt(
  scene: SceneInput,
  brandMemory: string,
  emotionalArc: string,
  microIntensity: number,
  activeEmotions: string[],
): string {
  const intensityDesc =
    microIntensity > 70
      ? "strong, visible micro-expressions"
      : microIntensity > 40
      ? "natural, believable micro-expressions"
      : "very subtle, restrained micro-expressions";

  const emotionList = activeEmotions.length
    ? activeEmotions.join(", ")
    : "authentic emotion appropriate to scene";

  return `
**EMOTIONAL INTELLIGENCE DIRECTIVES** (Highest Priority):

Brand Memory: ${brandMemory || "Default cinematic emotional style"}

Overall Arc: ${emotionalArc}
Target Emotions: ${emotionList}

**Performance Requirements:**
- Apply ${intensityDesc} with authentic facial nuance, eye movement, breathing, and body language.
- Show emotional progression within the scene.
- Maintain perfect character consistency with Brand Memory across all shots.
- Subtle environmental reactions that mirror emotional state (lighting, particles, wind, etc.).

Scene: ${scene.description}
${scene.camera ? `\nCamera: ${scene.camera}` : ""}

Style: Cinematic, emotionally resonant, film-grade color grading that supports the emotional tone.
No exaggeration, no cartoonish expressions — only real human emotional depth.
`.trim();
}

export function getIntensityLabel(microIntensity: number): string {
  if (microIntensity > 70) return "Powerful";
  if (microIntensity > 40) return "Natural";
  return "Subtle";
}
