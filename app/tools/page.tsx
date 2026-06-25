'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import AnimatedBackground from '@/components/AnimatedBackground';
import { NICHE_TOOLS } from '@/lib/tools-config';

export default function ToolsPage() {
  const router = useRouter();
  const [niche, setNiche] = useState('kindness');
  const [platform, setPlatform] = useState('');

  function handleLaunch() {
    if (niche) router.push(`/tools/${niche}`);
  }

  return (
    <>
      <AnimatedBackground />
      <div className="min-h-screen text-white relative z-10 pt-20" style={{ background: '#0A0010' }}>
        <div className="max-w-2xl mx-auto px-6 py-12">
          <div className="text-center mb-10">
            <h1 className="text-5xl font-bold tracking-tight mb-4 bg-gradient-to-r from-purple-400 to-fuchsia-400 bg-clip-text text-transparent">
              What are we creating today?
            </h1>
            <p className="text-lg text-purple-300">Understand emotion deeply. Show it visually.</p>
          </div>

          <div className="rounded-2xl border border-purple-900/50 p-8" style={{ background: '#1A0A2E' }}>
            <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="flex-1">
                <label className="block text-sm font-medium text-purple-300 mb-2">Target Platform</label>
                <select
                  value={platform}
                  onChange={e => setPlatform(e.target.value)}
                  className="w-full p-3 rounded-xl border border-zinc-700 text-white text-sm focus:outline-none focus:border-purple-500"
                  style={{ background: '#0A0010' }}
                >
                  <option value="">Select Platform</option>
                  <option value="instagram">Instagram Reels</option>
                  <option value="tiktok">TikTok</option>
                  <option value="youtube">YouTube Shorts</option>
                  <option value="facebook">Facebook</option>
                </select>
              </div>

              <div className="flex-1">
                <label className="block text-sm font-medium text-purple-300 mb-2">Video Niche</label>
                <select
                  value={niche}
                  onChange={e => setNiche(e.target.value)}
                  className="w-full p-3 rounded-xl border border-zinc-700 text-white text-sm focus:outline-none focus:border-purple-500"
                  style={{ background: '#0A0010' }}
                >
                  {NICHE_TOOLS.map(tool => (
                    <option key={tool.id} value={tool.id}>
                      {tool.icon} {tool.title}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              onClick={handleLaunch}
              disabled={!niche}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-all duration-200 disabled:opacity-40"
              style={{ background: 'linear-gradient(to right, #9333ea, #c026d3)' }}
            >
              Launch →
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
