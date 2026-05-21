"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

const C = { bg: "#0a0a0a", card: "#0f0f0f", border: "#1e1e1e", text: "#f5f3ff", sub: "rgba(245,243,255,0.45)", violet: "#8b5cf6" };

const PACKS = [
  {
    id: "pack_100",
    name: "Starter",
    credits: 100,
    price: "$9",
    priceNum: 9,
    badge: null,
    perCredit: "9¢",
    desc: "Perfect for trying out image & voice generation",
    highlight: false,
  },
  {
    id: "pack_300",
    name: "Value",
    credits: 300,
    price: "$25",
    priceNum: 25,
    badge: "Popular",
    perCredit: "8¢",
    desc: "Great for regular content creators",
    highlight: false,
  },
  {
    id: "pack_800",
    name: "Pro Pack",
    credits: 800,
    price: "$49",
    priceNum: 49,
    badge: "Best Value",
    perCredit: "6¢",
    desc: "Ideal for high-volume production",
    highlight: true,
  },
  {
    id: "pack_2000",
    name: "Max Pack",
    credits: 2000,
    price: "$99",
    priceNum: 99,
    badge: null,
    perCredit: "5¢",
    desc: "For studios and power users",
    highlight: false,
  },
];

const CREDIT_COSTS = [
  { action: "Script / Caption / Research", cost: "Free (unlimited)" },
  { action: "Image (standard)",            cost: "2 credits" },
  { action: "Image HD",                    cost: "4 credits" },
  { action: "Voice 30s",                   cost: "2 credits" },
  { action: "Voice 60s",                   cost: "4 credits" },
  { action: "Video 30s",                   cost: "20 credits" },
  { action: "Video 60s",                   cost: "40 credits" },
  { action: "Avatar 30s",                  cost: "25 credits" },
  { action: "Avatar 60s",                  cost: "45 credits" },
];

export default function CreditsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState("");

  async function buyPack(pack) {
    setLoading(pack.id);
    setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        router.push("/signin");
        return;
      }

      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pack: pack.id,
          userId: session.user.id,
          email: session.user.email,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      window.location.href = data.url;
    } catch (err) {
      setError(err.message);
      setLoading(null);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text }}>

      {/* HEADER */}
      <div style={{ borderBottom: "0.5px solid #1a1a1a", padding: "1rem 1.5rem", display: "flex", alignItems: "center", gap: 14, position: "sticky", top: 0, background: C.bg, zIndex: 10 }}>
        <button onClick={() => router.push("/dashboard")}
          style={{ background: "transparent", border: "none", color: "#666", cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 0 }}>
          ←
        </button>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, letterSpacing: "-0.02em" }}>Buy Credits</h1>
          <p style={{ fontSize: 11, color: C.sub, margin: 0, marginTop: 2 }}>Top up anytime — credits never expire</p>
        </div>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "2rem 1.5rem 6rem" }}>

        {error && (
          <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 10, padding: "10px 14px", marginBottom: 20, color: "#f87171", fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* PACK CARDS */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 14, marginBottom: 40 }}>
          {PACKS.map(pack => (
            <div key={pack.id} style={{
              background: pack.highlight ? "rgba(139,92,246,0.08)" : C.card,
              border: pack.highlight ? "1px solid rgba(139,92,246,0.4)" : `0.5px solid ${C.border}`,
              borderRadius: 16,
              padding: "1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              position: "relative",
            }}>
              {pack.badge && (
                <div style={{
                  position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)",
                  background: pack.badge === "Best Value" ? "linear-gradient(135deg,#8b5cf6,#22d3ee)" : "#1e1e1e",
                  color: "#fff", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
                  padding: "3px 10px", borderRadius: 100, whiteSpace: "nowrap",
                }}>
                  {pack.badge.toUpperCase()}
                </div>
              )}

              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{pack.name}</div>
                <div style={{ fontSize: 11, color: C.sub, marginTop: 2 }}>{pack.desc}</div>
              </div>

              <div>
                <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.03em" }}>{pack.credits.toLocaleString()}</div>
                <div style={{ fontSize: 10, color: C.sub, textTransform: "uppercase", letterSpacing: "0.1em" }}>credits</div>
              </div>

              <div style={{ fontSize: 10, color: "#a78bfa" }}>{pack.perCredit} per credit</div>

              <div style={{ marginTop: "auto" }}>
                <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>{pack.price} <span style={{ fontSize: 11, color: C.sub, fontWeight: 400 }}>AUD</span></div>
                <button
                  onClick={() => buyPack(pack)}
                  disabled={!!loading}
                  style={{
                    width: "100%", padding: "10px", borderRadius: 10, border: "none",
                    cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", fontWeight: 700, fontSize: 13,
                    background: loading === pack.id
                      ? "rgba(255,255,255,0.08)"
                      : pack.highlight
                        ? "linear-gradient(135deg,#8b5cf6,#22d3ee)"
                        : "rgba(255,255,255,0.08)",
                    color: loading === pack.id ? C.sub : "#fff",
                    transition: "all 0.2s",
                  }}
                >
                  {loading === pack.id ? "Loading..." : "Buy Now →"}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* CREDIT COST TABLE */}
        <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: 16, overflow: "hidden" }}>
          <div style={{ padding: "1rem 1.25rem", borderBottom: `0.5px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.sub, textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 700 }}>Credit Costs</div>
          </div>
          {CREDIT_COSTS.map((row, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "10px 1.25rem",
              borderBottom: i < CREDIT_COSTS.length - 1 ? `0.5px solid ${C.border}` : "none",
              fontSize: 13,
            }}>
              <span style={{ color: C.sub }}>{row.action}</span>
              <span style={{ fontWeight: 600, color: row.cost.includes("Free") ? "#4ade80" : C.text }}>{row.cost}</span>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 11, color: C.sub, textAlign: "center", marginTop: 24 }}>
          Credits are added instantly after payment. They never expire and stack with your subscription credits.
        </p>
      </div>
    </div>
  );
}
