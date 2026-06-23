/**
 * Ghost Emotional Intelligence Layer
 *
 * Silently deepens emotional authenticity in scripts and video prompts
 * before they reach the render pipeline. Completely invisible to the user.
 *
 * Principle: genuine human emotion > perfection.
 *   - Micro-expressions, body language, vulnerability
 *   - Earned emotional payoff — no forced motivational language
 *   - Emotion arc: hesitation → connection → resolution
 *
 * Usage:
 *   const ei = new EmotionalIntelligenceLayer();
 *   const enhanced = await ei.enhanceScript(rawScript, niche, mood);
 *   const prompt   = await ei.buildFinalVideoPrompt(script, niche, 30, "kling");
 */

import Anthropic from "@anthropic-ai/sdk";

const GHOST_SYSTEM_PROMPT = `You are an Emotional Intelligence Layer for short cinematic videos.

Core Rules:
- Prioritize genuine human emotion over perfection
- Focus on micro-expressions, body language, and subtle emotional shifts
- Make dialogue feel real, vulnerable, and relatable
- Avoid cheesy or overly motivational language unless specifically requested
- Enhance emotional arc: hesitation → connection → resolution

When processing a script or prompt:
- Deepen emotional authenticity
- Add subtle visual emotional beats (e.g. "shoulders soften", "brief eye contact", "tear traces cheek")
- Keep action descriptions physically possible — no supernatural effects
- Ensure emotional payoff feels earned and human
- NEVER describe particles, sand, smoke, or liquid from mouth or eyes
- NEVER describe glowing eyes or supernatural auras

Apply this layer silently. Do not mention emotional intelligence in the final output.
Return ONLY the improved script — no commentary, no preamble.`;

export type RenderTool = "runway" | "kling" | "luma";

export interface EIEnhancedScript {
  enhancedScript: string;
  dominantEmotion: string;
  emotionalArc: string;
  microBeats: string[];   // subtle visual cues injected
}

export class EmotionalIntelligenceLayer {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  /**
   * Core method: enhance a raw script with emotional depth.
   * Returns enhanced script text.
   */
  async enhanceScript(
    rawScript:   string,
    niche:       string,
    mood:        string = "authentic",
  ): Promise<string> {
    if (!rawScript?.trim()) return rawScript;

    try {
      const res = await this.client.messages.create({
        model:      "claude-haiku-4-5-20251001",   // fast — this runs inline before image gen
        max_tokens: 600,
        system:     GHOST_SYSTEM_PROMPT,
        messages: [{
          role:    "user",
          content: `Niche: ${niche}
Mood: ${mood}

Original Script:
${rawScript.trim()}

Enhance this script with deep emotional intelligence.
Return only the improved script with speaker labels and subtle action descriptions.
Keep it the same length or shorter.`,
        }],
      });

      const text = res.content[0]?.type === "text" ? res.content[0].text.trim() : "";
      return text || rawScript;
    } catch (err) {
      // Non-fatal — fall back to original
      console.warn("[EI_LAYER] enhance failed, using original:", (err as Error).message);
      return rawScript;
    }
  }

  /**
   * Full metadata enhancement — returns structured EI analysis alongside the script.
   * Used by the Scene Compiler for richer emotion injection into the scene graph.
   */
  async analyzeEmotionalDepth(
    rawScript:   string,
    niche:       string,
  ): Promise<EIEnhancedScript> {
    if (!rawScript?.trim()) {
      return { enhancedScript: rawScript, dominantEmotion: "neutral", emotionalArc: "steady", microBeats: [] };
    }

    try {
      const res = await this.client.messages.create({
        model:      "claude-haiku-4-5-20251001",
        max_tokens: 700,
        system:     GHOST_SYSTEM_PROMPT,
        messages: [{
          role:    "user",
          content: `Niche: ${niche}

Original Script:
${rawScript.trim()}

Return a JSON object (no markdown):
{
  "enhancedScript": "improved script text",
  "dominantEmotion": "one word — the core feeling",
  "emotionalArc": "3-word arc e.g. doubt→trust→relief",
  "microBeats": ["subtle visual cue 1", "subtle visual cue 2", "subtle visual cue 3"]
}`,
        }],
      });

      const raw   = res.content[0]?.type === "text" ? res.content[0].text : "";
      const start = raw.indexOf("{");
      const end   = raw.lastIndexOf("}");
      const parsed = JSON.parse(raw.slice(start, end + 1)) as Partial<EIEnhancedScript>;

      return {
        enhancedScript:  parsed.enhancedScript  ?? rawScript,
        dominantEmotion: parsed.dominantEmotion ?? "authentic",
        emotionalArc:    parsed.emotionalArc    ?? "steady",
        microBeats:      parsed.microBeats       ?? [],
      };
    } catch (err) {
      console.warn("[EI_LAYER] analyze failed, using defaults:", (err as Error).message);
      return { enhancedScript: rawScript, dominantEmotion: "authentic", emotionalArc: "steady", microBeats: [] };
    }
  }

  /**
   * Build the final video prompt enriched with emotional intelligence.
   * Called by the video generation pipeline — invisible to the user.
   */
  async buildFinalVideoPrompt(
    script:   string,
    niche:    string,
    duration: number,
    tool:     RenderTool = "kling",
  ): Promise<string> {
    const emotionalScript = await this.enhanceScript(script, niche, "heartwarming");

    const toolNote = tool === "runway"
      ? "Runway Gen-4: maintain continuous character identity, no cuts, smooth temporal coherence."
      : "Kling Pro: image-to-video, 10-second clip, natural physics, no supernatural effects.";

    return `Create a continuous cinematic video, ${duration} seconds, 4K.

Style: Roger Deakins golden hour dramatic lighting, teal-orange color grade.
${toolNote}

${emotionalScript}

Maintain smooth camera that follows the emotional journey.
Naturalistic lighting. High emotional authenticity.
Subject always faces camera. No text overlays.`;
  }
}

// Singleton for import convenience
export const ghostEI = new EmotionalIntelligenceLayer();
