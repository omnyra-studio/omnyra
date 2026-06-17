'use client';

import Link from 'next/link';
import AnimatedBackground from '@/components/AnimatedBackground';
import { NICHE_TOOLS } from '@/lib/tools-config';

export default function ToolsPage() {
  return (
    <>
      <AnimatedBackground />
      <div className="min-h-screen text-white relative z-10 pt-20" style={{ background: '#0A0010' }}>
        <div className="max-w-6xl mx-auto px-6 py-12">
          <div className="text-center mb-14">
            <h1 className="text-5xl font-bold tracking-tight mb-4 bg-gradient-to-r from-purple-400 to-fuchsia-400 bg-clip-text text-transparent">
              What are we creating today?
            </h1>
            <p className="text-lg text-purple-300">Understand emotion deeply. Show it visually.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {NICHE_TOOLS.map((tool) => (
              <div
                key={tool.id}
                className="group rounded-2xl border border-purple-900/50 hover:border-[#C084FC] transition-all duration-300 hover:shadow-[0_0_24px_rgba(192,132,252,0.25)]"
                style={{ background: '#1A0A2E' }}
              >
                <div className="p-7">
                  <div className="flex items-start justify-between mb-4">
                    <div className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br ${tool.color} text-3xl`}>
                      {tool.icon}
                    </div>
                    <span className="text-xs text-purple-400 border border-purple-800 rounded-full px-2.5 py-1 flex items-center gap-1.5">
                      👻 Ghost Test
                    </span>
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-1 leading-snug">{tool.title}</h3>
                  <p className="text-purple-300 text-sm leading-relaxed mb-6">{tool.desc}</p>
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
