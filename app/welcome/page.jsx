"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase as supabaseClient } from "@/lib/supabase";
import AnimatedBackground from "@/components/AnimatedBackground";
import { ArrowRight, Check } from "lucide-react";
import { usePostHog } from "posthog-js/react";

const USE_CASES = [
  "UGC Ads",
  "Brand Content",
  "Personal Brand",
  "Client Work",
  "Just exploring",
];

function Toast({ kind, message, onClose }) {
  if (!message) return null;
  const styles = {
    success: "bg-emerald-500/15 border-emerald-500/40 text-emerald-300",
    error: "bg-rose-500/15 border-rose-500/40 text-rose-300",
  };
  return (
    <div
      className={`fixed top-6 left-1/2 -translate-x-1/2 z-50 rounded-full px-5 py-2.5 text-sm border backdrop-blur-md ${styles[kind] ?? styles.success}`}
      role="status"
    >
      <button onClick={onClose} className="opacity-80 hover:opacity-100">
        {message}
      </button>
    </div>
  );
}

function Card({ children }) {
  return (
    <div style={{
      width: "100%",
      maxWidth: 560,
      borderRadius: 24,
      background: "rgba(45,10,62,0.75)",
      backdropFilter: "blur(12px)",
      border: "1px solid rgba(207,164,47,0.2)",
      padding: "clamp(2rem, 5vw, 2.5rem)",
      boxShadow: "0 30px 80px -30px rgba(0,0,0,0.6)",
    }}>
      {children}
    </div>
  );
}

