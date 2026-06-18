import GenerationFlow from '@/components/creation/GenerationFlow';
import AnimatedBackground from '@/components/AnimatedBackground';

export default function CinematicPage() {
  return (
    <>
      <AnimatedBackground />
      <div className="min-h-screen text-white relative z-10 pt-20" style={{ background: '#0A0010' }}>
        <div className="max-w-2xl mx-auto px-6 py-12">
          <h1 className="text-3xl font-bold text-white mb-2">🎥 Cinematic Video</h1>
          <p className="text-purple-300 text-sm mb-10">
            Paste any prompt. 30 seconds of cinema-grade motion — Seedance via ElevenLabs.
          </p>
          <GenerationFlow
            toolId="cinematic"
            toolName="Cinematic Video"
            modelOverride="seedance"
            defaultFlowMode="direct"
            cinematicOnly
          />
        </div>
      </div>
    </>
  );
}