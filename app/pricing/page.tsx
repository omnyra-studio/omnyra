import Link from "next/link";
import { LegalFooter } from "@/components/legal-footer";

export const metadata = { title: "Pricing — Omnyra" };

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    description: "Try the system.",
    features: [
      "3 content direction sets / month",
      "20 scripts & captions / month",
      "5 images total",
    ],
    unavailable: ["Voice generation", "Video / avatar"],
    cta: "Start Free",
    href: "/signup",
    featured: false,
  },
  {
    name: "Starter",
    price: "$19",
    period: "AUD / month",
    description: "Regular ideation.",
    features: [
      "30 content direction sets / month",
      "Unlimited scripts & captions",
      "30 images / month",
      "10 voice clips / month",
    ],
    unavailable: ["Video / avatar"],
    cta: "Get Started",
    href: "/signup?plan=starter",
    featured: false,
  },
  {
    name: "Creator",
    price: "$49",
    period: "AUD / month",
    description: "Daily posting use.",
    features: [
      "Unlimited content direction sets",
      "Unlimited scripts & captions",
      "100 images / month",
      "40 voice clips / month",
      "5 videos / month",
      "2 avatar generations / month",
    ],
    unavailable: [],
    cta: "Start Creating",
    href: "/signup?plan=creator",
    featured: true,
  },
  {
    name: "Studio",
    price: "$99",
    period: "AUD / month",
    description: "High-volume & teams.",
    features: [
      "Unlimited content direction sets",
      "Unlimited scripts & captions",
      "300 images / month",
      "80 voice clips / month",
      "20 videos / month",
      "5 avatar generations / month",
    ],
    unavailable: [],
    cta: "Go Studio",
    href: "/signup?plan=studio",
    featured: false,
  },
];

const HOW_IT_WORKS = [
  { step: "1", label: "Enter your idea" },
  { step: "2", label: "Get 6 hook + script variants" },
  { step: "3", label: "Compare scores" },
  { step: "4", label: "Select your direction" },
  { step: "5", label: "Create your content" },
];

const REPLACES = [
  "Prompt guessing",
  "Single-output AI tools",
  "Template-based content systems",
  "Fragmented ideation across multiple tools",
];

