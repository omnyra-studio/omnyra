"use client"; // v3
import { useRouter } from "next/navigation";

const plans = [
  {
    name: "FREE",
    price: "$0",
    period: "forever",
    tagline: '"Try creation"',
    credits: "50 credits/month",
    href: "/signup",
    features: [
      "5 script generations/day",
      "3 voice previews/week",
      "1 watermarked video/month",
      "Lip sync preview only — no export",
      "Unlimited draft previews",
    ],
    cta: "Get Started Free",
    highlight: false,
  },
  {
    name: "CREATOR",
    price: "$29",
    period: "/mo AUD",
    tagline: '"Post occasionally"',
    credits: "200 credits/month",
    href: "/signup?plan=creator",
    features: [
      "25 script generations/month",
      "15 voice generations/month",
      "6 final video renders/month",
      "6 lip sync exports/month",
      "Unlimited draft previews",
      "720p exports · No watermark",
    ],
    cta: "Get Creator",
    highlight: false,
  },
  {
    name: "PRO",
    price: "$69",
    period: "/mo AUD",
    tagline: '"Post consistently"',
    credits: "500 credits/month",
    href: "/signup?plan=pro",
    features: [
      "Unlimited script generations",
      "50 voice generations/month",
      "20 final video renders/month",
      "20 lip sync exports/month",
      "Unlimited draft previews",
      "1080p exports · No watermark",
      "Priority processing",
    ],
    cta: "Get Pro",
    highlight: true,
  },
  {
    name: "STUDIO",
    price: "$99",
    period: "/mo AUD",
    tagline: '"Go full creator"',
    credits: "1,500 credits/month",
    href: "/signup?plan=studio",
    features: [
      "Unlimited everything",
      "150 voice generations/month",
      "50 final video renders/month",
      "50 lip sync exports/month",
      "Unlimited draft previews",
      "4K exports · No watermark",
      "Priority processing",
      "Dedicated support",
    ],
    cta: "Get Studio",
    highlight: false,
  },
];

const features = [
  { icon: "🎬", title: "Go from idea to video in minutes", desc: "Type a topic. Get a script, voice, avatar, captions, and video — without switching apps." },
  { icon: "🎙️", title: "Sound exactly like you", desc: "Clone your voice in 30 seconds. Every piece of content sounds authentic, even when you're not recording." },
  { icon: "📱", title: "Built for TikTok, Reels, and YouTube", desc: "Platform-optimised scripts, aspect ratios, and captions. Stop reformatting everything manually." },
  { icon: "💸", title: "One subscription. Everything included.", desc: "Cancel ChatGPT, ElevenLabs, HeyGen, and Runway. One login. One bill. One workflow." },
];

const comparison = [
  ["ChatGPT — $20/mo", "Scripts & research — included"],
  ["ElevenLabs — $22/mo", "Voice clone & generation — included"],
  ["HeyGen — $29/mo", "AI avatar videos — included"],
  ["CapCut Pro — $10/mo", "Video editing workflow — included"],
  ["Canva Pro — $20/mo", "Thumbnails & images — included"],
  ["Runway — $15/mo", "Cinematic backgrounds — included"],
];

