// Maps emotional arc and active emotions to ElevenLabs voice_settings parameters.

export interface ElevenLabsVoiceSettings {
  stability:         number;
  similarity_boost:  number;
  style:             number;
  use_speaker_boost: boolean;
}

export function getVoiceSettings(
  emotionalArc:    string,
  activeEmotions:  string[] = [],
): ElevenLabsVoiceSettings {
  let stability        = 0.85;
  let style            = 0.75;
  const similarityBoost = 0.90;

  const arc      = emotionalArc.toLowerCase();
  const emotions = activeEmotions.map(e => e.toLowerCase());

  if (arc.includes("intense") || emotions.includes("anger")) {
    stability = 0.65;
    style     = 0.95;
  } else if (arc.includes("melancholic") || emotions.includes("sadness") || emotions.includes("longing")) {
    stability = 0.90;
    style     = 0.85;
  } else if (arc.includes("triumphant") || emotions.includes("joy") || emotions.includes("determination")) {
    stability = 0.80;
    style     = 0.90;
  } else if (arc.includes("heartfelt") || emotions.includes("love")) {
    stability = 0.88;
    style     = 0.80;
  } else if (arc.includes("fear") || emotions.includes("fear") || emotions.includes("surprise")) {
    stability = 0.70;
    style     = 0.92;
  }

  return {
    stability,
    similarity_boost:  similarityBoost,
    style,
    use_speaker_boost: true,
  };
}
