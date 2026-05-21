"use client"; // v2
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

export default function Home() {
  const router = useRouter();

  return (
    <main style={{ minHeight: "100vh", background: "#06060a", color: "#fff", fontFamily: "var(--font-geist-sans, sans-serif)" }}>
      {/* Nav */}
      <nav style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 48px", borderBottom: "0.5px solid #1a1a2e", position: "sticky", top: 0, background: "#06060aee", backdropFilter: "blur(12px)", zIndex: 100 }}>
        <img src="/logo-nav.png" alt="Omnyra AI" style={{ height: 36, width: "auto", objectFit: "contain" }} />
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <button onClick={() => router.push("/signin")}
            style={{ padding: "8px 20px", borderRadius: 8, background: "transparent", color: "#aaa", border: "0.5px solid #333", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
            Sign In
          </button>
          <button onClick={() => router.push("/signup")}
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
          Create anything.<br />
          <span style={{ background: "linear-gradient(135deg, #7c6fff, #a78bfa)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            In seconds.
          </span>
        </h1>
        <p style={{ fontSize: 18, color: "#888", maxWidth: 560, margin: "0 auto 40px", lineHeight: 1.6 }}>
          Generate videos, images, voiceovers, and music with the world&apos;s most advanced AI models — all in one place.
        </p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => router.push("/signup")}
            style={{ padding: "16px 36px", borderRadius: 12, background: "#7c6fff", color: "#fff", border: "none", cursor: "pointer", fontSize: 16, fontWeight: 700, boxShadow: "0 0 32px #7c6fff44" }}>
            Start for Free →
          </button>
          <button onClick={() => router.push("/signin")}
            style={{ padding: "16px 36px", borderRadius: 12, background: "transparent", color: "#aaa", border: "0.5px solid #333", cursor: "pointer", fontSize: 16, fontWeight: 600 }}>
            Sign In
          </button>
        </div>
        <p style={{ marginTop: 20, color: "#444", fontSize: 13 }}>No credit card required · 50 free credits</p>
      </section>

      {/* Pricing */}
      <section style={{ padding: "80px 24px", maxWidth: 1100, margin: "0 auto" }} id="pricing">
        <div style={{ textAlign: "center", marginBottom: 56 }}>
          <h2 style={{ fontSize: 40, fontWeight: 800, marginBottom: 12 }}>Simple pricing</h2>
          <p style={{ color: "#666", fontSize: 16 }}>Start free, scale when you&apos;re ready</p>
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
                {plan.features.map((f) => (
                  <li key={f} style={{ display: "flex", alignItems: "center", gap: 10, color: "#bbb", fontSize: 14 }}>
                    <span style={{ color: "#7c6fff", fontWeight: 700 }}>✓</span> {f}
                  </li>
                ))}
              </ul>
              <button onClick={() => router.push(plan.href)}
                style={{
                  padding: "13px", borderRadius: 10, fontWeight: 700, fontSize: 15, border: "none", cursor: "pointer",
                  background: plan.highlight ? "#7c6fff" : "#1a1a2a",
                  color: plan.highlight ? "#fff" : "#aaa",
                  transition: "all 0.2s",
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
        <button onClick={() => router.push("/signup")}
          style={{ padding: "16px 40px", borderRadius: 12, background: "#7c6fff", color: "#fff", border: "none", cursor: "pointer", fontSize: 16, fontWeight: 700, boxShadow: "0 0 32px #7c6fff44" }}>
          Get Started Free →
        </button>
      </section>

      <footer style={{ borderTop: "0.5px solid #111", padding: "24px 48px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <img src="/logo-nav.png" alt="Omnyra AI" style={{ height: 24, width: "auto", objectFit: "contain" }} />
        <p style={{ color: "#333", fontSize: 12 }}>© 2025 Omnyra AI. All rights reserved.</p>
      </footer>
    </main>
  );
}
