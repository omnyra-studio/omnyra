"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AnimatedBackground from "@/components/AnimatedBackground";
import { supabase } from "@/lib/supabase";
import { usePostHog } from "posthog-js/react";

const C = {
  card:   "rgba(75,30,130,0.65)",
  border: "rgba(207,164,47,0.25)",
  text:   "#E8DEFF",
  sub:    "#D4CCDF",
};
const CARD = {
  background:    C.card,
  backdropFilter: "blur(16px)",
  border:        `1px solid ${C.border}`,
  borderRadius:  16,
};

const PLANS = [
  {
    id:      "free",
    name:    "Free",
    price:   "$0",
    period:  "forever",
    credits: 30,
    features: [
      "Unlimited scripts & captions",
      "5 images total",
      "1 × 15s video (watermarked)",
      "No voice generation",
      "No avatar",
    ],
  },
  {
    id:      "starter",
    name:    "Starter",
    price:   "$19",
    period:  "/mo AUD",
    credits: 100,
    features: [
      "Unlimited scripts & captions",
      "20 images / month",
      "10 voice clips / month",
      "1 × 30s video / month (no watermark)",
      "No avatar",
    ],
  },
  {
    id:      "creator",
    name:    "Creator",
    price:   "$49",
    period:  "/mo AUD",
    credits: 350,
    popular: true,
    features: [
      "Unlimited scripts & captions",
      "100 images / month",
      "40 voice clips / month",
      "5 × Cinematic 15s videos / month (Kling Pro)",
      "2 avatar generations / month",
    ],
  },
  {
    id:      "studio",
    name:    "Studio",
    price:   "$99",
    period:  "/mo AUD",
    credits: 900,
    features: [
      "Unlimited scripts & captions",
      "300 images / month",
      "120 voice clips / month",
      "20 × Full Sequence 60s videos / month",
      "5 avatar generations / month",
    ],
  },
];

const PACKS = [
  {
    id:   "small",
    name: "Small",
    amount: 100,
    price:  "$19",
    desc:   "A quick burst of extra credits",
  },
  {
    id:    "medium",
    name:  "Medium",
    amount: 300,
    price:  "$49",
    badge:  "Popular",
    desc:   "Solid top-up for active creators",
  },
  {
    id:    "large",
    name:  "Large",
    amount: 700,
    price:  "$99",
    badge:  "Best Value",
    desc:   "Maximum output for high-volume work",
  },
];

const COSTS = [
  { action: "Script / Caption / Research",  credits: "Free", note: ""              },
  { action: "Image Standard",               credits: "3",    note: ""              },
  { action: "Image HD",                     credits: "6",    note: ""              },
  { action: "Voice 30s",                    credits: "3",    note: ""              },
  { action: "Voice 60s",                    credits: "6",    note: ""              },
  { action: "Quick Preview video (7s)",     credits: "10",   note: "All tiers"     },
  { action: "Cinematic video (15s)",        credits: "20",   note: "Creator+"      },
  { action: "Full Sequence (60s)",          credits: "40",   note: "Studio only"   },
  { action: "Avatar video 30s",             credits: "40",   note: "Creator+"      },
  { action: "Avatar video 60s",             credits: "80",   note: "Studio only"   },
];

