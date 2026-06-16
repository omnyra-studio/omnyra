'use client';

import Link from 'next/link';
import AnimatedBackground from '@/components/AnimatedBackground';

const TOOLS = [
  { id: 'tiktok-story',  icon: '🎬', title: 'TikTok Storytime',   tagline: 'Hook. Tension. Payoff. Built to retain.' },
  { id: 'ai-influencer', icon: '🤳', title: 'AI Influencer Clip',  tagline: 'Any face. Any scene. Any vibe.' },
  { id: 'cinematic',     icon: '🎥', title: 'Cinematic Scene',     tagline: 'Ghost Test enforced. Cinema-grade storytelling.' },
  { id: 'script-studio', icon: '✍️', title: 'Script Studio',       tagline: 'Scripts only. Ghost Test scored. Export ready.' },
  { id: 'avatar',        icon: '👤', title: 'Avatar Presenter',    tagline: 'Talking head. Hedra lip-sync. Zero effort.' },
  { id: 'trend-hijack',  icon: '⚡', title: 'Trend Hijack',        tagline: 'Trending audio → your content in 60 seconds.' },
  { id: 'brand-story',   icon: '🏷️', title: 'Brand Story',         tagline: 'Long narrative. Short format. High impact.' },
  { id: 'tutorial',      icon: '🎓', title: 'Tutorial Builder',    tagline: 'Step-by-step. Any skill. Any niche.' },
];

export default function ToolsPage() {
  return (
    <>
      <AnimatedBackground />
      <div className="min-h-screen text-white relative z-10 pt-20" style={{ background: '#0A0010' }}>
        <div className="max-w-5xl mx-auto px-6 py-12">
          <div className="text-center mb-14">
            <h1 className="text-5xl font-bold tracking-tight mb-4 bg-gradient-to-r from-purple-400 to-fuchsia-400 bg-clip-text text-transparent">
              What are we creating today?
            </h1>
            <p className="text-lg text-purple-300">Understand emotion deeply. Show it visually.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {TOOLS.map((tool) => (
              <div
                key={tool.id}
                className="group rounded-2xl border border-purple-900/50 hover:border-[#C084FC] transition-all duration-300 hover:shadow-[0_0_24px_rgba(192,132,252,0.25)]"
                style={{ background: '#1A0A2E' }}
              >
                <div className="p-7">
                  <div className="flex items-start justify-between mb-4">
                    <span className="text-4xl">{tool.icon}</span>
                    <span className="text-xs text-purple-400 border border-purple-800 rounded-full px-2.5 py-1 flex items-center gap-1.5">
                      👻 Ghost Test Enforced
                    </span>
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">{tool.title}</h3>
                  <p className="text-purple-300 text-sm leading-relaxed mb-6">{tool.tagline}</p>
                  <Link
                    href={`/tools/${tool.id}`}
                    className="inline-block px-5 py-2.5 rounded-xl text-sm font-medium text-white border border-purple-700 hover:border-[#C084FC] hover:bg-purple-900/40 transition-all duration-200"
                  >
                    Launch →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
