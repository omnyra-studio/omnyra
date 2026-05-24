import Link from "next/link";
import AnimatedBackground from "@/components/AnimatedBackground";

export default function Landing() {
  return (
    <main className="bg-cream text-softbrown antialiased overflow-x-hidden">

      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-cream/80 backdrop-blur-xl border-b border-softgold/10">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="gold-text font-display text-2xl font-bold tracking-tight">Omnyra</span>
            <span className="w-2 h-2 rounded-full pulse-dot inline-block"></span>
          </div>
          <div className="hidden md:flex items-center gap-10 text-sm font-medium text-warmgray">
            <a href="#how-it-works" className="hover:text-deepgold transition-colors duration-300">How It Works</a>
            <a href="#features" className="hover:text-deepgold transition-colors duration-300">Features</a>
            <a href="#pricing" className="hover:text-deepgold transition-colors duration-300">Pricing</a>
          </div>
          <Link
            href="#pricing"
            className="px-5 py-2.5 bg-softgold/10 border border-softgold/30 text-deepgold text-sm font-semibold rounded-full hover:bg-softgold/20 transition-all duration-300"
          >
            Get Early Access
          </Link>
        </div>
      </nav>

      {/* HERO */}
      <section
        className="relative min-h-screen flex items-center justify-center overflow-hidden"
        style={{ background: '#0D0010' }}
      >
        <AnimatedBackground />

        <div className="max-w-6xl mx-auto px-6 py-32 text-center" style={{ position: 'relative', zIndex: 2 }}>
          <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-full border border-softgold/30 bg-softgold/[0.08] mb-10 animate-fade-in backdrop-blur-md">
            <span className="w-2 h-2 rounded-full pulse-dot inline-block"></span>
            <span className="text-xs font-bold text-deepgold tracking-[0.2em] uppercase">Adaptive Creative Intelligence</span>
          </div>

          <h1 className="font-display text-5xl md:text-7xl lg:text-8xl font-bold leading-[1.05] mb-8 text-softbrown">
            <span className="block animate-fade-up">Predict what</span>
            <span className="block text-gold-gradient animate-fade-up" style={{ animationDelay: "0.15s" }}>performs.</span>
            <span className="block animate-fade-up" style={{ animationDelay: "0.3s" }}>Then learn why.</span>
          </h1>

          <p className="text-lg md:text-xl text-warmgray max-w-3xl mx-auto mb-4 leading-relaxed animate-fade-up" style={{ animationDelay: "0.45s" }}>
            Omnyra compares what it predicted to what actually happened — then adjusts. The only creative intelligence system that understands what you should make next and why.
          </p>

          <p className="text-sm text-warmgray mb-12 animate-fade-up" style={{ animationDelay: "0.5s" }}>
            Predicts hook strength • Tracks audience behavior • Learns from every post outcome
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-5 animate-fade-up" style={{ animationDelay: "0.6s" }}>
            <Link href="#pricing" className="w-full sm:w-auto px-10 py-5 gold-btn font-bold rounded-full text-lg">
              Understand What Works
            </Link>
            <a href="#how-it-works" className="w-full sm:w-auto px-10 py-5 btn-ghost font-semibold rounded-full text-lg">
              See How It Works →
            </a>
          </div>

          <div className="mt-20 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 text-sm text-warmgray animate-fade-in" style={{ animationDelay: "0.8s" }}>
            <div className="flex items-center gap-2">
              <span className="text-deepgold text-lg">✦</span>
              <span>Predicts Hook Strength</span>
            </div>
            <div className="w-1 h-1 rounded-full bg-warmgray/30 hidden md:block"></div>
            <div className="flex items-center gap-2">
              <span className="text-deepgold text-lg">✦</span>
              <span>Tracks Audience Behavior</span>
            </div>
            <div className="w-1 h-1 rounded-full bg-warmgray/30 hidden md:block"></div>
            <div className="flex items-center gap-2">
              <span className="text-deepgold text-lg">✦</span>
              <span>Learns From Every Outcome</span>
            </div>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-40" style={{ background: 'linear-gradient(to top, #0D0010, transparent)', zIndex: 2 }}></div>
      </section>

      {/* THE STRATEGIC SHIFT */}
      <section id="how-it-works" className="relative py-24 px-6 scroll-mt-20">
        <div className="max-w-5xl mx-auto text-center">
          <p className="text-xs font-bold text-deepgold tracking-[0.2em] uppercase mb-4">The Strategic Shift</p>
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
              <p className="text-xs text-warmgray uppercase tracking-widest mb-6">Traditional AI Tools</p>
              <div className="space-y-5 text-sm text-warmgray">
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
              <div className="space-y-5 text-sm text-warmgray">
                <div className="flex items-start gap-4">
                  <span className="text-deepgold text-xl mt-0.5">✓</span>
                  <span>Predicts what&apos;s likely to perform <span className="text-softbrown font-medium">before</span> you create</span>
                </div>
                <div className="flex items-start gap-4">
                  <span className="text-deepgold text-xl mt-0.5">✓</span>
                  <span>Real-time trend intelligence + audience psychographics</span>
                </div>
                <div className="flex items-start gap-4">
                  <span className="text-deepgold text-xl mt-0.5">✓</span>
                  <span>Every hook comes with strategic reasoning + risk assessment</span>
                </div>
                <div className="flex items-start gap-4">
                  <span className="text-deepgold text-xl mt-0.5">✓</span>
                  <span>Compares predictions to outcomes — then adjusts automatically</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* WORKFLOW */}
      <section className="relative py-24 px-6 bg-sand/50">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-bold text-deepgold tracking-[0.2em] uppercase mb-4 text-center">The Workflow</p>
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

      {/* FEATURES + DEMO */}
      <section id="features" className="relative py-24 px-6 scroll-mt-20">
        <div className="max-w-7xl mx-auto">
          <p className="text-xs font-bold text-deepgold tracking-[0.2em] uppercase mb-4 text-center">The Omnyra Difference</p>
          <h2 className="font-display text-4xl md:text-5xl font-bold text-softbrown text-center mb-20">
            Not a video factory.{" "}
            <span className="text-gold-gradient">An adaptive intelligence system.</span>
          </h2>

          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div className="space-y-10">
              {[
                {
                  icon: "🧠",
                  title: "Strategy Briefs That Think",
                  desc: "Not "here's a hook." A full creative brief with objective, audience psychology, trend context, and honest risk assessment. Every recommendation has a reason.",
                },
                {
                  icon: "🎬",
                  title: "AI Creative Director",
                  desc: "Shot Intelligence breaks scripts into directed packets. Every shot has a psychological purpose, camera behavior, motion intensity, and energy curve — before a single frame is rendered.",
                },
                {
                  icon: "💾",
                  title: "Memory That Compounds",
                  desc: "Every brief you approve, every hook you reject, every post outcome — stored, embedded, and referenced. Six months of Omnyra data is irreplaceable. That's the moat.",
                },
                {
                  icon: "⚡",
                  title: "Falsifiable Predictions",
                  desc: '"I\'m 72% confident this hook will outperform your average by 15-20%. Here\'s why. Here\'s how we\'ll know if I\'m wrong. Here\'s what to try instead."',
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

      {/* THE FLYWHEEL */}
      <section className="relative py-24 px-6 bg-warmwhite">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-bold text-deepgold tracking-[0.2em] uppercase mb-4 text-center">The Flywheel</p>
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

      {/* PRICING */}
      <section id="pricing" className="relative py-24 px-6 bg-sand/50 scroll-mt-20">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-bold text-deepgold tracking-[0.2em] uppercase mb-4 text-center">Pricing</p>
          <h2 className="font-display text-4xl md:text-5xl font-bold text-softbrown text-center mb-4">
            Start with strategy.
          </h2>
          <p className="text-warmgray text-center mb-16 text-lg">Free to begin. Upgrade when you&apos;re ready to direct and execute.</p>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Starter */}
            <div className="glass-card rounded-3xl p-8 flex flex-col">
              <p className="text-sm font-bold text-softbrown mb-3">Starter</p>
              <p className="font-display text-5xl font-bold text-softbrown mb-4">Free</p>
              <p className="text-sm text-warmgray mb-8">For creators testing the waters.</p>
              <ul className="space-y-4 text-sm text-warmgray mb-10 flex-1">
                <li className="flex items-start gap-3"><span className="text-deepgold text-lg">✓</span> 3 strategy briefs / month</li>
                <li className="flex items-start gap-3"><span className="text-deepgold text-lg">✓</span> Basic hook generation</li>
                <li className="flex items-start gap-3"><span className="text-deepgold text-lg">✓</span> Lightweight scoring</li>
                <li className="flex items-start gap-3"><span className="text-warmgray/50">—</span> No video generation credits</li>
                <li className="flex items-start gap-3"><span className="text-warmgray/50">—</span> No creator memory</li>
              </ul>
              <Link href="/signup" className="block text-center w-full py-4 btn-ghost font-semibold rounded-full">
                Get Started Free
              </Link>
            </div>

            {/* Creator (featured) */}
            <div className="gold-border bg-warmwhite rounded-3xl p-8 flex flex-col relative md:-translate-y-4 shadow-2xl">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-5 py-1.5 bg-gradient-to-r from-softgold to-rosegold text-warmwhite text-xs font-bold rounded-full tracking-wide whitespace-nowrap">
                Most Popular
              </div>
              <p className="text-sm font-bold text-deepgold mb-3">Creator</p>
              <p className="font-display text-5xl font-bold text-softbrown mb-1">$29</p>
              <p className="text-sm text-warmgray mb-2">per month</p>
              <p className="text-xs text-deepgold font-medium mb-6">200 generation credits included</p>
              <ul className="space-y-4 text-sm text-warmgray mb-10 flex-1">
                <li className="flex items-start gap-3"><span className="text-deepgold text-lg">✓</span> Unlimited strategy briefs</li>
                <li className="flex items-start gap-3"><span className="text-deepgold text-lg">✓</span> Advanced hook system + reasoning</li>
                <li className="flex items-start gap-3"><span className="text-deepgold text-lg">✓</span> Full performance scoring</li>
                <li className="flex items-start gap-3"><span className="text-deepgold text-lg">✓</span> AI Creative Director (Shot Intel)</li>
                <li className="flex items-start gap-3"><span className="text-deepgold text-lg">✓</span> Creator memory + learning loop</li>
                <li className="flex items-start gap-3"><span className="text-deepgold text-lg">✓</span> 200 credits / month</li>
              </ul>
              <Link href="/signup?plan=creator" className="block w-full py-4 gold-btn font-bold rounded-full text-lg">
                Start Understanding Your Audience
              </Link>
            </div>

            {/* Pro */}
            <div className="glass-card rounded-3xl p-8 flex flex-col">
              <p className="text-sm font-bold text-softbrown mb-3">Pro</p>
              <p className="font-display text-5xl font-bold text-softbrown mb-1">$69</p>
              <p className="text-sm text-warmgray mb-2">per month</p>
              <p className="text-xs text-deepgold font-medium mb-6">500 generation credits included</p>
              <ul className="space-y-4 text-sm text-warmgray mb-10 flex-1">
                <li className="flex items-start gap-3"><span className="text-deepgold text-lg">✓</span> Everything in Creator</li>
                <li className="flex items-start gap-3"><span className="text-deepgold text-lg">✓</span> Trend deep dives & reports</li>
                <li className="flex items-start gap-3"><span className="text-deepgold text-lg">✓</span> A/B brief comparison</li>
                <li className="flex items-start gap-3"><span className="text-deepgold text-lg">✓</span> Premium rendering models</li>
                <li className="flex items-start gap-3"><span className="text-deepgold text-lg">✓</span> 500 credits / month</li>
              </ul>
              <Link href="/signup?plan=pro" className="block text-center w-full py-4 btn-ghost font-semibold rounded-full">
                Go Pro
              </Link>
            </div>
          </div>
        </div>
      </section>

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

      {/* FINAL CTA */}
      <section className="relative py-32 px-6 text-center bg-sand/50">
        <div className="max-w-3xl mx-auto">
          <h2 className="font-display text-4xl md:text-6xl font-bold text-softbrown mb-6">
            Ready to understand<br />
            <span className="text-gold-gradient">what actually works?</span>
          </h2>
          <p className="text-lg text-warmgray mb-10 max-w-xl mx-auto">
            Join the creators who learn from every post — not just produce more of them.
          </p>
          <Link href="/signup?plan=creator" className="inline-flex px-10 py-5 gold-btn font-bold rounded-full text-lg">
            Start Learning What Works — $29/month
          </Link>
          <p className="mt-6 text-sm text-warmgray">Free tier available. No credit card required to start.</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-softgold/10 py-12 px-6 bg-cream">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="gold-text font-display text-xl font-bold">Omnyra</span>
            <span className="text-xs text-warmgray">Adaptive Creative Intelligence</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-warmgray">
            <a href="#" className="hover:text-deepgold transition-colors">Twitter</a>
            <a href="#" className="hover:text-deepgold transition-colors">Privacy</a>
            <a href="#" className="hover:text-deepgold transition-colors">Terms</a>
            <a href="mailto:info@omnyra.studio" className="hover:text-deepgold transition-colors">info@omnyra.studio</a>
          </div>
          <p className="text-xs text-warmgray">© 2026 Omnyra. All rights reserved.</p>
        </div>
      </footer>

    </main>
  );
}
