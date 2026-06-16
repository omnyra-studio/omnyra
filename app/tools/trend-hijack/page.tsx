import GenerationFlow from '@/components/creation/GenerationFlow';
import AnimatedBackground from '@/components/AnimatedBackground';

export default function TrendHijackPage() {
  return (
    <>
      <AnimatedBackground />
      <div className="min-h-screen text-white relative z-10 pt-20" style={{ background: '#0A0010' }}>
        <div className="max-w-2xl mx-auto px-6 py-12">
          <h1 className="text-3xl font-bold text-white mb-2">⚡ Trend Hijack</h1>
          <p className="text-purple-300 text-sm mb-10">Trending audio → your content in 60 seconds.</p>
          <GenerationFlow toolId="trend-hijack" toolName="Trend Hijack" modelOverride="pika" />
        </div>
      </div>
    </>
  );
}