export default function Home() {
  const router = useRouter();

  return (
    <main style={{ minHeight: "100vh", background: "#06060a", color: "#fff", fontFamily: "sans-serif" }}>
      {/* Nav */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 48px", borderBottom: "0.5px solid #1a1a2e", position: "sticky", top: 0, background: "#06060aee", backdropFilter: "blur(12px)", zIndex: 100 }}>
        <img src="/logo-nav.png" alt="Omnyra AI" style={{ height: 36, width: "auto", objectFit: "contain" }} />
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <button
            onClick={() => router.push("/signin")}
            style={{ padding: "8px 20px", borderRadius: 8, background: "transparent", color: "#aaa", border: "0.5px solid #333", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
            Sign In
          </button>
          <button
            onClick={() => router.push("/signup")}
            style={{ padding: "8px 20px", borderRadius: 8, background: "#7c6fff", color: "#fff", border: "none", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>
            Get Started Free
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ textAlign: "center", padding: "100px 24px 80px", maxWidth: 860, margin: "0 auto" }}>
        <div style={{ display: "inline-block", padding: "6px 16px", borderRadius: 100, background: "#1a1040", border: "0.5px solid #7c6fff44", marginBottom: 28 }}>
          <span style={{ color: "#7c6fff", fontSize: 13, fontWeight: 600 }}>AI-Powered Creative Studio</span>
        </div>
        <h1 style={{ fontSize: "clamp(36px, 6vw, 72px)", fontWeight: 800, lineHeight: 1.1, marginBottom: 24, letterSpacing: "-1px" }}>
          Stop paying for<br />
          <span style={{ color: "#7c6fff" }}>7 AI tools.</span>
        </h1>
        <p style={{ fontSize: 18, color: "#888", maxWidth: 560, margin: "0 auto 40px", lineHeight: 1.6 }}>
          Scripts. Voice. Avatars. Videos. Captions. All in one workspace.<br />
          Start free — no credit card.
        </p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <button
            onClick={() => router.push("/signup")}
            style={{ padding: "16px 36px", borderRadius: 12, background: "#7c6fff", color: "#fff", border: "none", cursor: "pointer", fontSize: 16, fontWeight: 700, boxShadow: "0 0 32px #7c6fff44" }}>
            Create my first video free →
          </button>
          <button
            onClick={() => { const el = document.getElementById("how-it-works"); if (el) el.scrollIntoView({ behavior: "smooth" }); }}
            style={{ padding: "16px 36px", borderRadius: 12, background: "transparent", color: "#aaa", border: "0.5px solid #333", cursor: "pointer", fontSize: 16, fontWeight: 600 }}>
            See how it works
          </button>
        </div>
        <p style={{ marginTop: 20, color: "#444", fontSize: 13 }}>No credit card required · 50 free credits</p>
      </section>

      {/* Why Switch comparison table */}
      <section style={{ padding: "80px 24px", maxWidth: 900, margin: "0 auto" }}>
        <h2 style={{ textAlign: "center", fontSize: 36, fontWeight: 800, marginBottom: 16 }}>
          Replace 6 subscriptions with one.
        </h2>
        <p style={{ textAlign: "center", color: "#666", marginBottom: 48, fontSize: 16 }}>
          The average creator spends $180/month across separate tools. Omnyra replaces all of them.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, borderRadius: 16, overflow: "hidden", border: "0.5px solid #1e1e2e" }}>
          <div style={{ background: "#0d0d14", padding: "20px 28px", borderBottom: "0.5px solid #1e1e2e", color: "#666", fontSize: 14, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>
            Without Omnyra
          </div>
          <div style={{ background: "#0f0b2a", padding: "20px 28px", borderBottom: "0.5px solid #1e1e2e", color: "#7c6fff", fontSize: 14, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1 }}>
            With Omnyra
          </div>
          {comparison.map(([without, withOmnyra], i) => (
            <>
              <div key={`without-${i}`} style={{ background: "#0d0d14", padding: "16px 28px", borderBottom: "0.5px solid #111", color: "#555", fontSize: 14, textDecoration: "line-through" }}>
                ❌ {without}
              </div>
              <div key={`with-${i}`} style={{ background: "#0f0b2a", padding: "16px 28px", borderBottom: "0.5px solid #111", color: "#bbb", fontSize: 14 }}>
                ✅ {withOmnyra}
              </div>
            </>
          ))}
          <div style={{ background: "#0d0d14", padding: "20px 28px", color: "#f87171", fontSize: 16, fontWeight: 700 }}>
            Total: ~$116/month
          </div>
          <div style={{ background: "#0f0b2a", padding: "20px 28px", color: "#7c6fff", fontSize: 16, fontWeight: 700 }}>
            Omnyra Pro: $69/month AUD
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="how-it-works" style={{ padding: "80px 24px", maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 24 }}>
          {features.map((f) => (
            <div key={f.title} style={{ background: "#0d0d14", border: "0.5px solid #1e1e2e", borderRadius: 16, padding: "28px 24px" }}>
              <div style={{ fontSize: 32, marginBottom: 16 }}>{f.icon}</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 10, lineHeight: 1.3 }}>{f.title}</h3>
              <p style={{ color: "#666", fontSize: 14, lineHeight: 1.6 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section style={{ padding: "80px 24px", maxWidth: 1100, margin: "0 auto" }} id="pricing">
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <h2 style={{ fontSize: 40, fontWeight: 800, marginBottom: 12 }}>Start free. Cancel what you don&apos;t need.</h2>
          <p style={{ color: "#666", fontSize: 16 }}>Scripts and research are always free on every plan.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
          {plans.map((plan) => (
            <div key={plan.name} style={{
              background: plan.highlight ? "#0f0b2a" : "#0d0d14",
              border: plan.highlight ? "1.5px solid #7c6fff" : "0.5px solid #1e1e2e",
              borderRadius: 20,
              padding: "32px 28px",
              display: "flex",
              flexDirection: "column",
              position: "relative",
              boxShadow: plan.highlight ? "0 0 40px #7c6fff22" : "none",
            }}>
              {plan.highlight && (
                <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: "#7c6fff", color: "#fff", fontSize: 11, fontWeight: 700, padding: "4px 14px", borderRadius: 100, letterSpacing: 1, textTransform: "uppercase" }}>
                  Most Popular
                </div>
              )}
              <p style={{ color: "#aaa", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 4 }}>{plan.name}</p>
              {plan.tagline && <p style={{ color: "#555", fontSize: 12, marginBottom: 10 }}>{plan.tagline}</p>}
              <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginBottom: 4 }}>
                <span style={{ fontSize: 40, fontWeight: 800, color: "#fff" }}>{plan.price}</span>
                {plan.period && <span style={{ color: "#555", fontSize: 14 }}>{plan.period}</span>}
              </div>
              <p style={{ color: "#7c6fff", fontWeight: 700, fontSize: 15, margin: "8px 0 12px" }}>⚡ {plan.credits}</p>
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px", display: "flex", flexDirection: "column", gap: 10, flexGrow: 1 }}>
                {plan.features.map((feat) => (
                  <li key={feat} style={{ display: "flex", alignItems: "center", gap: 10, color: "#bbb", fontSize: 14 }}>
                    <span style={{ color: "#7c6fff", fontWeight: 700 }}>✓</span> {feat}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => router.push(plan.href)}
                style={{
                  padding: "13px", borderRadius: 10, fontWeight: 700, fontSize: 15, border: "none", cursor: "pointer",
                  background: plan.highlight ? "#7c6fff" : "#1a1a2a",
                  color: plan.highlight ? "#fff" : "#aaa",
                }}>
                {plan.cta}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section style={{ textAlign: "center", padding: "80px 24px 100px" }}>
        <h2 style={{ fontSize: 36, fontWeight: 800, marginBottom: 16 }}>Ready to create?</h2>
        <p style={{ color: "#666", marginBottom: 32, fontSize: 16 }}>Join thousands of creators using Omnyra AI</p>
        <button
          onClick={() => router.push("/signup")}
          style={{ padding: "16px 40px", borderRadius: 12, background: "#7c6fff", color: "#fff", border: "none", cursor: "pointer", fontSize: 16, fontWeight: 700, boxShadow: "0 0 32px #7c6fff44" }}>
          Create my first video free →
        </button>
      </section>

      <footer style={{ borderTop: "0.5px solid #111", padding: "24px 48px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <img src="/logo-nav.png" alt="Omnyra AI" style={{ height: 24, width: "auto", objectFit: "contain" }} />
        <p style={{ color: "#333", fontSize: 12 }}>© 2025 Omnyra AI. All rights reserved.</p>
      </footer>
    </main>
  );
}
