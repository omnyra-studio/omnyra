"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AnimatedBackground from "@/components/AnimatedBackground";

interface CreditRow {
  id: string;
  action_type: string;
  amount: number;
  created_at: string;
  balance_after?: number;
}

interface Profile {
  plan: string;
  credits: number;
  credits_used?: number;
}

function planLabel(plan: string): string {
  const labels: Record<string, string> = {
    free: "Free", starter: "Starter", creator: "Creator", studio: "Studio",
  };
  return labels[plan] ?? plan;
}

function actionLabel(type: string): string {
  const labels: Record<string, string> = {
    cinematic_video_30s: "🎬 Cinematic Video",
    avatar_video_30s: "👤 Avatar Video",
    image_standard: "🖼️ Image",
    image_hd: "🖼️ Image HD",
    voice_30s: "🎙️ Voiceover",
    voice_60s: "🎙️ Voiceover 60s",
    lipsync: "👤 Lipsync",
  };
  return labels[type] ?? type.replace(/_/g, " ");
}

export default function UsagePage() {
  const router = useRouter();
  const supabase = createClient();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [transactions, setTransactions] = useState<CreditRow[]>([]);
  const [renderCount, setRenderCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/signin"); return; }

      const [profileRes, txnRes, renderRes] = await Promise.all([
        supabase.from("profiles").select("plan, credits, credits_used").eq("id", user.id).single(),
        supabase.from("credit_transactions").select("id, action_type, amount, created_at, balance_after")
          .eq("user_id", user.id).order("created_at", { ascending: false }).limit(30),
        supabase.from("renders").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      ]);

      if (profileRes.data) setProfile(profileRes.data as Profile);
      if (txnRes.data) setTransactions(txnRes.data as CreditRow[]);
      if (renderRes.count !== null) setRenderCount(renderRes.count);
      setLoading(false);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const creditsRemaining = profile ? profile.credits - (profile.credits_used ?? 0) : 0;

  return (
    <div style={{ minHeight: "100vh", background: "transparent", color: "rgba(255,255,255,0.9)", position: "relative" }}>
      <AnimatedBackground />
      <div style={{ position: "relative", zIndex: 1, maxWidth: 760, margin: "0 auto", padding: "40px 20px 80px" }}>

        <button
          onClick={() => router.back()}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 10, padding: "8px 16px", color: "white", cursor: "pointer", fontSize: 14, marginBottom: 28,
          }}
        >← Back</button>

        <h1 style={{ fontSize: "1.8rem", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", color: "#C9A84C", marginBottom: 6 }}>
          My Usage
        </h1>

        {loading ? (
          <p style={{ color: "rgba(255,255,255,0.4)" }}>Loading…</p>
        ) : (
          <>
            {/* Stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 36, marginTop: 24 }}>
              {[
                { label: "Plan", value: planLabel(profile?.plan ?? "free") },
                { label: "Credits Remaining", value: creditsRemaining.toLocaleString() },
                { label: "Videos Created", value: renderCount.toLocaleString() },
              ].map((s) => (
                <div key={s.label} style={{
                  background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                  borderRadius: 14, padding: "18px 20px",
                }}>
                  <div style={{ color: "rgba(255,255,255,0.45)", fontSize: 12, marginBottom: 6 }}>{s.label}</div>
                  <div style={{ color: "#C9A84C", fontWeight: 800, fontSize: "1.3rem" }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Credit history */}
            <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "rgba(255,255,255,0.6)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 14 }}>
              Credit History
            </h2>

            {transactions.length === 0 ? (
              <p style={{ color: "rgba(255,255,255,0.3)", textAlign: "center", padding: "30px 0" }}>No credit history yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {transactions.map((tx) => (
                  <div key={tx.id} style={{
                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)",
                    borderRadius: 10, padding: "12px 16px",
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                  }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{actionLabel(tx.action_type)}</div>
                      <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, marginTop: 2 }}>
                        {new Date(tx.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: tx.amount < 0 ? "#FF6B6B" : "#4ADE80", fontWeight: 700, fontSize: 15 }}>
                        {tx.amount > 0 ? "+" : ""}{tx.amount} cr
                      </div>
                      {tx.balance_after !== undefined && (
                        <div style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>
                          Balance: {tx.balance_after} cr
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ marginTop: 28, textAlign: "center" }}>
              <a href="/dashboard/credits" style={{
                background: "rgba(201,168,76,0.14)", border: "1px solid rgba(201,168,76,0.4)",
                borderRadius: 10, padding: "10px 24px", color: "#C9A84C",
                fontWeight: 700, fontSize: 14, textDecoration: "none", display: "inline-block",
              }}>Upgrade Plan →</a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
