import GenerationFlow from '@/components/creation/GenerationFlow';
import Navbar from '@/components/Navbar';
import AnimatedBackground from '@/components/AnimatedBackground';

export default function ScriptStudioPage() {
  return (
    <>
      <Navbar />
      <AnimatedBackground />
      <div className="min-h-screen text-white relative z-10 pt-20" style={{ background: '#0A0010' }}>
        <div className="max-w-2xl mx-auto px-6 py-12">
          <h1 className="text-3xl font-bold text-white mb-2">✍️ Script Studio</h1>
          <p className="text-purple-300 text-sm mb-10">Scripts only. Ghost Test scored. Export ready.</p>
          <GenerationFlow toolId="script-studio" toolName="Script Studio" scriptOnly />
        </div>
      </div>
    </>
  );
}
