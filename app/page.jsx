'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import AnimatedBackground from '@/components/AnimatedBackground';

const TOOLS = [
  {
    id:    'viral-ugc',
    emoji: '🎬',
    title: 'Viral UGC Ad',
    desc:  'Hook-driven ads that stop the scroll. Fast + premium.',
    href:  '/create/viral-ugc',
  },
  {
    id:    'tiktok-story',
    emoji: '📱',
    title: 'TikTok Storytime',
    desc:  'Narrative arc. Tension. Payoff. Built to retain.',
    href:  '/create/tiktok-story',
  },
  {
    id:    'ai-influencer',
    emoji: '👤',
    title: 'AI Influencer Clip',
    desc:  'Your AI persona. Any scene. Any vibe. No limits.',
    href:  '/create/ai-influencer',
  },
  {
    id:    'product-launch',
    emoji: '🛍️',
    title: 'Product Launch Reel',
    desc:  'Turn any product into cinematic social content.',
    href:  '/create/product-launch',
  },
  {
    id:    'faceless',
    emoji: '😶',
    title: 'Faceless Content',
    desc:  'Voice + visuals. No face. No limits. Just results.',
    href:  '/create/faceless',
  },
  {
    id:    'voice-studio',
    emoji: '🎙️',
    title: 'Voice Studio',
    desc:  'Choose from 1,000+ voices or clone your own in 30 seconds.',
    href:  '/voice-studio',
  },
];

export default function HomePage() {
  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: '#1A0E1C' }}>
      <AnimatedBackground />

      <div className="relative z-10 max-w-5xl mx-auto px-6 py-16">
        <div className="text-center mb-14">
          <p
            className="text-sm font-semibold tracking-widest uppercase mb-4"
            style={{ color: 'var(--accent-gold)' }}
          >
            Omnyra Studio
          </p>
          <h1
            className="font-display text-5xl md:text-6xl font-bold mb-5"
            style={{
              background:           'var(--gold-gradient)',
              backgroundSize:       '200% auto',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor:  'transparent',
              backgroundClip:       'text',
              animation:            'metalShimmer 3s linear infinite',
            }}
          >
            What are we creating today?
          </h1>
          <p className="text-lg" style={{ color: 'var(--text-secondary)' }}>
            Understand emotion deeply. Show it visually.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {TOOLS.map((tool) => (
            <Link
              key={tool.id}
              href={tool.href}
              className="group relative flex flex-col justify-between p-6 rounded-2xl border hover:border-[rgba(212,168,67,0.45)] hover:shadow-[0_0_40px_-12px_rgba(212,168,67,0.25)] transition-all duration-200 min-h-[200px] overflow-hidden"
              style={{
                background:     'rgba(75,30,130,0.75)',
                backdropFilter: 'blur(12px)',
                border:         '1px solid rgba(207,164,47,0.2)',
              }}
            >
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                <div
                  className="absolute -top-20 -right-20 w-40 h-40 rounded-full blur-3xl"
                  style={{ background: 'var(--glow-gold)' }}
                />
              </div>

              <div className="relative">
                <div
                  className="mb-4 flex items-center justify-center text-[26px]"
                  style={{
                    width: 52, height: 52, borderRadius: 12,
                    background: 'rgba(207,164,47,0.25)',
                    border: '1px solid rgba(207,164,47,0.5)',
                    boxShadow: '0 0 12px rgba(207,164,47,0.2)',
                  }}
                >
                  {tool.emoji}
                </div>
                <h3 className="text-lg font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                  {tool.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {tool.desc}
                </p>
              </div>

              <div
                className="mt-6 inline-flex items-center gap-1.5 self-start"
                style={{
                  padding: '8px 20px', borderRadius: 9999,
                  background: 'linear-gradient(105deg, #5A3400 0%, #9A7010 20%, #CFA42F 42%, #E8C84A 50%, #CFA42F 58%, #9A7010 80%, #5A3400 100%)',
                  backgroundSize: '200% auto',
                  animation: 'metalShimmer 3s linear infinite',
                  color: '#0D0010', fontSize: 13, fontWeight: 700, letterSpacing: '0.03em',
                  boxShadow: '0 0 16px rgba(207,164,47,0.4), inset 0 0 0 1px rgba(255,251,204,0.3)',
                }}
              >
                <span>Create</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
