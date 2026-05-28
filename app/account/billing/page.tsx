"use client";

import { useEffect, useState, Suspense, type CSSProperties } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import AnimatedBackground from "@/components/AnimatedBackground";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UsageItem {
  used: number;
  limit: number | "unlimited";
}

interface BillingData {
  tier: string;
  tier_price: string;
  credits_balance: number;
  credits_reset_date: string;
  has_stripe_customer: boolean;
  monthly_usage: Record<string, UsageItem>;
  credit_cost_examples: Record<string, string>;
  available_packs: Array<{ id: string; name: string; credits: number; price_aud: number }>;
  recent_transactions: Array<{
    amount: number;
    type: string;
    description: string;
    created_at: string;
  }>;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const C = {
  text:   "#E8DEFF",
  sub:    "#BBA8C8",
  gold:   "#D4A843",
  purple: "#C084FC",
  pink:   "#E879F9",
  green:  "#4ECB8C",
  rose:   "#F87171",
};

const CARD: CSSProperties = {
  background: "rgba(75,30,130,0.65)",
  backdropFilter: "blur(16px)",
  border: "1px solid rgba(207,164,47,0.25)",
  borderRadius: 20,
};

const GOLD_CARD: CSSProperties = {
  ...CARD,
  border: "1px solid rgba(207,164,47,0.5)",
  boxShadow: "0 0 40px -12px rgba(207,164,47,0.2)",
};

const TIER_DISPLAY: Record<string, { label: string; next?: string; nextLabel?: string }> = {
  free:    { label: "Free",    next: "creator", nextLabel: "Upgrade to Creator — $49/mo" },
  starter: { label: "Starter", next: "creator", nextLabel: "Upgrade to Creator — $49/mo" },
  creator: { label: "Creator", next: "studio",  nextLabel: "Upgrade to Studio — $99/mo" },
  studio:  { label: "Studio"  },
  pro:     { label: "Creator", next: "studio",  nextLabel: "Upgrade to Studio — $99/mo" },
};

const USAGE_LABELS: Record<string, string> = {
  scripts: "Scripts & Captions",
  images:  "Images",
  voice:   "Voice Clips",
  video:   "Videos",
  avatar:  "Avatar Generations",
};

const UPGRADE_NEEDED: Record<string, Record<string, string>> = {
  free:    { video: "Upgrade to Creator", avatar: "Upgrade to Creator" },
  starter: { video: "Upgrade to Creator", avatar: "Upgrade to Creator" },
  creator: { avatar: "Upgrade to Studio" },
  pro:     { avatar: "Upgrade to Studio" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function formatResetDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

function txLabel(tx: BillingData["recent_transactions"][0]) {
  if (tx.description) return tx.description;
  const map: Record<string, string> = {
    subscription: "Plan activated",
    topup:        "Credit pack purchased",
    usage:        "Generation",
    refund:       "Refund",
    promo:        "Promo code applied",
    reconciliation: "Balance adjustment",
  };
  return map[tx.type] ?? tx.type;
}

function computeRunningBalances(
  txs: BillingData["recent_transactions"],
  currentBalance: number
) {
  let running = currentBalance;
  return txs.map(tx => {
    const after = running;
    running -= tx.amount;
    return { ...tx, balance_after: after };
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ProgressBar({ pct, color = C.gold }: { pct: number; color?: string }) {
  const clamped = Math.min(100, Math.max(0, pct));
  return (
    <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 3, overflow: "hidden", marginTop: 6 }}>
      <div style={{
        height: "100%",
        width: `${clamped}%`,
        background: clamped >= 90
          ? `linear-gradient(90deg, ${C.rose}, #ff6b6b)`
          : clamped >= 70
            ? `linear-gradient(90deg, ${C.gold}, #F0A500)`
            : `linear-gradient(90deg, ${color}, ${color}cc)`,
        borderRadius: 3,
        transition: "width 0.6s ease",
      }} />
    </div>
  );
}

function SectionTag({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: "0.2em",
      textTransform: "uppercase", color: C.pink, marginBottom: 18,
    }}>
      {children}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function BillingPage() {
  return (
    <Suspense>
      <BillingPageInner />
    </Suspense>
  );
}

function BillingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BillingData | null>(null);
  const [buyingPack, setBuyingPack] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const [upgradingTo, setUpgradingTo] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("purchase") === "success") {
      setToast("Payment successful — your credits have been added.");
    }
  }, [searchParams]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const sb = createClient();
    sb.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace("/signin"); return; }
      try {
        const res = await fetch("/api/billing/usage", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) throw new Error("Failed to load billing data");
        setData(await res.json());
      } catch {
        // silently fail — show empty state
      } finally {
        setLoading(false);
      }
    });
  }, [router]);

  async function getToken() {
    const { data: { session } } = await createClient().auth.getSession();
    return session?.access_token ?? null;
  }

  async function handleManagePlan() {
    setOpeningPortal(true);
    try {
      const token = await getToken();
      if (!token) { router.replace("/signin"); return; }
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const { url, error } = await res.json();
      if (url) { window.location.href = url; return; }
      setToast(error ?? "Could not open billing portal.");
    } finally {
      setOpeningPortal(false);
    }
  }

  async function handleUpgrade(plan: string) {
    setUpgradingTo(plan);
    try {
      const token = await getToken();
      if (!token) { router.replace("/signin"); return; }
      const { data: { session } } = await createClient().auth.getSession();
      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack: plan, userId: session?.user?.id, email: session?.user?.email }),
      });
      const { url, error } = await res.json();
      if (url) { window.location.href = url; return; }
      setToast(error ?? "Checkout failed. Please try again.");
    } finally {
      setUpgradingTo(null);
    }
  }

  async function handleBuyPack(packId: string) {
    setBuyingPack(packId);
    try {
      const token = await getToken();
      if (!token) { router.replace("/signin"); return; }
      const res = await fetch("/api/billing/purchase-pack", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ packId }),
      });
      const { url, error } = await res.json();
      if (url) { window.location.href = url; return; }
      setToast(error ?? "Purchase failed. Please try again.");
    } finally {
      setBuyingPack(null);
    }
  }

  // ─── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
        <AnimatedBackground />
        <div style={{ position: "relative", zIndex: 1, textAlign: "center" }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid rgba(207,164,47,0.2)", borderTopColor: C.gold, animation: "spin 1s linear infinite", margin: "0 auto 16px" }} />
          <p style={{ color: C.sub, fontSize: 13 }}>Loading billing…</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div style={{ minHeight: "100vh", background: "transparent", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <AnimatedBackground />
        <div style={{ position: "relative", zIndex: 1, textAlign: "center", color: C.sub }}>
          <p>Could not load billing data.</p>
          <Link href="/dashboard" style={{ color: C.gold }}>← Back to Dashboard</Link>
        </div>
      </div>
    );
  }

  const tierInfo = TIER_DISPLAY[data.tier] ?? TIER_DISPLAY.free;
  const upgradeNeeded = UPGRADE_NEEDED[data.tier] ?? {};
  const txWithBalance = computeRunningBalances(data.recent_transactions, data.credits_balance);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "transparent", position: "relative", color: C.text }}>
      <AnimatedBackground />
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @keyframes slideDown { from { transform: translateY(-20px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
        @keyframes metalShimmer { 0% { background-position: 0% 50% } 100% { background-position: 200% 50% } }
      `}</style>

      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 80, left: "50%", transform: "translateX(-50%)",
          background: "rgba(78,203,140,0.15)", border: "1px solid rgba(78,203,140,0.35)",
          borderRadius: 12, padding: "12px 20px", color: "#4ECB8C", fontSize: 13,
          fontWeight: 600, zIndex: 999, animation: "slideDown 0.3s ease-out",
          backdropFilter: "blur(16px)",
        }}>
          ✓ {toast}
        </div>
      )}

      <div style={{ position: "relative", zIndex: 1 }}>

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div style={{
          borderBottom: "1px solid rgba(207,164,47,0.15)",
          padding: "1rem 1.5rem",
          display: "flex", alignItems: "center", gap: 14,
          position: "sticky", top: 0,
          background: "rgba(45,10,62,0.75)", backdropFilter: "blur(16px)", zIndex: 40,
        }}>
          <span style={{ fontWeight: 700, fontSize: 20, background: "linear-gradient(90deg,#CFA42F,#E8B84B)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            Omnyra
          </span>
          <button onClick={() => router.push("/dashboard")}
            style={{ background: "transparent", border: "none", color: "#aaa", cursor: "pointer", fontSize: 22, padding: 0 }}>
            ←
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>Billing &amp; Credits</h1>
            <p style={{ fontSize: 11, color: C.sub, margin: 0, marginTop: 2 }}>
              {tierInfo.label} plan · {data.tier_price}
            </p>
          </div>
          <div style={{
            padding: "4px 12px", borderRadius: 100,
            background: "rgba(78,203,140,0.1)", border: "1px solid rgba(78,203,140,0.3)",
            color: C.green, fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
          }}>
            ● ACTIVE
          </div>
        </div>

        <div style={{ maxWidth: 820, margin: "0 auto", padding: "2rem 1.5rem 6rem", display: "flex", flexDirection: "column", gap: 20 }}>

          {/* ── Current Plan Card ──────────────────────────────────────────── */}
          <div style={{ ...GOLD_CARD, padding: "1.5rem" }}>
            <SectionTag>Current Plan</SectionTag>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
              <div>
                <div style={{ fontSize: 28, fontWeight: 800, color: C.purple, marginBottom: 4 }}>
                  {tierInfo.label}
                </div>
                <div style={{ fontSize: 15, color: C.sub }}>{data.tier_price}</div>
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {data.has_stripe_customer && (
                  <button
                    onClick={handleManagePlan}
                    disabled={openingPortal}
                    style={{
                      padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 600,
                      cursor: openingPortal ? "wait" : "pointer", fontFamily: "inherit",
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.12)",
                      color: C.sub,
                    }}
                  >
                    {openingPortal ? "Opening…" : "Manage Plan →"}
                  </button>
                )}
                {tierInfo.next && (
                  <button
                    onClick={() => handleUpgrade(tierInfo.next!)}
                    disabled={upgradingTo !== null}
                    style={{
                      padding: "10px 20px", borderRadius: 10, fontSize: 13, fontWeight: 700,
                      cursor: upgradingTo ? "wait" : "pointer", fontFamily: "inherit",
                      background: "linear-gradient(105deg, #5A3400, #9A7010, #CFA42F, #E8C84A, #CFA42F, #9A7010, #5A3400)",
                      backgroundSize: "200% auto",
                      animation: "metalShimmer 3s linear infinite",
                      color: "#0D0010", border: "none",
                      boxShadow: "0 0 20px rgba(207,164,47,0.3)",
                    }}
                  >
                    {upgradingTo === tierInfo.next ? "Redirecting…" : tierInfo.nextLabel}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── Credits Overview ───────────────────────────────────────────── */}
          <div style={{ ...CARD, padding: "1.5rem" }}>
            <SectionTag>Credits Balance</SectionTag>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
              <div>
                <div style={{
                  fontSize: 64, fontWeight: 900, lineHeight: 1,
                  background: "linear-gradient(105deg, #CFA42F, #F7D96B)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}>
                  {data.credits_balance.toLocaleString()}
                </div>
                <div style={{ fontSize: 14, color: C.sub, marginTop: 6 }}>
                  credits remaining
                </div>
                <div style={{ fontSize: 12, color: "rgba(187,168,200,0.6)", marginTop: 4 }}>
                  Resets {formatResetDate(data.credits_reset_date)}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 180 }}>
                <div style={{ fontSize: 12, color: C.sub }}>Cost examples:</div>
                {Object.entries(data.credit_cost_examples).map(([k, v]) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ textTransform: "capitalize", color: C.sub }}>{k}</span>
                    <span style={{ color: C.gold, fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Monthly Usage Breakdown ────────────────────────────────────── */}
          <div style={{ ...CARD, padding: "1.5rem" }}>
            <SectionTag>Monthly Usage</SectionTag>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {Object.entries(data.monthly_usage).map(([key, item]) => {
                const label = USAGE_LABELS[key] ?? key;
                const lockMsg = upgradeNeeded[key];
                const isUnlimited = item.limit === "unlimited";
                const isLocked = item.limit === 0;
                const pct = isUnlimited || isLocked ? 0
                  : Math.round((item.used / (item.limit as number)) * 100);

                return (
                  <div key={key}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{label}</span>
                      {lockMsg ? (
                        <span style={{ fontSize: 11, color: C.sub, fontStyle: "italic" }}>
                          {lockMsg}
                        </span>
                      ) : isUnlimited ? (
                        <span style={{ fontSize: 13, color: C.green, fontWeight: 600 }}>
                          ∞ unlimited ({item.used} used)
                        </span>
                      ) : (
                        <span style={{ fontSize: 13, color: pct >= 90 ? C.rose : C.sub, fontWeight: 500 }}>
                          {(item.limit as number) - item.used} / {item.limit} remaining
                        </span>
                      )}
                    </div>
                    {!isUnlimited && !isLocked && (
                      <ProgressBar pct={pct} />
                    )}
                    {isLocked && (
                      <div style={{ height: 5, background: "rgba(255,255,255,0.04)", borderRadius: 3, marginTop: 4 }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Credit Packs ───────────────────────────────────────────────── */}
          <div style={{ ...CARD, padding: "1.5rem" }}>
            <SectionTag>Credit Packs</SectionTag>
            <p style={{ fontSize: 13, color: C.sub, marginBottom: 20, lineHeight: 1.6 }}>
              Top up when you need a burst. Subscriptions always offer better value per credit —
              packs are for convenience.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 16 }}>
              {data.available_packs.map(pack => (
                <div key={pack.id} style={{
                  background: "rgba(45,10,62,0.7)",
                  border: "1px solid rgba(207,164,47,0.2)",
                  borderRadius: 16, padding: "1.25rem",
                  display: "flex", flexDirection: "column", gap: 12,
                  position: "relative",
                }}>
                  {pack.id === "medium" && (
                    <div style={{
                      position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
                      background: "rgba(232,121,249,0.12)", border: "1px solid rgba(232,121,249,0.35)",
                      color: C.pink, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
                      padding: "3px 10px", borderRadius: 100, whiteSpace: "nowrap",
                    }}>
                      POPULAR
                    </div>
                  )}
                  {pack.id === "large" && (
                    <div style={{
                      position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
                      background: "rgba(207,164,47,0.15)", border: "1px solid rgba(207,164,47,0.35)",
                      color: C.gold, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
                      padding: "3px 10px", borderRadius: 100, whiteSpace: "nowrap",
                    }}>
                      BEST VALUE
                    </div>
                  )}
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{pack.name}</div>
                  <div>
                    <div style={{ fontSize: 30, fontWeight: 800, color: C.purple, lineHeight: 1 }}>
                      {pack.credits.toLocaleString()}
                    </div>
                    <div style={{ fontSize: 10, color: C.sub, textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 2 }}>
                      credits
                    </div>
                  </div>
                  <div style={{ marginTop: "auto" }}>
                    <div style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 10 }}>
                      ${pack.price_aud}{" "}
                      <span style={{ fontSize: 11, color: C.sub, fontWeight: 400 }}>AUD</span>
                    </div>
                    <button
                      onClick={() => handleBuyPack(pack.id)}
                      disabled={buyingPack !== null}
                      style={{
                        width: "100%", padding: "10px", borderRadius: 10,
                        fontFamily: "inherit", fontSize: 13, fontWeight: 700,
                        cursor: buyingPack ? "wait" : "pointer",
                        border: "none",
                        background: buyingPack === pack.id
                          ? "rgba(255,255,255,0.06)"
                          : "linear-gradient(105deg, #5A3400, #9A7010, #CFA42F, #E8C84A, #CFA42F, #9A7010, #5A3400)",
                        backgroundSize: "200% auto",
                        animation: buyingPack !== pack.id ? "metalShimmer 3s linear infinite" : undefined,
                        color: buyingPack === pack.id ? C.sub : "#0D0010",
                        boxShadow: buyingPack !== pack.id ? "0 0 16px rgba(207,164,47,0.2)" : "none",
                      }}
                    >
                      {buyingPack === pack.id ? "Redirecting…" : "Buy Now →"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: "rgba(187,168,200,0.5)", textAlign: "center", margin: 0 }}>
              Credit packs never expire. Use them anytime — they stack with your subscription credits.
            </p>
          </div>

          {/* ── Transaction History ────────────────────────────────────────── */}
          <div style={{ ...CARD, padding: "1.5rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <SectionTag>Recent Transactions</SectionTag>
              <span style={{ fontSize: 11, color: C.sub }}>Last {Math.min(20, txWithBalance.length)} entries</span>
            </div>

            {txWithBalance.length === 0 ? (
              <div style={{ textAlign: "center", color: C.sub, fontSize: 13, padding: "24px 0" }}>
                No transactions yet.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid rgba(207,164,47,0.1)" }}>
                      {["Date", "Description", "Credits", "Balance After"].map(h => (
                        <th key={h} style={{
                          textAlign: "left", padding: "6px 10px 10px",
                          fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
                          color: C.sub, textTransform: "uppercase",
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {txWithBalance.map((tx, i) => {
                      const isCredit = tx.amount > 0;
                      return (
                        <tr key={i} style={{
                          borderBottom: "1px solid rgba(255,255,255,0.04)",
                        }}>
                          <td style={{ padding: "10px", color: C.sub, whiteSpace: "nowrap" }}>
                            {formatDate(tx.created_at)}
                          </td>
                          <td style={{ padding: "10px", color: C.text, maxWidth: 260 }}>
                            {txLabel(tx)}
                          </td>
                          <td style={{
                            padding: "10px", fontWeight: 700, whiteSpace: "nowrap",
                            color: isCredit ? C.green : C.rose,
                          }}>
                            {isCredit ? "+" : ""}{tx.amount.toLocaleString()}
                          </td>
                          <td style={{ padding: "10px", color: C.sub, whiteSpace: "nowrap" }}>
                            {tx.balance_after.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
