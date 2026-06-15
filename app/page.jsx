import Link from "next/link";
import Image from "next/image";
import { LegalFooter } from "@/components/legal-footer";

export default function Landing() {
  return (
    <main suppressHydrationWarning style={{ background: 'transparent' }} className="text-softbrown antialiased overflow-x-hidden">

      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl border-b" style={{ background: 'rgba(45,10,62,0.75)', borderColor: 'rgba(212,168,67,0.12)' }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between" style={{ padding: '8px 24px' }}>
          <div className="flex items-center gap-3">
            <span className="gold-text font-display text-2xl font-bold tracking-tight">Omnyra</span>
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#50B388', animation: 'pulseSoft 2.5s ease-in-out infinite', boxShadow: '0 0 6px rgba(80,179,136,0.6)' }}></span>
          </div>
          <div className="hidden md:flex items-center gap-10 text-sm font-medium" style={{ color: '#E8DEFF' }}>
            <a href="#how-it-works" className="hover:text-[#E879F9] transition-colors duration-300">How It Works</a>
            <a href="#features" className="hover:text-[#E879F9] transition-colors duration-300">Features</a>
            <Link href="/pricing" className="hover:text-[#E879F9] transition-colors duration-300">Pricing</Link>
            <Link href="/tools" className="hover:text-[#E879F9] transition-colors duration-300">Tools</Link>
          </div>
          <Link
            href="#pricing"
            className="px-5 py-2.5 text-sm font-semibold rounded-full transition-all duration-300"
            style={{ border: '1px solid rgba(212,168,67,0.3)', color: '#D4A843', background: 'rgba(212,168,67,0.08)' }}
          >
            Get Early Access
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section style={{
        position: 'relative',
        minHeight: '100vh',
        background: 'transparent',
      }}>
        <div style={{ position: 'relative', zIndex: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="max-w-6xl mx-auto px-6 text-center" style={{ paddingTop: '80px', paddingBottom: '40px' }}>

          {/* 1 — bullet row */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '20px',
            fontSize: '13px',
            color: '#BBA8C8',
            letterSpacing: '0.05em',
            marginBottom: '16px',
          }}>
            <span>✦ Characters</span>
            <span style={{ opacity: 0.3 }}>•</span>
            <span>✦ Brand</span>
            <span style={{ opacity: 0.3 }}>•</span>
            <span>✦ Style</span>
            <span style={{ opacity: 0.3 }}>•</span>
            <span>✦ Performance</span>
          </div>

          {/* 2 — logo */}
          <Image
            src="/omnyra-logo.png"
            alt="Omnyra"
            width={0}
            height={0}
            sizes="100vw"
            style={{
              height: '200px',
              width: 'auto',
              mixBlendMode: 'screen',
              filter: 'drop-shadow(0 0 20px rgba(207,164,47,0.5))',
              display: 'block',
              margin: '0 auto',
              marginBottom: '8px',
            }}
          />

          {/* 3 — pill badge */}
          <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full border mt-4 mb-4 animate-fade-in backdrop-blur-md" style={{ borderColor: 'rgba(232,121,249,0.3)', background: 'rgba(232,121,249,0.06)' }}>
            <span className="w-2 h-2 rounded-full inline-block" style={{ background: '#E879F9', animation: 'pulseSoft 2.5s ease-in-out infinite', boxShadow: '0 0 6px rgba(232,121,249,0.6)' }}></span>
            <span className="text-xs font-bold tracking-[0.2em] uppercase" style={{ color: '#E879F9' }}>Adaptive Creative Intelligence</span>
          </div>

          {/* 4 — heading */}
          <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-bold leading-[1.05] mb-4" style={{ color: '#F5EFE6' }}>
            <span className="block animate-fade-up" style={{ textShadow: '0 2px 20px rgba(0,0,0,0.8), 0 1px 4px rgba(0,0,0,0.9)' }}>AI Video That</span>
            <span className="block animate-fade-up" style={{ animationDelay: "0.15s" }}><span className="metallic-gold">Remembers.</span></span>
          </h1>

          {/* 5 — subtext */}
          <p className="text-lg md:text-xl max-w-3xl mx-auto mb-10 leading-relaxed animate-fade-up" style={{ color: '#E8DDD0', animationDelay: "0.3s", textShadow: '0 1px 8px rgba(0,0,0,0.9)' }}>
            Omnyra is the only AI video platform with persistent memory &mdash; so your content stays consistent and improves over time.
          </p>

          {/* 6 — buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-5 animate-fade-up" style={{ animationDelay: "0.6s" }}>
            <Link href="/pricing" className="w-full sm:w-auto px-10 py-5 gold-btn font-bold rounded-full text-lg">
              Start Free
            </Link>
            <a href="#how-it-works" className="w-full sm:w-auto px-10 py-5 rounded-full text-lg font-semibold" style={{ border: '1px solid #E8DEFF', color: '#E8DEFF' }}>
              Watch Demo →
            </a>
          </div>

        </div>
        </div>
      </section>

      <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(204,171,175,0.4), transparent)' }} />

      {/* WHY NOT TEMPLATE TOOLS */}
      <section className="relative py-20 px-6" style={{ background: 'rgba(45,10,62,0.4)' }}>
        <div className="max-w-4xl mx-auto">
          <p className="text-xs font-bold tracking-[0.2em] uppercase mb-4 text-center" style={{ color: '#E879F9' }}>The Real Problem</p>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-center mb-6" style={{ color: '#F5EFE6' }}>
            Most creators don&apos;t fail at editing.<br />They fail at choosing ideas.
          </h2>
          <p className="text-center text-lg mb-14" style={{ color: '#C0A4C8', maxWidth: '600px', margin: '0 auto 56px' }}>
            Template tools give you content. Omnyra helps you decide what content is worth making.
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="glass-card rounded-2xl p-7">
              <p className="text-xs uppercase tracking-widest mb-5" style={{ color: '#BBA8C8' }}>Template Tools</p>
              <ul className="space-y-3 text-sm" style={{ color: '#8B7A8E' }}>
                {['Speed without strategy', 'Single output — no comparison', 'No scoring or ranking', 'Fixed templates, no adaptation', 'Same output for every creator'].map(t => (
                  <li key={t} className="flex items-start gap-3"><span style={{ color: '#4A3A50' }}>—</span> {t}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl p-7" style={{ background: 'rgba(192,132,252,0.06)', border: '1px solid rgba(192,132,252,0.2)' }}>
              <p className="text-xs uppercase tracking-widest mb-5" style={{ color: '#C084FC' }}>Omnyra</p>
              <ul className="space-y-3 text-sm" style={{ color: '#E8DEFF' }}>
                {['Structured decision before creation', '6 ranked directions per idea', 'Fixed scoring formula — transparent', 'Session-aware preference biasing', 'Built around your content identity'].map(t => (
                  <li key={t} className="flex items-start gap-3"><span style={{ color: '#50B388' }}>✓</span> {t}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(204,171,175,0.2), transparent)' }} />

      {/* HONEST REALITY BLOCK */}
      <section className="relative py-16 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <div className="rounded-2xl p-8" style={{ background: 'rgba(212,168,67,0.06)', border: '1px solid rgba(212,168,67,0.2)' }}>
            <p className="text-xs font-bold tracking-[0.2em] uppercase mb-4" style={{ color: '#D4A843' }}>Honest</p>
            <h2 className="font-display text-2xl font-bold mb-4" style={{ color: '#F5EFE6' }}>
              We do not guarantee virality.
            </h2>
            <p className="text-base mb-3" style={{ color: '#C0A4C8', lineHeight: 1.7 }}>
              No AI tool can guarantee performance. Platform algorithms, audience behavior, and timing are outside any system&apos;s control.
            </p>
            <p className="text-base mb-5" style={{ color: '#C0A4C8', lineHeight: 1.7 }}>
              Omnyra improves direction, not outcomes. Better decisions before creation increase the likelihood of performance — not certainty of it.
            </p>
            <p className="text-sm" style={{ color: '#8B7A8E' }}>
              Virality is not guaranteed — outputs only increase the likelihood of performance based on predictive modeling.
            </p>
          </div>
        </div>
      </section>

      <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(204,171,175,0.2), transparent)' }} />

      {/* THE STRATEGIC SHIFT */}
      <section id="how-it-works" className="relative py-24 px-6 scroll-mt-20">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-xs font-bold tracking-[0.2em] uppercase mb-4" style={{ color: '#E879F9' }}>The Strategic Shift</p>
          <h2 className="font-display text-4xl md:text-5xl font-bold text-softbrown mb-6">
            AI tools tell creators <em>how</em> to make content.
          </h2>
          <p className="text-xl text-warmgray max-w-3xl mx-auto mb-16">
            Nobody is telling them{" "}
            <span className="text-deepgold font-semibold">what to make</span> and{" "}
            <span className="text-deepgold font-semibold">why it&apos;ll work</span> for their specific audience. Until Omnyra.
          </p>

          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <div className="glass-card rounded-3xl p-8 text-left">
              <p className="text-xs uppercase tracking-widest mb-6" style={{ color: '#BBA8C8' }}>Traditional AI Tools</p>
              <div className="space-y-5 text-sm" style={{ color: '#E0D0FF' }}>
                {[
                  "Generate random content, hope it works",
                  "No trend awareness or audience insight",
                  "Generic output, zero strategic reasoning",
                  "Expensive renders on unvalidated ideas",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-4">
                    <span className="text-rosegold text-xl mt-0.5">✕</span>
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border-golden rounded-3xl p-8 text-left">
              <p className="text-xs text-deepgold uppercase tracking-widest mb-6">Omnyra Adaptive Intelligence</p>
              <div className="space-y-5 text-sm" style={{ color: '#FFFFFF' }}>
                <div className="flex items-start gap-4">
                  <span className="text-xl mt-0.5" style={{ color: '#50B388' }}>✓</span>
                  <span>Predicts what&apos;s likely to perform <span className="font-medium">before</span> you create</span>
                </div>
                <div className="flex items-start gap-4">
                  <span className="text-xl mt-0.5" style={{ color: '#50B388' }}>✓</span>
                  <span>Real-time trend intelligence + audience psychographics</span>
                </div>
                <div className="flex items-start gap-4">
                  <span className="text-xl mt-0.5" style={{ color: '#50B388' }}>✓</span>
                  <span>Every hook comes with strategic reasoning + risk assessment</span>
                </div>
                <div className="flex items-start gap-4">
                  <span className="text-xl mt-0.5" style={{ color: '#50B388' }}>✓</span>
                  <span>Compares predictions to outcomes — then adjusts automatically</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(204,171,175,0.4), transparent)' }} />

      {/* WORKFLOW */}
      <section className="relative py-24 px-6" style={{ background: 'rgba(45,10,62,0.55)' }}>
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-bold tracking-[0.2em] uppercase mb-4 text-center" style={{ color: '#E879F9' }}>The Workflow</p>
          <h2 className="font-display text-4xl md:text-5xl font-bold text-softbrown text-center mb-20">
            Strategy → Direction → Execution
          </h2>

          <div className="grid md:grid-cols-5 gap-6">
            {[
              { n: "01", title: "Describe Your Goal", desc: "A viral skincare ad. A motivational TikTok. A faceless YouTube Short. Anything." },
              { n: "02", title: "Intelligence Layer", desc: "Analyzes trends, hooks, audience behavior, and your past performance patterns." },
              { n: "03", title: "Draft & Compare", desc: "Multiple hooks, scripts, and concepts — cheaply, before any render cost." },
              { n: "04", title: "Shot Intelligence", desc: "Every shot gets a purpose, camera behavior, and energy curve before rendering." },
              { n: "05", title: "Learn From Outcomes", desc: "Paste your post URL. Omnyra compares prediction to reality and adjusts." },
            ].map(({ n, title, desc }) => (
              <div key={n} className="glass-card rounded-2xl p-6 text-center">
                <div className="w-12 h-12 rounded-xl bg-softgold/15 border border-softgold/25 flex items-center justify-center text-deepgold font-mono text-xl font-bold mb-6 mx-auto">
                  {n}
                </div>
                <h3 className="font-semibold text-softbrown text-lg mb-3">{title}</h3>
                <p className="text-sm text-warmgray leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
          <div className="hidden md:block gold-line my-12"></div>
        </div>
      </section>

      <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(204,171,175,0.4), transparent)' }} />

      {/* FEATURES + DEMO */}
      <section id="features" className="relative py-24 px-6 scroll-mt-20">
        <div className="max-w-7xl mx-auto">
          <p className="text-xs font-bold tracking-[0.2em] uppercase mb-4 text-center" style={{ color: '#E879F9' }}>The Omnyra Difference</p>
          <h2 className="font-display text-4xl md:text-5xl font-bold text-softbrown text-center mb-20">
            Not a video factory.{" "}
            <span className="text-gold-gradient">An adaptive intelligence system.</span>
          </h2>

          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div className="space-y-10">
              {[
                {
                  icon: "🎭",
                  title: "Persistent Character Memory",
                  desc: "Same face, same voice, same energy across every video. Characters remember their look, tone, and brand identity — no re-uploading, no inconsistency.",
                },
                {
                  icon: "🧠",
                  title: "Smart Brand Memory Injection",
                  desc: "Every style preference, hook type, and performance lesson you've accumulated automatically shapes new content. Your brand gets smarter the more you use it.",
                },
                {
                  icon: "⚡",
                  title: "Creator Intelligence Suggestions",
                  desc: "After every generation, Omnyra surfaces actionable insights: hook strength score, estimated reach, best time to post, and what to try next.",
                },
                {
                  icon: "🎬",
                  title: "Multi-Model Production Engine",
                  desc: "Flux for cinematic images, ElevenLabs for studio-quality voice, Kling for video — all coordinated by a single intelligent engine with automatic fallbacks.",
                },
                {
                  icon: "💳",
                  title: "Reliable Billing & Usage Tracking",
                  desc: "Clear credit costs before you generate. No surprise charges. Real-time balance, full transaction history, and transparent tier limits.",
                },
              ].map(({ icon, title, desc }) => (
                <div key={title} className="flex gap-5">
                  <div className="w-12 h-12 rounded-xl bg-softgold/10 flex items-center justify-center text-2xl shrink-0">
                    {icon}
                  </div>
                  <div>
                    <h3 className="font-semibold text-softbrown text-xl mb-2">{title}</h3>
                    <p className="text-warmgray leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="relative">
              <div className="glass-card border-golden rounded-3xl p-6 overflow-hidden">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-rosegold/40"></div>
                  <div className="w-3 h-3 rounded-full bg-softgold/50"></div>
                  <div className="w-3 h-3 rounded-full bg-champagne/60"></div>
                  <span className="text-xs text-warmgray ml-2 font-mono">shot_packet.json</span>
                </div>
                <div className="code-block text-xs md:text-sm">
                  <span className="text-warmgray">{"// Omnyra Shot Intelligence"}</span>
                  <br />
                  {"{"}<br />
                  <span className="code-key">&quot;shot_id&quot;</span>:{" "}
                  <span className="code-string">&quot;03&quot;</span>,<br />
                  <span className="code-key">&quot;purpose&quot;</span>:{" "}
                  <span className="code-string">&quot;pattern_interrupt&quot;</span>,<br />
                  <span className="code-key">&quot;energy_curve&quot;</span>:{" "}
                  <span className="code-string">&quot;spike&quot;</span>,<br />
                  <span className="code-key">&quot;camera&quot;</span>:{" "}
                  <span className="code-string">&quot;whip_pan&quot;</span>,<br />
                  <span className="code-key">&quot;motion_intensity&quot;</span>:{" "}
                  <span className="code-value">0.85</span>,<br />
                  <span className="code-key">&quot;render_route&quot;</span>:{" "}
                  <span className="code-string">&quot;fal.ai/pixverse-v6&quot;</span>,<br />
                  <span className="code-key">&quot;fatigue_risk&quot;</span>:{" "}
                  <span className="code-value">0.1</span><br />
                  {"}"}
                </div>
                <p className="text-xs text-warmgray mt-4 text-center italic">Every shot directed before a single frame is rendered.</p>
              </div>
              <div className="absolute -top-4 -right-4 w-24 h-24 bg-softgold/20 rounded-full blur-2xl"></div>
              <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-rosegold/15 rounded-full blur-3xl"></div>
            </div>
          </div>
        </div>
      </section>

      <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(204,171,175,0.4), transparent)' }} />

      {/* THE FLYWHEEL */}
      <section className="relative py-24 px-6" style={{ background: 'rgba(45,10,62,0.55)' }}>
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-bold tracking-[0.2em] uppercase mb-4 text-center" style={{ color: '#E879F9' }}>The Flywheel</p>
          <h2 className="font-display text-4xl md:text-5xl font-bold text-softbrown text-center mb-6">
            Every post makes Omnyra smarter.
          </h2>
          <p className="text-lg text-warmgray max-w-2xl mx-auto text-center mb-20">
            Paste a link after you publish. Omnyra compares what it predicted to what actually happened — then adjusts. Most creator tools stop at generation. Omnyra learns from outcomes.
          </p>

          <div className="grid md:grid-cols-3 gap-8 mb-20">
            {[
              {
                icon: "🔗",
                title: "Paste Your Post URL",
                desc: "One field. Omnyra scrapes views, engagement, retention. Or use the 3-field manual fallback. Under thirty seconds.",
              },
              {
                icon: "📊",
                title: "Prediction vs. Reality",
                desc: '"You estimated 18-22K views. This hit 31K. The contrarian hook overperformed. We\'re updating your audience model."',
              },
              {
                icon: "🧠",
                title: "Compounding Memory",
                desc: "Every brief, every hook choice, every post outcome stored. Six months of Omnyra data is irreplaceable. That's the moat.",
              },
            ].map(({ icon, title, desc }) => (
              <div key={title} className="glass-card rounded-2xl p-8 text-center">
                <div className="text-4xl mb-4">{icon}</div>
                <h3 className="font-semibold text-softbrown text-lg mb-3">{title}</h3>
                <p className="text-sm text-warmgray leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>

          <div className="max-w-3xl mx-auto">
            <div className="glass-card border-golden rounded-3xl p-8">
              <p className="text-xs font-bold text-deepgold tracking-[0.15em] uppercase mb-6">What Omnyra Learned This Week</p>
              <div className="space-y-6 text-left">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-softgold/15 flex items-center justify-center shrink-0">🔍</div>
                  <div>
                    <p className="text-sm font-semibold text-softbrown">Your audience responds 2.3x better to direct contradiction hooks than question hooks</p>
                    <p className="text-sm text-warmgray">Posts where you challenge common advice outperform educational explainers. Your top 5 videos all start with &quot;Stop doing X&quot; or &quot;X is a lie.&quot; Your audience doesn&apos;t want to learn — they want their assumptions broken.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-softgold/15 flex items-center justify-center shrink-0">📈</div>
                  <div>
                    <p className="text-sm font-semibold text-softbrown">Your Tuesday post outperformed by 34%</p>
                    <p className="text-sm text-warmgray">The contrarian hook pattern is now your strongest. Your audience responds to being challenged, not taught.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-rosegold/15 flex items-center justify-center shrink-0">⚠️</div>
                  <div>
                    <p className="text-sm font-semibold text-softbrown">Retention dropped at 2.1s on Thursday&apos;s post</p>
                    <p className="text-sm text-warmgray">Same pattern as your February 14 post. Question-based hooks are underperforming. Consider retiring that pattern.</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-champagne/30 flex items-center justify-center shrink-0">💡</div>
                  <div>
                    <p className="text-sm font-semibold text-softbrown">Try this next week</p>
                    <p className="text-sm text-warmgray">Your audience is signaling they want contrarian takes with proof. Lead with the counterintuitive claim, back it with data by second 5.</p>
                  </div>
                </div>
              </div>
              <p className="text-xs text-warmgray mt-6 text-center italic">Delivered every Monday morning. Your adaptive creative partner, not a dashboard.</p>
            </div>
          </div>
        </div>
      </section>

      <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(204,171,175,0.4), transparent)' }} />

      {/* USE CASE BLOCK */}
      <section className="relative py-20 px-6" style={{ background: 'rgba(45,10,62,0.3)' }}>
        <div className="max-w-5xl mx-auto">
          <p className="text-xs font-bold tracking-[0.2em] uppercase mb-4 text-center" style={{ color: '#E879F9' }}>Who It&apos;s For</p>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-center mb-14" style={{ color: '#F5EFE6' }}>
            Built for people who want to be known,<br />not just seen.
          </h2>
          <div className="grid md:grid-cols-4 gap-5">
            {[
              { title: 'Creators', desc: 'Stop guessing your next hook. Get 6 structured options with scores — choose the strongest before you film.' },
              { title: 'Marketers', desc: 'Brief faster. Fewer revision cycles. Structured direction before production means less wasted spend.' },
              { title: 'Small Agencies', desc: 'Scale content decision-making across clients without scaling headcount or template dependency.' },
              { title: 'Content Teams', desc: 'Replace internal brainstorming chaos with a ranked, scored shortlist every time.' },
            ].map(({ title, desc }) => (
              <div key={title} className="glass-card rounded-2xl p-6">
                <p className="font-bold mb-3" style={{ color: '#C084FC', fontSize: 14 }}>{title}</p>
                <p className="text-sm leading-relaxed" style={{ color: '#C0A4C8' }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(204,171,175,0.3), transparent)' }} />

      {/* PRICING */}
      <section id="pricing" className="relative py-24 px-6 scroll-mt-20" style={{ background: 'rgba(45,10,62,0.55)' }}>
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-bold tracking-[0.2em] uppercase mb-4 text-center" style={{ color: '#E879F9' }}>Pricing</p>
          <h2 className="font-display text-4xl md:text-5xl font-bold text-softbrown text-center mb-4">
            Start with strategy.
          </h2>
          <p className="text-warmgray text-center mb-16 text-lg">Free to begin. Upgrade when you&apos;re ready to direct and execute.</p>

          <div className="grid md:grid-cols-4 gap-6">
            {/* Free */}
            <div className="glass-card rounded-3xl p-7 flex flex-col">
              <p className="text-sm font-bold text-softbrown mb-3">Free</p>
              <p className="font-display text-5xl font-bold text-softbrown mb-1">$0</p>
              <p className="text-sm mb-8" style={{ color: '#E8DEFF' }}>forever</p>
              <ul className="space-y-3 text-sm text-warmgray mb-10 flex-1">
                <li className="flex items-start gap-3"><span style={{ color: '#E879F9' }}>✓</span> 20 scripts &amp; captions / mo</li>
                <li className="flex items-start gap-3"><span style={{ color: '#E879F9' }}>✓</span> 5 images total</li>
                <li className="flex items-start gap-3"><span className="text-warmgray/50">—</span> No voice generation</li>
                <li className="flex items-start gap-3"><span className="text-warmgray/50">—</span> No video / avatar</li>
              </ul>
              <Link href="/signup" className="block text-center w-full py-3.5 btn-ghost font-semibold rounded-full text-sm">
                Get Started Free
              </Link>
            </div>

            {/* Starter */}
            <div className="glass-card rounded-3xl p-7 flex flex-col">
              <p className="text-sm font-bold text-softbrown mb-3">Starter</p>
              <p className="font-display text-5xl font-bold text-softbrown mb-1">$19</p>
              <p className="text-sm mb-8" style={{ color: '#E8DEFF' }}>AUD / month</p>
              <ul className="space-y-3 text-sm text-warmgray mb-10 flex-1">
                <li className="flex items-start gap-3"><span style={{ color: '#E879F9' }}>✓</span> Unlimited scripts &amp; captions</li>
                <li className="flex items-start gap-3"><span style={{ color: '#E879F9' }}>✓</span> 30 images / month</li>
                <li className="flex items-start gap-3"><span style={{ color: '#E879F9' }}>✓</span> 10 voice clips / month</li>
                <li className="flex items-start gap-3"><span className="text-warmgray/50">—</span> No video / avatar</li>
              </ul>
              <Link href="/signup?plan=starter" className="block text-center w-full py-3.5 btn-ghost font-semibold rounded-full text-sm">
                Start Creating
              </Link>
            </div>

            {/* Creator (featured) */}
            <div className="gold-border rounded-3xl p-7 flex flex-col relative shadow-2xl" style={{ background: 'rgba(75,30,130,0.65)' }}>
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-5 py-1.5 bg-gradient-to-r from-softgold to-rosegold text-warmwhite text-xs font-bold rounded-full tracking-wide whitespace-nowrap">
                Most Popular
              </div>
              <p className="text-sm font-bold text-deepgold mb-3">Creator</p>
              <p className="font-display text-5xl font-bold text-softbrown mb-1">$49</p>
              <p className="text-sm mb-8" style={{ color: '#E8DEFF' }}>AUD / month</p>
              <ul className="space-y-3 text-sm text-warmgray mb-10 flex-1">
                <li className="flex items-start gap-3"><span style={{ color: '#E879F9' }}>✓</span> Unlimited scripts &amp; captions</li>
                <li className="flex items-start gap-3"><span style={{ color: '#E879F9' }}>✓</span> 100 images / month</li>
                <li className="flex items-start gap-3"><span style={{ color: '#E879F9' }}>✓</span> 40 voice clips / month</li>
                <li className="flex items-start gap-3"><span style={{ color: '#E879F9' }}>✓</span> 5 videos / month</li>
                <li className="flex items-start gap-3"><span style={{ color: '#E879F9' }}>✓</span> 2 avatar generations / month</li>
              </ul>
              <Link href="/signup?plan=creator" className="block w-full py-3.5 gold-btn font-bold rounded-full text-sm text-center">
                Start Creating
              </Link>
            </div>

            {/* Studio */}
            <div className="glass-card rounded-3xl p-7 flex flex-col">
              <p className="text-sm font-bold text-softbrown mb-3">Studio</p>
              <p className="font-display text-5xl font-bold text-softbrown mb-1">$99</p>
              <p className="text-sm mb-8" style={{ color: '#E8DEFF' }}>AUD / month</p>
              <ul className="space-y-3 text-sm text-warmgray mb-10 flex-1">
                <li className="flex items-start gap-3"><span style={{ color: '#E879F9' }}>✓</span> Unlimited scripts &amp; captions</li>
                <li className="flex items-start gap-3"><span style={{ color: '#E879F9' }}>✓</span> 300 images / month</li>
                <li className="flex items-start gap-3"><span style={{ color: '#E879F9' }}>✓</span> 120 voice clips / month</li>
                <li className="flex items-start gap-3"><span style={{ color: '#E879F9' }}>✓</span> 20 videos / month</li>
                <li className="flex items-start gap-3"><span style={{ color: '#E879F9' }}>✓</span> 5 avatar generations / month</li>
              </ul>
              <Link href="/signup?plan=studio" className="block text-center w-full py-3.5 btn-ghost font-semibold rounded-full text-sm">
                Go Studio
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(204,171,175,0.4), transparent)' }} />

      {/* VISION QUOTE */}
      <section className="relative py-24 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <div className="text-6xl text-softgold/30 mb-6 font-display leading-none">&ldquo;</div>
          <p className="font-display text-2xl md:text-3xl text-softbrown italic leading-relaxed mb-8">
            Not &ldquo;we make videos.&rdquo;<br />
            We understand what you should make next,<br />
            why it will work, and whether it did.
          </p>
          <div className="gold-line w-32 mx-auto mb-8"></div>
          <p className="text-sm text-warmgray max-w-xl mx-auto">
            That&apos;s the difference between a video factory and an{" "}
            <span className="text-softbrown font-semibold">adaptive creative intelligence system.</span>
          </p>
        </div>
      </section>

      <div style={{ height: '1px', background: 'linear-gradient(90deg, transparent, rgba(204,171,175,0.4), transparent)' }} />

      {/* FINAL CTA */}
      <section className="relative py-32 px-6 text-center" style={{ background: 'rgba(45,10,62,0.55)' }}>
        <div className="max-w-3xl mx-auto">
          <h2 className="font-display text-4xl md:text-6xl font-bold text-softbrown mb-6">
            Ready to understand<br />
            <span className="text-gold-gradient">what actually works?</span>
          </h2>
          <p className="text-lg text-warmgray mb-10 max-w-xl mx-auto">
            Join the creators who learn from every post — not just produce more of them.
          </p>
          <Link href="/signup?plan=creator" className="inline-flex px-10 py-5 gold-btn font-bold rounded-full text-lg">
            Start Learning What Works — $49/month
          </Link>
          <p className="mt-6 text-sm text-warmgray">Free plan available. No credit card required to start.</p>
        </div>
      </section>

      {/* FOOTER */}
      <div style={{ background: 'rgba(45,10,62,0.55)' }}>
        {/* Brand bar */}
        <div className="border-t border-softgold/10 py-8 px-6">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="gold-text font-display text-xl font-bold">Omnyra</span>
              <span className="text-xs text-warmgray">Adaptive Creative Intelligence</span>
            </div>
            <div className="flex items-center gap-6 text-sm" style={{ color: '#E8DEFF' }}>
              <a href="/legal/privacy" className="hover:text-[#E879F9] transition-colors">Privacy</a>
              <a href="/legal/terms" className="hover:text-[#E879F9] transition-colors">Terms</a>
              <a href="/legal/refund" className="hover:text-[#E879F9] transition-colors">Refund Policy</a>
              <a href="/faq" className="hover:text-[#E879F9] transition-colors">FAQ</a>
              <a href="mailto:info@omnyra.studio" className="hover:text-[#E879F9] transition-colors" style={{ color: '#E8DEFF' }}>Contact</a>
            </div>
          </div>
        </div>
        {/* Legal disclaimer */}
        <LegalFooter />
      </div>

    </main>
  );
}
