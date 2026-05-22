"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ArrowRight, Sparkles, Check } from "lucide-react";

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
    <div className="w-full max-w-xl rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl p-8 md:p-10 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)]">
      {children}
    </div>
  );
}

export default function WelcomePage() {
  const router = useRouter();
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [step, setStep] = useState(1);

  const [firstName, setFirstName] = useState("");
  const [useCase, setUseCase] = useState(null);

  const [promoCode, setPromoCode] = useState("");
  const [redeeming, setRedeeming] = useState(false);

  const [toast, setToast] = useState({ kind: "success", message: "" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/signin");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("first_name, has_completed_onboarding")
        .eq("id", user.id)
        .single();

      if (cancelled) return;

      if (profile?.has_completed_onboarding) {
        router.replace("/dashboard");
        return;
      }

      setUserId(user.id);
      if (profile?.first_name) setFirstName(profile.first_name);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  function showToast(kind, message, timeout = 3000) {
    setToast({ kind, message });
    setTimeout(() => setToast({ kind, message: "" }), timeout);
  }

  async function saveStep1() {
    if (!firstName.trim() || !useCase || !userId) return;
    setSubmitting(true);
    const { error } = await supabase
      .from("profiles")
      .update({ first_name: firstName.trim(), use_case: useCase })
      .eq("id", userId);
    setSubmitting(false);
    if (error) {
      showToast("error", "Couldn't save. Try again.");
      return;
    }
    setStep(2);
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
        showToast(
          "success",
          `✓ ${promoCode.trim().toUpperCase()} applied — ${data.plan} unlocked`,
        );
        setStep(3);
        return;
      }
      if (res.status === 409) {
        showToast("error", "This code has already been used.");
        return;
      }
      showToast("error", "Code not recognised. Try again.");
    } catch {
      showToast("error", "Couldn't reach the server. Try again.");
    } finally {
      setRedeeming(false);
    }
  }

  async function completeOnboarding() {
    if (!userId) return;
    await supabase
      .from("profiles")
      .update({ has_completed_onboarding: true })
      .eq("id", userId);
    router.push("/create?template=ugc-ad&onboarding=true");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070710] text-white/40 flex items-center justify-center text-sm">
        Loading…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#070710] text-white relative flex flex-col">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-violet-600/15 blur-[120px]" />
        <div className="absolute top-1/3 -right-40 w-[500px] h-[500px] rounded-full bg-cyan-500/10 blur-[120px]" />
      </div>

      <Toast
        kind={toast.kind}
        message={toast.message}
        onClose={() => setToast({ ...toast, message: "" })}
      />

      <header className="px-6 py-5 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 lg:gap-4">
          <div className="w-12 h-12 lg:w-20 lg:h-20 rounded-xl lg:rounded-2xl bg-gradient-to-br from-violet-500 to-cyan-400 flex items-center justify-center">
            <Sparkles className="w-6 h-6 lg:w-10 lg:h-10 text-white" />
          </div>
          <span className="text-lg lg:text-3xl font-semibold tracking-tight">Omnyra</span>
        </Link>
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((n) => (
            <span
              key={n}
              className={[
                "w-8 h-1.5 rounded-full transition-colors",
                n <= step ? "bg-violet-500" : "bg-white/10",
              ].join(" ")}
            />
          ))}
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-10">
        {step === 1 && (
          <Card>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
              Welcome to Omnyra. Let&apos;s set up your workspace.
            </h1>
            <p className="text-sm text-white/50 mt-2">
              Two quick things, then you&apos;re directing.
            </p>

            <div className="mt-8 space-y-6">
              <div>
                <label className="text-xs uppercase tracking-widest text-white/40 mb-2 block">
                  Your first name
                </label>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="e.g. Maya"
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm focus:outline-none focus:border-violet-500/50 transition-colors"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-xs uppercase tracking-widest text-white/40 mb-2 block">
                  What will you create with Omnyra?
                </label>
                <div className="flex flex-wrap gap-2">
                  {USE_CASES.map((uc) => (
                    <button
                      key={uc}
                      onClick={() => setUseCase(uc)}
                      className={[
                        "px-4 py-2 rounded-full text-sm font-medium transition-all",
                        useCase === uc
                          ? "bg-violet-600 text-white shadow-[0_0_20px_rgba(139,92,246,0.4)]"
                          : "border border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:bg-white/10 hover:text-white/80",
                      ].join(" ")}
                    >
                      {uc}
                    </button>
                  ))}
                </div>
              </div>

              <button
                onClick={saveStep1}
                disabled={!firstName.trim() || !useCase || submitting}
                className="w-full py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(139,92,246,0.35)] transition-all"
              >
                Continue
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
              Have a beta access code?
            </h1>
            <p className="text-sm text-white/50 mt-2">
              Apply it now to unlock your plan and bonus credits.
            </p>

            <div className="mt-8 space-y-5">
              <input
                type="text"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                placeholder="BETA-ACCESS-CODE"
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 text-sm font-mono tracking-widest focus:outline-none focus:border-violet-500/50 transition-colors uppercase"
              />

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(3)}
                  className="flex-1 py-3.5 rounded-xl border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white text-sm font-medium transition-all"
                >
                  Skip for now
                </button>
                <button
                  onClick={applyPromo}
                  disabled={!promoCode.trim() || redeeming}
                  className="flex-[2] py-3.5 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-[0_0_30px_rgba(139,92,246,0.35)] transition-all"
                >
                  {redeeming ? "Applying…" : "Apply code"}
                </button>
              </div>
            </div>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <div className="text-center">
              <div className="text-6xl mb-5">🎬</div>
              <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
                Create your first AI video free
              </h1>
              <p className="text-sm md:text-base text-white/55 mt-3 max-w-sm mx-auto leading-relaxed">
                50 credits included. No credit card needed. See what Omnyra can
                do in 60 seconds.
              </p>

              <button
                onClick={completeOnboarding}
                className="mt-8 inline-flex items-center gap-2 px-7 py-4 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold shadow-[0_0_30px_rgba(139,92,246,0.4)] transition-all"
              >
                Create my first video
                <ArrowRight className="w-4 h-4" />
              </button>

              <p className="text-xs text-white/35 mt-4">Takes about 3 minutes</p>

              <div className="mt-8 grid grid-cols-3 gap-3 text-left">
                {[
                  "Cinematic motion",
                  "Realistic voice",
                  "Auto lip-sync",
                ].map((feat) => (
                  <div
                    key={feat}
                    className="flex items-center gap-2 text-xs text-white/55"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    {feat}
                  </div>
                ))}
              </div>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
