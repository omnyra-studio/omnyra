const FALLBACK_VOICE =
  "Sometimes the greatest breakthrough happens when you stop moving and witness the impossible.";

/** Aggressive cleaning — returns VOICE-OVER line when present, else stripped text or fallback. */
export function cleanScriptForVoice(rawScript: string): string {
  let text = rawScript || "";

  text = text.replace(/CINEMATIC:|Wide shot:|Close-up:|MOVEMENT:|SOUND:|FINAL FRAME:|VOICE-OVER.*?:/gi, "");
  text = text.replace(/\b(wide shot|close-up|camera|sound cue|echoes|holds|disperses|micro-expression)\b/gi, "");
  text = text.replace(/\[.*?\]/g, "");
  text = text.replace(/^\s*[-•]\s*/gm, "");

  const voMatch =
    rawScript.match(/VOICE-OVER.*?[""\u201C](.+?)[""\u201D]/i) ||
    rawScript.match(/VOICE-OVER.*?:\s*(.+?)(?=\.|$)/i);

  if (voMatch?.[1]) {
    return voMatch[1].trim();
  }

  return text.trim() || FALLBACK_VOICE;
}