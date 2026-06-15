import Link from "next/link";
import { LegalFooter } from "@/components/legal-footer";

export const metadata = { title: "Pricing — Omnyra" };

const PLANS = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    credits: "30 credits / mo",
    features: [
      "Unlimited scripts & captions",
      "5 images total",
      "1 × 15s video (watermarked)",
    ],
    unavailable: ["Voice generation", "Avatar"],
    cta: "Start Free",
    href: "/signup",
    current: false,
    featured: false,
  },
  {
    name: "Starter",
    price: "$19",
    period: "AUD / mo",
    credits: "100 credits / mo",
    features: [
      "Unlimited scripts & captions",
      "20 images / month",
      "10 voice clips / month",
      "1 × 30s video / month (no watermark)",
    ],
    unavailable: ["Avatar"],
    cta: "Get Started",
    href: "/signup?plan=starter",
    current: false,
    featured: false,
  },
  {
    name: "Creator",
    price: "$49",
    period: "AUD / mo",
    credits: "350 credits / mo",
    features: [
      "Unlimited scripts & captions",
      "100 images / month",
      "40 voice clips / month",
      "5 × Cinematic 30s videos / month (Kling Pro)",
      "2 avatar generations / month",
    ],
    unavailable: [],
    cta: "Start Creating",
    href: "/signup?plan=creator",
    current: true,
    featured: true,
  },
  {
    name: "Studio",
    price: "$99",
    period: "AUD / mo",
    credits: "900 credits / mo",
    features: [
      "Unlimited scripts & captions",
      "300 images / month",
      "120 voice clips / month",
      "20 × Full Sequence 60s videos / month",
      "5 avatar generations / month",
    ],
    unavailable: [],
    cta: "Go Studio",
    href: "/signup?plan=studio",
    current: false,
    featured: false,
  },
];

const CREDIT_ACTIONS = [
  { action: "Script / Caption / Research", tier: "All", credits: "Free" },
  { action: "Image Standard",              tier: "All", credits: "3 cr" },
  { action: "Image HD",                    tier: "All", credits: "6 cr" },
  { action: "Voice 30s",                   tier: "All", credits: "3 cr" },
  { action: "Voice 60s",                   tier: "All", credits: "6 cr" },
  { action: "Quick Preview video (7s)",    tier: "All tiers", credits: "10 cr" },
  { action: "Cinematic video (30s)",       tier: "Creator+", credits: "40 cr" },
  { action: "Full Sequence (60s)",         tier: "Studio only", credits: "40 cr" },
  { action: "Avatar video 30s",            tier: "Creator+", credits: "40 cr" },
  { action: "Avatar video 60s",            tier: "Studio only", credits: "80 cr" },
];

const VIDEO_BY_PLAN = [
  { plan: "Free",    type: "Preview",   length: "15s",  qty: "1 total",  note: "Watermarked" },
  { plan: "Starter", type: "Preview",   length: "30s",  qty: "1/mo",     note: "" },
  { plan: "Creator", type: "Cinematic", length: "30s",  qty: "5/mo",     note: "" },
  { plan: "Studio",  type: "Sequence",  length: "60s",  qty: "20/mo",    note: "" },
];

