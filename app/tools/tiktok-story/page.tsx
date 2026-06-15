import GenerationFlow from '@/components/creation/GenerationFlow';
import Navbar from '@/components/Navbar';
import AnimatedBackground from '@/components/AnimatedBackground';

export default function TikTokStoryPage() {
  return (
    <>
      <Navbar />
      <AnimatedBackground />
      <div className="min-h-screen text-white relative z-10 pt-20" style={{ background: '#0A0010' }}>
        <div className="max-w-2xl mx-auto px-6 py-12">
          <h1 className="text-3xl font-bold text-white mb-2">🎬 TikTok Storytime</h1>
          <p className="text-purple-300 text-sm mb-10">Hook. Tension. Payoff. Built to retain.</p>
          <GenerationFlow toolId="tiktok-story" toolName="TikTok Storytime" modelOverride="kling" />
        </div>
      </div>
    </>
  );
}
