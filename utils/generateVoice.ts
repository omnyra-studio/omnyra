import { generateElevenLabsAudio } from './realElevenLabs';

export async function generateVoice({
  script,
  emotionalArc,
  activeEmotions,
  selectedVoiceId,
}: {
  script:           string;
  emotionalArc?:    string;
  activeEmotions?:  string[];
  selectedVoiceId?: string;
}) {
  const voiceId = selectedVoiceId || '21m00Tcm4TlvDq8ikWAM';

  if (process.env.ELEVENLABS_API_KEY) {
    // Map emotional arc to ElevenLabs style intensity
    const styleMap: Record<string, number> = {
      'rising-tension':   0.75,
      'heartfelt-journey': 0.55,
      'triumphant':        0.85,
      'melancholic-hope':  0.45,
      'intense-drama':     0.9,
      'neutral':           0.3,
    };
    const style = styleMap[emotionalArc ?? 'neutral'] ?? 0.5;

    return generateElevenLabsAudio({ text: script, voiceId, style });
  }

  // Stub fallback while key is not configured
  return {
    url:      `https://voice-generated-${Date.now()}.mp3`,
    duration: 45,
    voiceId,
  };
}
