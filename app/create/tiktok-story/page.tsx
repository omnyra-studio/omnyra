import GenerationFlow from '@/components/creation/GenerationFlow';
import Navbar from '@/components/Navbar';
import AnimatedBackground from '@/components/AnimatedBackground';

export default function TikTokStoryPage() {
  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: '#1A0E1C' }}>
      <AnimatedBackground />
      <Navbar />
      <div className="relative z-10 max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>📱 TikTok Storytime</h1>
        <p className="text-sm mb-10" style={{ color: 'var(--text-secondary)' }}>Narrative arc. Tension. Payoff. Built to retain.</p>
        <GenerationFlow toolId="tiktok-story" toolName="TikTok Storytime" modelOverride="kling" />
      </div>
    </div>
  );
}