export default function WelcomePage() {
  const router = useRouter();
  const posthog = usePostHog();
  const supabase = supabaseClient;

  const [loading, setLoading]     = useState(true);
  const [userId, setUserId]       = useState(null);
  const [step, setStep]           = useState(1);
  const [firstName, setFirstName] = useState("");
  const [selected, setSelected]   = useState([]);
  const [promoCode, setPromoCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [toast, setToast]         = useState({ kind: "success", message: "" });
  const [submitting, setSubmitting] = useState(false);

  function toggleOption(value) {
    setSelected(prev =>
      prev.includes(value) ? prev.filter(v => v !== value) : [...prev, value]
    );
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/signin"); return; }

      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, has_completed_onboarding")
        .eq("id", user.id)
        .single();

      if (cancelled) return;
      if (profile?.has_completed_onboarding) { router.replace("/dashboard"); return; }

      setUserId(user.id);
      if (profile?.first_name) setFirstName(profile.first_name);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [router, supabase]);

  function showToast(kind, message, timeout = 3000) {
    setToast({ kind, message });
    setTimeout(() => setToast({ kind, message: "" }), timeout);
  }

  async function saveStep1() {
    if (!firstName.trim() || selected.length === 0 || !userId) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .upsert({ id: userId, first_name: firstName.trim(), content_types: selected });
      if (error) throw error;
      setStep(3);
    } catch (err) {
      console.error("SAVE ERROR:", err.message);
      showToast("error", "Could not save — " + err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function applyPromo() {
    if (!promoCode.trim()) return;
    setRedeeming(true);
    try {
      const res = await fetch("/api/promo/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: promoCode.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showToast("success", `✓ ${promoCode.trim().toUpperCase()} applied — ${data.plan} unlocked`);
        posthog?.capture('promo_code_redeemed', {
          plan_unlocked: data.plan,
        });
        setStep(3);
        return;
      }
      if (res.status === 409) { showToast("error", "This code has already been used."); return; }
      showToast("error", "Code not recognised. Try again.");
    } catch {
      showToast("error", "Couldn't reach the server. Try again.");
    } finally {
      setRedeeming(false);
    }
  }

  async function completeOnboarding() {
    if (!userId) return;
    await supabase.from("profiles").update({ has_completed_onboarding: true }).eq("id", userId);
    posthog?.capture('onboarding_completed', {
      content_types: selected,
      first_name: firstName,
    });
    router.push("/dashboard");
  }

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "transparent", position: "relative" }}>
      <AnimatedBackground />
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", position: "relative", zIndex: 1 }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid rgba(207,164,47,0.2)", borderTopColor: "#CFA42F", animation: "spin 1s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "transparent", position: "relative", color: "#E8DEFF" }}>
      <AnimatedBackground />

      <Toast kind={toast.kind} message={toast.message} onClose={() => setToast({ ...toast, message: "" })} />

      <div style={{ position: "relative", zIndex: 1, minHeight: "100vh", display: "flex", flexDirection: "column" }}>

        {/* Header */}
        <header style={{ padding: "1.25rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(207,164,47,0.1)" }}>
          <Link href="/" style={{ textDecoration: "none" }}>
            <span style={{ fontWeight: 700, fontSize: 22, background: "linear-gradient(90deg,#CFA42F,#E8B84B)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Omnyra
            </span>
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {[1, 2, 3].map(n => (
              <span
                key={n}
                style={{
                  width: 32, height: 6, borderRadius: 9999,
                  background: n <= step ? "rgba(207,164,47,0.8)" : "rgba(255,255,255,0.1)",
                  transition: "background 0.3s",
                }}
              />
            ))}
          </div>
        </header>

        {/* Main */}
        <main style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: "2.5rem 1.5rem" }}>

          {/* STEP 1 */}
          {step === 1 && (
            <Card>
              <h1 style={{ fontSize: "clamp(1.4rem,4vw,1.8rem)", fontWeight: 700, color: "#FFFFFF", marginBottom: 6, lineHeight: 1.25 }}>
                Welcome to Omnyra. Let&apos;s set up your workspace.
              </h1>
              <p style={{ fontSize: 14, color: "#BBA8C8", marginBottom: 32 }}>
                Two quick things, then you&apos;re directing.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                <div>
                  <label style={{ fontSize: 10, color: "#8A7D92", textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 600, display: "block", marginBottom: 8 }}>
                    Your first name
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="e.g. Maya"
                    autoFocus
                    style={{
                      width: "100%", padding: "12px 16px", borderRadius: 12, boxSizing: "border-box",
                      border: "1px solid rgba(204,171,175,0.25)", background: "#0D0010",
                      color: "#C084FC", fontSize: 14, fontFamily: "inherit", outline: "none",
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 10, color: "#8A7D92", textTransform: "uppercase", letterSpacing: "0.14em", fontWeight: 600, display: "block", marginBottom: 8 }}>
                    What will you create with Omnyra?
                  </label>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {USE_CASES.map(uc => {
                      const active = selected.includes(uc);
                      return (
                        <button
                          key={uc}
                          type="button"
                          onClick={() => toggleOption(uc)}
                          style={{
                            padding: "8px 16px", borderRadius: 9999, fontSize: 14,
                            fontWeight: active ? 600 : 400, fontFamily: "inherit", cursor: "pointer",
                            background: active ? "rgba(207,164,47,0.15)" : "rgba(255,255,255,0.05)",
                            border: active ? "1px solid rgba(207,164,47,0.6)" : "1px solid rgba(255,255,255,0.12)",
                            color: active ? "#D4A843" : "rgba(255,255,255,0.65)",
                            transition: "all 0.15s",
                            display: "inline-flex", alignItems: "center", gap: 6,
                          }}
                        >
                          {active && <span style={{ fontSize: 11 }}>✓</span>}
                          {uc}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={saveStep1}
                  disabled={!firstName.trim() || selected.length === 0 || submitting}
                  style={{
                    width: "100%", padding: "14px", borderRadius: 12, fontFamily: "inherit",
                    fontWeight: 700, fontSize: 15, cursor: (!firstName.trim() || selected.length === 0 || submitting) ? "not-allowed" : "pointer",
                    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
                    background: (!firstName.trim() || selected.length === 0 || submitting)
                      ? "rgba(255,255,255,0.06)"
                      : "linear-gradient(105deg, #5A3400, #9A7010, #CFA42F, #E8C84A, #CFA42F, #9A7010, #5A3400)",
                    backgroundSize: "200% auto",
                    animation: (!firstName.trim() || selected.length === 0 || submitting) ? undefined : "metalShimmer 3s linear infinite",
                    color: (!firstName.trim() || selected.length === 0 || submitting) ? "rgba(255,255,255,0.3)" : "#0D0010",
                    border: "none",
                    boxShadow: (!firstName.trim() || selected.length === 0 || submitting) ? undefined : "0 0 20px rgba(207,164,47,0.3)",
                    transition: "opacity 0.2s",
                  }}
                >
                  {submitting ? "Saving…" : "Continue"}
                  {!submitting && <ArrowRight size={16} />}
                </button>
              </div>
            </Card>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <Card>
              <h1 style={{ fontSize: "clamp(1.4rem,4vw,1.8rem)", fontWeight: 700, color: "#FFFFFF", marginBottom: 6, lineHeight: 1.25 }}>
                Have a beta access code?
              </h1>
              <p style={{ fontSize: 14, color: "#BBA8C8", marginBottom: 32 }}>
                Apply it now to unlock your plan.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <input
                  type="text"
                  value={promoCode}
                  onChange={e => setPromoCode(e.target.value)}
                  placeholder="BETA-ACCESS-CODE"
                  style={{
                    width: "100%", padding: "12px 16px", borderRadius: 12, boxSizing: "border-box",
                    border: "1px solid rgba(204,171,175,0.25)", background: "#0D0010",
                    color: "#C084FC", fontSize: 14, fontFamily: "inherit", outline: "none",
                    textTransform: "uppercase", letterSpacing: "0.1em",
                  }}
                />

                <button
                  type="button"
                  onClick={applyPromo}
                  disabled={!promoCode.trim() || redeeming}
                  style={{
                    width: "100%", padding: "14px", borderRadius: 12, fontFamily: "inherit",
                    fontWeight: 700, fontSize: 15, cursor: (!promoCode.trim() || redeeming) ? "not-allowed" : "pointer",
                    background: (!promoCode.trim() || redeeming)
                      ? "rgba(255,255,255,0.06)"
                      : "linear-gradient(105deg, #5A3400, #9A7010, #CFA42F, #E8C84A, #CFA42F, #9A7010, #5A3400)",
                    backgroundSize: "200% auto",
                    animation: (!promoCode.trim() || redeeming) ? undefined : "metalShimmer 3s linear infinite",
                    color: (!promoCode.trim() || redeeming) ? "rgba(255,255,255,0.3)" : "#0D0010",
                    border: "none",
                    boxShadow: (!promoCode.trim() || redeeming) ? undefined : "0 0 20px rgba(207,164,47,0.3)",
                  }}
                >
                  {redeeming ? "Applying…" : "Apply code →"}
                </button>
              </div>
            </Card>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <Card>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 56, marginBottom: 20 }}>✦</div>
                <h1 style={{ fontSize: "clamp(1.4rem,4vw,1.8rem)", fontWeight: 700, color: "#FFFFFF", marginBottom: 12, lineHeight: 1.25 }}>
                  Your AI content studio is ready
                </h1>
                <p style={{ fontSize: 14, color: "#BBA8C8", lineHeight: 1.6, maxWidth: 380, margin: "0 auto 32px" }}>
                  Scripts and captions are free forever. Images, voice and video unlock with your plan.
                </p>

                <button
                  type="button"
                  onClick={completeOnboarding}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 8,
                    padding: "14px 28px", borderRadius: 12, fontFamily: "inherit",
                    fontWeight: 700, fontSize: 15, cursor: "pointer",
                    background: "linear-gradient(105deg, #5A3400, #9A7010, #CFA42F, #E8C84A, #CFA42F, #9A7010, #5A3400)",
                    backgroundSize: "200% auto", animation: "metalShimmer 3s linear infinite",
                    color: "#0D0010", border: "none",
                    boxShadow: "0 0 24px rgba(207,164,47,0.35)",
                  }}
                >
                  Let&apos;s go
                  <ArrowRight size={16} />
                </button>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginTop: 28, textAlign: "left" }}>
                  {["AI scripts & hooks", "Caption generator", "Strategy briefs"].map(feat => (
                    <div key={feat} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#BBA8C8" }}>
                      <Check size={13} color="#4ECB8C" />
                      {feat}
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          )}
        </main>
      </div>

      <style>{`@keyframes metalShimmer { 0% { background-position: 0% 50% } 100% { background-position: 200% 50% } }`}</style>
    </div>
  );
}
