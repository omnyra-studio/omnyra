import GenerationFlow from '@/components/creation/GenerationFlow';
import AnimatedBackground from '@/components/AnimatedBackground';
import Link from 'next/link';

export default function ProductLaunchPage() {
  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: '#1A0E1C' }}>
      <AnimatedBackground />
      <div className="relative z-10 px-4 py-10">
        <Link
          href="/create"
          style={{ color: '#9370DB', fontSize: '0.875rem', display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 32, textDecoration: 'none' }}
        >
          ← Create
        </Link>
        <GenerationFlow toolId="product-launch" toolName="Product Launch" modelOverride="kling" />
      </div>
    </div>
  );
}
