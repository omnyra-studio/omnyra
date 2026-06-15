import Navbar from '@/components/Navbar';
import TestimonialsCarousel from '@/components/TestimonialsCarousel';

export default function Home() {
  return (
    <main className="bg-[#0F0A1F] text-white overflow-x-hidden">
      <Navbar />

      {/* ── HERO ──────────────────────────────────────────────────────────────── */}
      <section className="min-h-[100dvh] flex items-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(76,29,149,0.4)_0%,transparent_70%)] pointer-events-none" />

        <div className="max-w-5xl mx-auto px-6 pt-20 relative z-10">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-950 border border-purple-700 rounded-full mb-8 text-sm text-purple-300">
              👻 Ghost Test Certified
            </div>

            <h1 className="text-7xl md:text-8xl font-bold tracking-tighter leading-none mb-8">
              Understand emotion deeply.<br />
              <span className="bg-gradient-to-r from-purple-400 via-fuchsia-300 to-purple-400 bg-clip-text text-transparent">
                Show it visually.
              </span>
            </h1>

            <p className="text-2xl text-purple-200 mb-10 max-w-2xl leading-relaxed">
              The first AI video platform that combines deep Emotional Intelligence with strict Ghost Test enforcement.
            </p>

            <div className="flex flex-wrap gap-4 mb-12">
              <a href="/create" className="px-10 py-5 bg-white text-black font-semibold rounded-2xl text-xl hover:scale-105 transition-all">
                Start Creating
              </a>
              <a href="#how" className="px-10 py-5 border border-purple-600 text-purple-200 rounded-2xl text-xl hover:bg-purple-950/60 transition-all">
                See How It Works
              </a>
            </div>

            <div className="flex items-center gap-6 text-sm text-purple-500 flex-wrap">
              <span>✦ No credit card required</span>
              <span className="opacity-30">•</span>
              <span>✦ Free plan forever</span>
              <span className="opacity-30">•</span>
              <span>✦ Kling · Hedra · ElevenLabs · Pika · Runway</span>
            </div>
          </div>
        </div>

        <div className="hidden lg:block absolute bottom-0 right-0 text-[380px] opacity-[0.05] leading-none select-none pointer-events-none">👻</div>
      </section>

      <div className="h-px bg-gradient-to-r from-transparent via-purple-800/60 to-transparent" />

      {/* ── GHOST TEST ────────────────────────────────────────────────────────── */}
      <section className="py-24 bg-purple-950/30">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <p className="text-xs font-bold tracking-[0.2em] uppercase text-purple-400 mb-4">The Ghost Test</p>
          <h2 className="text-5xl font-bold mb-8">
            If a silent ghost watched your video,<br />
            <span className="text-purple-400">would they understand?</span>
          </h2>
          <p className="text-xl text-purple-300 max-w-3xl mx-auto mb-12 leading-relaxed">
            A silent, invisible ghost watches your video. No dialogue, no narration. They should understand exactly what the characters are feeling — purely through body language, actions, and environment.
          </p>

          <div className="grid md:grid-cols-2 gap-6 text-left">
            <div className="bg-red-950/20 border border-red-900/40 rounded-2xl p-7">
              <p className="text-xs uppercase tracking-widest font-bold text-red-400 mb-4">❌ Fails the Ghost Test</p>
              <ul className="space-y-3 text-sm text-purple-500">
                {['"She was heartbroken"', '"He felt furious inside"', '"They were deeply in love"', '"Moments of intense sadness"'].map(t => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
            <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-2xl p-7">
              <p className="text-xs uppercase tracking-widest font-bold text-emerald-400 mb-4">✓ Passes the Ghost Test</p>
              <ul className="space-y-3 text-sm text-purple-300">
                {[
                  '"She stares at the unopened envelope for 12 seconds, fingers trembling, then pushes it away"',
                  '"He slams the plate down so hard it cracks — chest heaving, jaw locked"',
                  '"Their hands almost touch on the bench. Then don\'t."',
                ].map(t => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-10 inline-flex items-center gap-3 px-6 py-3 rounded-full bg-emerald-950/30 border border-emerald-800/40 text-emerald-400 text-sm font-semibold">
            ✓ Omnyra enforces this standard on every generation
          </div>
        </div>
      </section>

      <div className="h-px bg-gradient-to-r from-transparent via-purple-800/60 to-transparent" />

      {/* ── HOW IT WORKS ──────────────────────────────────────────────────────── */}
      <section id="how" className="py-24 bg-black/30 scroll-mt-20">
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-xs font-bold tracking-[0.2em] uppercase text-purple-400 mb-4 text-center">How It Works</p>
          <h2 className="text-5xl font-bold text-center mb-4">Feel it. Show it.</h2>
          <p className="text-purple-300 text-center mb-16 text-lg">5-stage Emotional Intelligence pipeline.</p>

          <div className="grid md:grid-cols-5 gap-5">
            {[
              { num: '01', title: 'Analyze',  icon: '🔬', desc: 'Ghost Test scoring + emotional beat mapping' },
              { num: '02', title: 'Script',   icon: '✍️', desc: 'Feelings into observable physical actions' },
              { num: '03', title: 'Generate', icon: '🎬', desc: 'Kling, Hedra, Pika, Runway & more' },
              { num: '04', title: 'Voice',    icon: '🎙️', desc: 'ElevenLabs with emotion-tuned settings' },
              { num: '05', title: 'Stitch',   icon: '🎞️', desc: 'Professional FFmpeg sync · ready to post' },
            ].map(step => (
              <div key={step.num} className="bg-purple-950/30 border border-purple-900/60 rounded-3xl p-7 flex flex-col gap-3">
                <div className="text-purple-500 text-xs font-mono">{step.num}</div>
                <div className="text-3xl">{step.icon}</div>
                <div className="text-xl font-semibold text-white">{step.title}</div>
                <p className="text-sm text-purple-400 leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="h-px bg-gradient-to-r from-transparent via-purple-800/60 to-transparent" />

      {/* ── TESTIMONIALS ──────────────────────────────────────────────────────── */}
      <TestimonialsCarousel />

      <div className="h-px bg-gradient-to-r from-transparent via-purple-800/60 to-transparent" />

      {/* ── FINAL CTA ─────────────────────────────────────────────────────────── */}
      <section className="py-32 text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-purple-950/30 to-black/60 pointer-events-none" />
        <div className="relative z-10 max-w-3xl mx-auto px-6">
          <h2 className="text-5xl md:text-6xl font-bold mb-6">
            Ready to create videos<br />that actually feel real?
          </h2>
          <p className="text-xl text-purple-300 mb-10">
            Join creators using Ghost Test AI to build emotionally intelligent content — no prompt engineering required.
          </p>
          <a href="/create" className="inline-block px-12 py-6 bg-gradient-to-r from-purple-600 to-fuchsia-600 rounded-3xl text-2xl font-semibold hover:brightness-110 transition-all">
            Start Free →
          </a>
          <p className="text-sm text-purple-600 mt-6">No credit card required · 30 credits free</p>
        </div>
        <div className="absolute bottom-0 right-8 text-[200px] opacity-[0.04] leading-none select-none pointer-events-none">👻</div>
      </section>
    </main>
  );
}