export default function PricingPage() {
  return (
    <main className="min-h-screen antialiased overflow-x-hidden" style={{ background: "rgba(13,0,16,1)", color: "#E8DEFF" }}>

      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 backdrop-blur-xl border-b" style={{ background: "rgba(45,10,62,0.75)", borderColor: "rgba(212,168,67,0.12)" }}>
        <div className="max-w-7xl mx-auto flex items-center justify-between" style={{ padding: "8px 24px" }}>
          <Link href="/" className="gold-text font-display text-2xl font-bold tracking-tight">Omnyra</Link>
          <div className="flex items-center gap-4">
            <Link href="/signin" className="text-sm" style={{ color: "#E8DEFF" }}>Sign in</Link>
            <Link href="/signup" className="px-5 py-2.5 text-sm font-semibold rounded-full transition-all" style={{ border: "1px solid rgba(212,168,67,0.3)", color: "#D4A843", background: "rgba(212,168,67,0.08)" }}>
              Start Free
            </Link>
          </div>
        </div>
      </nav>

      <div style={{ paddingTop: 80 }}>

        {/* Hero */}
        <section className="py-24 px-6 text-center max-w-3xl mx-auto">
          <p className="text-xs font-bold tracking-[0.2em] uppercase mb-6" style={{ color: "#E879F9" }}>
            Structured Creative Direction
          </p>
          <h1 className="font-display text-4xl md:text-5xl font-bold mb-6" style={{ color: "#E8DEFF", lineHeight: 1.2 }}>
            Stop guessing what to post.<br />
            Start choosing from 6 structured content directions.
          </h1>
          <p className="text-lg mb-10" style={{ color: "#C0A4C8", lineHeight: 1.7 }}>
            Omnyra generates 6 ranked hook + script options per idea, scores them,
            and recommends the strongest direction before content creation.
          </p>
          <Link
            href="/signup"
            className="inline-block px-10 py-4 rounded-full font-bold text-base"
            style={{ background: "#C084FC", color: "#0D0010" }}
          >
            Start Free — No Card Required
          </Link>
          <p className="mt-3 text-sm" style={{ color: "#8B7A8E" }}>50 credits included on signup</p>
        </section>

        {/* How it works */}
        <section className="py-16 px-6" style={{ borderTop: "1px solid rgba(212,168,67,0.1)", borderBottom: "1px solid rgba(212,168,67,0.1)", background: "rgba(45,10,62,0.3)" }}>
          <div className="max-w-3xl mx-auto">
            <h2 className="text-center font-bold text-lg mb-10" style={{ color: "#D4A843", letterSpacing: "0.05em", textTransform: "uppercase", fontSize: 12 }}>
              How It Works
            </h2>
            <div className="flex flex-col md:flex-row items-start md:items-center justify-center gap-0 md:gap-0">
              {HOW_IT_WORKS.map((item, i) => (
                <div key={item.step} className="flex md:flex-col items-center gap-4 md:gap-3 flex-1">
                  <div className="flex items-center gap-4 md:flex-col md:gap-3 w-full md:w-auto justify-center">
                    <div className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: "rgba(192,132,252,0.15)", border: "1px solid rgba(192,132,252,0.3)", color: "#C084FC" }}>
                      {item.step}
                    </div>
                    <p className="text-sm md:text-center" style={{ color: "#E8DEFF" }}>{item.label}</p>
                  </div>
                  {i < HOW_IT_WORKS.length - 1 && (
                    <div className="hidden md:block h-px flex-1 mx-2" style={{ background: "rgba(192,132,252,0.2)" }} />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* What it replaces */}
        <section className="py-16 px-6">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="font-bold mb-8 text-sm tracking-widest uppercase" style={{ color: "#E879F9" }}>
              What Omnyra Replaces
            </h2>
            <div className="grid grid-cols-2 gap-4 mb-6">
              {REPLACES.map(r => (
                <div key={r} className="rounded-xl p-4 text-sm text-left" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(204,171,175,0.1)", color: "#8B7A8E" }}>
                  <span className="line-through">{r}</span>
                </div>
              ))}
            </div>
            <p className="text-sm" style={{ color: "#C0A4C8" }}>
              Replaced by: <span style={{ color: "#E8DEFF", fontWeight: 600 }}>structured decision making before content creation.</span>
            </p>
          </div>
        </section>

        {/* Pricing grid */}
        <section id="plans" className="py-20 px-6" style={{ background: "rgba(45,10,62,0.4)" }}>
          <div className="max-w-6xl mx-auto">
            <h2 className="font-display text-3xl font-bold text-center mb-4" style={{ color: "#E8DEFF" }}>
              Plans
            </h2>
            <p className="text-center mb-14 text-sm" style={{ color: "#8B7A8E" }}>
              1 content direction set = 6 variants + scoring + ranking. Full decision cycle included.
            </p>

            <div className="grid md:grid-cols-4 gap-5">
              {PLANS.map(plan => (
                <div
                  key={plan.name}
                  className="rounded-3xl p-7 flex flex-col relative"
                  style={{
                    background: plan.featured ? "rgba(75,30,130,0.65)" : "rgba(255,255,255,0.03)",
                    border: plan.featured ? "1px solid rgba(212,168,67,0.5)" : "1px solid rgba(204,171,175,0.12)",
                    boxShadow: plan.featured ? "0 0 40px rgba(212,168,67,0.08)" : "none",
                  }}
                >
                  {plan.featured && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-5 py-1.5 text-xs font-bold rounded-full whitespace-nowrap" style={{ background: "linear-gradient(90deg, #D4A843, #C084FC)", color: "#0D0010" }}>
                      Most Popular
                    </div>
                  )}

                  <p className="text-sm font-bold mb-1" style={{ color: plan.featured ? "#D4A843" : "#E8DEFF" }}>{plan.name}</p>
                  <p className="text-xs mb-4" style={{ color: "#8B7A8E" }}>{plan.description}</p>
                  <p className="font-display text-4xl font-bold mb-1" style={{ color: "#E8DEFF" }}>{plan.price}</p>
                  <p className="text-xs mb-7" style={{ color: "#8B7A8E" }}>{plan.period}</p>

                  <ul className="space-y-3 text-sm mb-4 flex-1" style={{ color: "#C0A4C8" }}>
                    {plan.features.map(f => (
                      <li key={f} className="flex items-start gap-3">
                        <span style={{ color: "#50B388", flexShrink: 0 }}>✓</span> {f}
                      </li>
                    ))}
                    {plan.unavailable.map(f => (
                      <li key={f} className="flex items-start gap-3" style={{ color: "#4A3A50" }}>
                        <span style={{ flexShrink: 0 }}>—</span> {f}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={plan.href}
                    className="block text-center w-full py-3.5 rounded-full text-sm font-semibold mt-6"
                    style={plan.featured
                      ? { background: "#D4A843", color: "#0D0010" }
                      : { border: "1px solid rgba(192,132,252,0.3)", color: "#C084FC", background: "none" }
                    }
                  >
                    {plan.cta}
                  </Link>
                </div>
              ))}
            </div>

            {/* Trust block */}
            <div className="mt-12 max-w-2xl mx-auto text-center rounded-2xl px-6 py-5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(212,168,67,0.15)" }}>
              <p className="text-sm" style={{ color: "#D4A843", lineHeight: 1.7 }}>
                Virality is not guaranteed — outputs only increase the likelihood of performance based on predictive modeling.
              </p>
              <p className="text-xs mt-2" style={{ color: "#5A4A5E" }}>
                Scores are heuristic estimates. Actual performance depends on platform algorithms, audience behavior, and execution.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 px-6 text-center">
          <h2 className="font-display text-3xl font-bold mb-4" style={{ color: "#E8DEFF" }}>
            Start with structure.
          </h2>
          <p className="mb-8 text-sm" style={{ color: "#8B7A8E" }}>
            No card required. 50 credits on signup. Cancel anytime.
          </p>
          <Link
            href="/signup"
            className="inline-block px-10 py-4 rounded-full font-bold text-base"
            style={{ background: "#C084FC", color: "#0D0010" }}
          >
            Start Free
          </Link>
        </section>

        {/* Legal footer */}
        <div style={{ borderTop: "1px solid rgba(212,168,67,0.08)", background: "rgba(45,10,62,0.4)" }}>
          <LegalFooter />
        </div>

      </div>
    </main>
  );
}