const TOPUPS = [
  { label: "Small",  credits: "100 credits",  price: "$19 AUD",  badge: "" },
  { label: "Medium", credits: "300 credits",  price: "$49 AUD",  badge: "POPULAR" },
  { label: "Large",  credits: "700 credits",  price: "$99 AUD",  badge: "BEST VALUE" },
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
        <section className="py-20 px-6 text-center max-w-3xl mx-auto">
          <h1 className="font-display text-4xl md:text-5xl font-bold mb-4" style={{ color: "#E8DEFF", lineHeight: 1.2 }}>
            Simple, transparent pricing
          </h1>
          <p className="text-lg" style={{ color: "#BBA8C8", lineHeight: 1.7 }}>
            One credit pool. Pay for what you use. Scripts and captions are always free.
          </p>
        </section>

        {/* Plan cards */}
        <section id="plans" className="px-6 pb-20">
          <div className="max-w-6xl mx-auto">
            <div className="grid md:grid-cols-4 gap-5">
              {PLANS.map(plan => (
                <div
                  key={plan.name}
                  className="rounded-2xl p-6 flex flex-col relative"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: plan.current
                      ? "1px solid #D4A843"
                      : "1px solid rgba(255,255,255,0.1)",
                    boxShadow: plan.current ? "0 0 32px rgba(212,168,67,0.1)" : "none",
                  }}
                >
                  {plan.current && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 text-xs font-bold rounded-full whitespace-nowrap" style={{ background: "#D4A843", color: "#0D0010" }}>
                      Current Plan
                    </div>
                  )}

                  <p className="text-sm font-bold mb-1" style={{ color: plan.current ? "#D4A843" : "#E8DEFF" }}>{plan.name}</p>
                  <p className="font-display text-3xl font-bold mt-1 mb-0.5" style={{ color: "#E8DEFF" }}>{plan.price}</p>
                  <p className="text-xs mb-1" style={{ color: "#8B6FA8" }}>{plan.period}</p>
                  <p className="text-xs font-semibold mb-5" style={{ color: "#D4A843" }}>{plan.credits}</p>

                  <ul className="space-y-2.5 text-sm mb-4 flex-1" style={{ color: "#BBA8C8" }}>
                    {plan.features.map(f => (
                      <li key={f} className="flex items-start gap-2.5">
                        <span style={{ color: "#4ECB8C", flexShrink: 0 }}>✓</span> {f}
                      </li>
                    ))}
                    {plan.unavailable.map(f => (
                      <li key={f} className="flex items-start gap-2.5" style={{ color: "#4A3A60" }}>
                        <span style={{ flexShrink: 0 }}>—</span> {f}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={plan.href}
                    className="block text-center w-full py-3 rounded-full text-sm font-semibold mt-4"
                    style={plan.current
                      ? { background: "#D4A843", color: "#0D0010" }
                      : plan.featured
                        ? { background: "rgba(212,168,67,0.15)", border: "1px solid rgba(212,168,67,0.4)", color: "#D4A843" }
                        : { border: "1px solid rgba(255,255,255,0.2)", color: "#E8DEFF", background: "none" }
                    }
                  >
                    {plan.cta}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Credits per action */}
        <section className="py-16 px-6" style={{ background: "rgba(45,10,62,0.35)", borderTop: "1px solid rgba(212,168,67,0.08)" }}>
          <div className="max-w-3xl mx-auto">
            <h2 className="text-center font-bold mb-10 text-2xl" style={{ color: "#E8DEFF" }}>Credits Per Action</h2>
            <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ background: "rgba(212,168,67,0.08)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    <th className="text-left py-3 px-5 font-semibold" style={{ color: "#D4A843" }}>Action</th>
                    <th className="text-left py-3 px-4 font-semibold" style={{ color: "#D4A843" }}>Tier</th>
                    <th className="text-right py-3 px-5 font-semibold" style={{ color: "#D4A843" }}>Credits</th>
                  </tr>
                </thead>
                <tbody>
                  {CREDIT_ACTIONS.map((row, i) => (
                    <tr
                      key={row.action}
                      style={{
                        background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent",
                        borderBottom: "1px solid rgba(255,255,255,0.05)",
                      }}
                    >
                      <td className="py-3 px-5" style={{ color: "#BBA8C8" }}>{row.action}</td>
                      <td className="py-3 px-4" style={{ color: "#8B6FA8", fontSize: "0.8rem" }}>{row.tier}</td>
                      <td className="py-3 px-5 text-right font-semibold" style={{ color: row.credits === "Free" ? "#4ECB8C" : "#E8DEFF" }}>{row.credits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Video by plan */}
        <section className="py-16 px-6">
          <div className="max-w-3xl mx-auto">
            <h2 className="text-center font-bold mb-10 text-2xl" style={{ color: "#E8DEFF" }}>Video Generation by Plan</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {VIDEO_BY_PLAN.map(v => (
                <div key={v.plan} className="rounded-2xl p-5 text-center" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  <p className="text-xs font-bold mb-3 tracking-widest uppercase" style={{ color: "#D4A843" }}>{v.plan}</p>
                  <p className="text-lg font-bold mb-1" style={{ color: "#E8DEFF" }}>{v.type}</p>
                  <p className="text-sm mb-1" style={{ color: "#BBA8C8" }}>{v.length}</p>
                  <p className="text-sm font-semibold" style={{ color: "#4ECB8C" }}>{v.qty}</p>
                  {v.note && <p className="text-xs mt-2" style={{ color: "#8B6FA8" }}>{v.note}</p>}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Top-Up Packs */}
        <section className="py-16 px-6" style={{ background: "rgba(45,10,62,0.35)", borderTop: "1px solid rgba(212,168,67,0.08)" }}>
          <div className="max-w-3xl mx-auto">
            <h2 className="text-center font-bold mb-3 text-2xl" style={{ color: "#E8DEFF" }}>Top-Up Packs</h2>
            <p className="text-center text-sm mb-10" style={{ color: "#8B6FA8" }}>Need more credits? Buy once, never expires.</p>
            <div className="grid md:grid-cols-3 gap-5">
              {TOPUPS.map(t => (
                <div key={t.label} className="rounded-2xl p-6 text-center relative" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
                  {t.badge && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 text-xs font-bold rounded-full whitespace-nowrap" style={{ background: t.badge === "POPULAR" ? "#C084FC" : "#D4A843", color: "#0D0010" }}>
                      {t.badge}
                    </div>
                  )}
                  <p className="text-sm font-bold mb-2" style={{ color: "#E8DEFF" }}>{t.label}</p>
                  <p className="text-2xl font-bold mb-1" style={{ color: "#D4A843" }}>{t.credits}</p>
                  <p className="text-lg font-semibold mb-5" style={{ color: "#BBA8C8" }}>{t.price}</p>
                  <div className="block w-full py-2.5 rounded-full text-sm font-semibold" style={{ border: "1px solid rgba(255,255,255,0.2)", color: "#8B6FA8" }}>
                    Coming Soon
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Legal footer */}
        <div style={{ borderTop: "1px solid rgba(212,168,67,0.08)", background: "rgba(45,10,62,0.4)" }}>
          <LegalFooter />
        </div>

      </div>
    </main>
  );
}