export default function CreditsPage() {
  const router = useRouter();
  const posthog = usePostHog();
  const [currentPlan, setCurrentPlan] = useState(null);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!session?.user) return;
        return supabase
          .from("profiles")
          .select("plan")
          .eq("id", session.user.id)
          .single()
          .then(({ data }) => setCurrentPlan((data?.plan || "free").toLowerCase()));
      })
      .catch(err => {
        console.error('[credits] Failed to load plan:', err.message);
        // Leave currentPlan as null — do not claim 'free' on error.
        // A paid user with a failed query must not see 'Current Plan' on Free
        // or 'Upgrade' on a plan they already own.
      });
  }, []);

  const planRank = { free: 0, starter: 1, creator: 2, studio: 3 };
  // Use -1 when plan is unknown so no card is falsely highlighted as current.
  const userRank = currentPlan !== null ? (planRank[currentPlan] ?? 0) : -1;

  return (
    <div style={{ minHeight: "100vh", background: "transparent", position: "relative", color: C.text }}>
      <AnimatedBackground />
      <div style={{ position: "relative", zIndex: 1 }}>

        <div style={{ maxWidth: 800, margin: "0 auto", padding: "2rem 1.5rem 6rem" }}>

          {/* Page title */}
          <div className="page-title" style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", background: "linear-gradient(105deg,#CFA42F,#F7D96B)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", marginBottom: "1.5rem" }}>
            Plans &amp; Credits
          </div>

          {/* ── SUBSCRIPTION PLANS ────────────────────────────────────────── */}
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#E879F9", marginBottom: 16 }}>
            Subscription Plans
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 36 }}>
            {PLANS.map(plan => {
              const isCurrent = currentPlan === plan.id;
              const isDowngrade = planRank[plan.id] < userRank;
              const isUpgrade = planRank[plan.id] > userRank;

              return (
                <div
                  key={plan.id}
                  style={{
                    ...CARD,
                    padding: "1.25rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    position: "relative",
                    border: isCurrent
                      ? "1px solid rgba(207,164,47,0.6)"
                      : plan.popular
                        ? "1px solid rgba(232,121,249,0.35)"
                        : `1px solid ${C.border}`,
                    boxShadow: isCurrent ? "0 0 24px rgba(207,164,47,0.12)" : undefined,
                  }}
                >
                  {plan.popular && !isCurrent && (
                    <div style={{
                      position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
                      background: "rgba(232,121,249,0.12)", border: "1px solid rgba(232,121,249,0.35)",
                      color: "#E879F9", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
                      padding: "3px 10px", borderRadius: 100, whiteSpace: "nowrap",
                    }}>
                      MOST POPULAR
                    </div>
                  )}
                  {isCurrent && (
                    <div style={{
                      position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
                      background: "rgba(207,164,47,0.15)", border: "1px solid rgba(207,164,47,0.45)",
                      color: "#F0C040", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
                      padding: "3px 10px", borderRadius: 100, whiteSpace: "nowrap",
                    }}>
                      CURRENT PLAN
                    </div>
                  )}

                  {/* Name */}
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#FFFFFF", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    {plan.name}
                  </div>

                  {/* Price */}
                  <div>
                    <span style={{
                      fontSize: 28, fontWeight: 800, letterSpacing: "-0.03em",
                      background: "linear-gradient(105deg, #CFA42F, #F7D96B)",
                      WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                    }}>
                      {plan.price}
                    </span>
                    <span style={{ fontSize: 11, color: "#D4CCDF", marginLeft: 4 }}>{plan.period}</span>
                  </div>

                  {/* Credits */}
                  <div>
                    <span style={{ fontSize: 22, fontWeight: 700, color: "#C084FC" }}>{plan.credits}</span>
                    <span style={{ fontSize: 11, color: "#D4CCDF", marginLeft: 4 }}>credits/mo</span>
                  </div>

                  {/* Features */}
                  <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
                    {plan.features.map((f, i) => (
                      <li key={i} style={{ fontSize: 11, color: "#D4CCDF", display: "flex", gap: 5, alignItems: "flex-start", lineHeight: 1.4 }}>
                        <span style={{ color: "#4ECB8C", flexShrink: 0 }}>✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>

                  {/* CTA */}
                  <div style={{ marginTop: "auto" }}>
                    {isCurrent ? (
                      <div style={{
                        width: "100%", padding: "10px", borderRadius: 10,
                        background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                        color: "#8A7D92", fontSize: 12, fontWeight: 600, textAlign: "center",
                        cursor: "default",
                      }}>
                        Current Plan
                      </div>
                    ) : isUpgrade ? (
                      <button
                        onClick={() => { posthog?.capture('upgrade_cta_clicked', { target_plan: plan.id, current_plan: currentPlan }); setShowUpgradeModal(true); }}
                        style={{
                          width: "100%", padding: "10px", borderRadius: 10,
                          background: "linear-gradient(105deg, #5A3400, #9A7010, #CFA42F, #E8C84A, #CFA42F, #9A7010, #5A3400)",
                          backgroundSize: "200% auto",
                          animation: "metalShimmer 3s linear infinite",
                          color: "#0D0010", fontSize: 12, fontWeight: 700, textAlign: "center",
                          border: "none", cursor: "pointer", fontFamily: "inherit",
                        }}
                      >
                        Upgrade →
                      </button>
                    ) : (
                      <div style={{
                        width: "100%", padding: "10px", borderRadius: 10,
                        background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.07)",
                        color: "#6A6078", fontSize: 12, fontWeight: 500, textAlign: "center",
                        cursor: "default",
                      }}>
                        Downgrade
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* ── CREDITS PER ACTION ─────────────────────────────────────────── */}
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#FFFFFF", marginBottom: 16 }}>
            Credits Per Action
          </div>

          <div style={{ ...CARD, padding: "20px 24px", marginBottom: 36 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {COSTS.map((row, i) => (
                  <tr key={row.action} style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                    <td style={{ padding: "10px 0", fontSize: 13, color: "rgba(255,255,255,0.9)" }}>{row.action}</td>
                    {row.note && (
                      <td style={{ padding: "10px 8px", fontSize: 11, color: "rgba(255,255,255,0.4)", whiteSpace: "nowrap" }}>
                        {row.note}
                      </td>
                    )}
                    {!row.note && <td />}
                    <td style={{
                      padding: "10px 0", fontSize: 13, fontWeight: 700, textAlign: "right",
                      color: row.credits === "Free" ? "#4ECB8C" : "#F0C040",
                    }}>
                      {row.credits === "Free" ? "Free" : `${row.credits} cr`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── VIDEO COMPARISON ──────────────────────────────────────────── */}
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#E879F9", marginBottom: 16 }}>
            Video Generation by Plan
          </div>

          <div style={{ marginBottom: 36 }}>
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(4, 1fr)",
              gap: 1, background: "rgba(255,255,255,0.1)",
              borderRadius: 12, overflow: "hidden",
            }}>
              {[
                { tier: "Free",    video: "1× Preview",   length: "15s", clips: "1 total", watermark: true  },
                { tier: "Starter", video: "1× Preview",   length: "30s", clips: "1/mo",   watermark: false },
                { tier: "Creator", video: "5× Cinematic", length: "15s", clips: "5/mo",   watermark: false },
                { tier: "Studio",  video: "20× Sequence", length: "60s", clips: "20/mo",  watermark: false },
              ].map(t => (
                <div key={t.tier} style={{
                  background: "rgba(45,10,62,0.8)", padding: "20px 16px", textAlign: "center",
                }}>
                  <p style={{ color: "#C9A84C", fontWeight: 700, marginBottom: 12, fontSize: 13 }}>{t.tier}</p>
                  <p style={{ color: "white", fontWeight: 600, marginBottom: 4, fontSize: 13 }}>{t.video}</p>
                  <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.8rem", marginBottom: 4 }}>{t.length}</p>
                  <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "0.8rem", marginBottom: 4 }}>{t.clips}</p>
                  {t.watermark && (
                    <p style={{ color: "#f97316", fontSize: "0.7rem", margin: 0 }}>watermarked</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ── TOP-UP PACKS ───────────────────────────────────────────────── */}
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#E879F9", marginBottom: 16 }}>
            Top-Up Packs
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 32 }}>
            {PACKS.map(pack => (
              <div key={pack.id} style={{
                ...CARD,
                padding: "1.25rem",
                display: "flex",
                flexDirection: "column",
                gap: 10,
                position: "relative",
                opacity: 0.75,
              }}>
                {pack.badge && (
                  <div style={{
                    position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
                    background: pack.badge === "Best Value"
                      ? "rgba(207,164,47,0.2)"
                      : "rgba(232,121,249,0.1)",
                    border: "1px solid rgba(207,164,47,0.3)",
                    color: "#F0C040",
                    fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
                    padding: "3px 10px", borderRadius: 100, whiteSpace: "nowrap",
                  }}>
                    {pack.badge.toUpperCase()}
                  </div>
                )}

                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#FFFFFF" }}>{pack.name}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", marginTop: 3 }}>{pack.desc}</div>
                </div>

                <div>
                  <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em", color: "#C084FC" }}>{pack.amount.toLocaleString()}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.9)", textTransform: "uppercase", letterSpacing: "0.1em" }}>credits</div>
                </div>

                <div style={{ marginTop: "auto" }}>
                  <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, color: "#FFFFFF" }}>
                    {pack.price} <span style={{ fontSize: 11, color: "rgba(255,255,255,0.85)", fontWeight: 400 }}>AUD</span>
                  </div>
                  <div style={{
                    width: "100%", padding: "10px", borderRadius: 10,
                    background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)",
                    color: "rgba(255,255,255,0.9)", fontSize: 12, fontWeight: 600, textAlign: "center",
                    cursor: "not-allowed",
                  }}>
                    Coming Soon
                  </div>
                </div>
              </div>
            ))}
          </div>

          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.85)", textAlign: "center" }}>
            Available at launch —{" "}
            <a href="/dashboard/settings" style={{ color: "#F0C040", textDecoration: "underline" }}>
              upgrade your plan
            </a>{" "}
            to get more credits today.
          </p>

          <p style={{ fontSize: 12, textAlign: "center", marginTop: 8 }}>
            <a
              href="/dashboard/settings#usage"
              style={{ color: "#F0C040", textDecoration: "underline", fontWeight: 600 }}
            >
              View your usage history →
            </a>
          </p>
        </div>
      </div>

      <style>{`@keyframes metalShimmer { 0% { background-position: 200% center } 100% { background-position: -200% center } }`}</style>

      {showUpgradeModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" }}>
          <div style={{ background: "rgba(45,10,62,0.95)", backdropFilter: "blur(12px)", border: "1px solid rgba(201,168,76,0.3)", borderRadius: 16, padding: 40, maxWidth: 440, width: "100%", textAlign: "center" }}>
            <h2 style={{ color: "#fff", marginBottom: 12, fontSize: 20, fontWeight: 700 }}>Payments launching soon ✦</h2>
            <p style={{ color: "rgba(255,255,255,0.8)", marginBottom: 24, lineHeight: 1.6, fontSize: 14 }}>
              To upgrade your plan during beta, email us directly and we&apos;ll sort it within 24 hours.
            </p>
            <a href="mailto:info@omnyra.studio" style={{ display: "block", background: "linear-gradient(105deg, #5A3400, #9A7010, #CFA42F, #E8C84A, #CFA42F, #9A7010, #5A3400)", backgroundSize: "200% auto", animation: "metalShimmer 3s linear infinite", color: "#0D0010", padding: "12px 24px", borderRadius: 10, fontWeight: 700, textDecoration: "none", marginBottom: 12, fontSize: 14 }}>
              Email info@omnyra.studio
            </a>
            <button onClick={() => setShowUpgradeModal(false)} style={{ color: "rgba(255,255,255,0.6)", background: "none", border: "none", cursor: "pointer", fontSize: 14 }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
