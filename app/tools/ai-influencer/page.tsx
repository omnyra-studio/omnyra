import GenerationFlow from '@/components/creation/GenerationFlow';
import AnimatedBackground from '@/components/AnimatedBackground';

export default function AiInfluencerPage() {
  return (
    <>
      <AnimatedBackground />
      <div className="min-h-screen text-white relative z-10 pt-20" style={{ background: '#0A0010' }}>
        <div className="max-w-2xl mx-auto px-6 py-12">
          <h1 className="text-3xl font-bold text-white mb-2">🤳 AI Influencer Clip</h1>
          <p className="text-purple-300 text-sm mb-10">Any face. Any scene. Any vibe.</p>
          <GenerationFlow toolId="ai-influencer" toolName="AI Influencer Clip" modelOverride="hedra" />
        </div>
      </div>
    </>
  );
}
