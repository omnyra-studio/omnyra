"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

const NICHES = [
  "Beauty & Skincare","Fitness & Wellness","Health & Nutrition","Psychology & Relationships",
  "Finance & Investing","Business / Entrepreneurship","SaaS / Tech / AI","Education & Productivity",
  "Entertainment & Storytelling","Gaming","Travel & Lifestyle","Food & Cooking",
  "Marketing & Creator Economy","Internet Culture / Memes","Other",
];

const PLATFORMS = ["TikTok","Instagram Reels","YouTube Shorts"];

const ROLE_LABEL = {
  recommended:     "⭐ Recommended",
  close_competitor: "Close Alternative",
  high_risk_reward: "High Risk / High Reward",
  supporting:      "Supporting Variant",
};

const SCORE_COLORS = {
  high:   "#50B388",
  mid:    "#D4A843",
  low:    "#E879F9",
};

function scoreColor(n) {
  return n >= 75 ? SCORE_COLORS.high : n >= 55 ? SCORE_COLORS.mid : SCORE_COLORS.low;
}

function ScoreBar({ label, value }) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#C0A4C8", marginBottom: 3 }}>
        <span>{label}</span>
        <span style={{ color: scoreColor(value), fontWeight: 600 }}>{value}</span>
      </div>
      <div style={{ height: 4, borderRadius: 4, background: "rgba(255,255,255,0.08)" }}>
        <div style={{ height: "100%", width: `${value}%`, borderRadius: 4, background: scoreColor(value), transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

function PlatformDots({ platformFit }) {
  const entries = Object.entries(platformFit ?? {}).slice(0, 3);
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
      {entries.map(([platform, score]) => (
        <span key={platform} style={{
          fontSize: 10, padding: "2px 8px", borderRadius: 20,
          background: `rgba(80,179,136,${score / 200})`,
          border: "1px solid rgba(80,179,136,0.3)", color: "#E8DEFF",
        }}>
          {platform.replace("_", " ")} {score}
        </span>
      ))}
    </div>
  );
}

function VariantCard({ variant, isSelected, onSelect, sessionCompleted }) {
  const [expanded, setExpanded] = useState(variant.isRecommended);
  const isRec = variant.isRecommended;
  const roleLabel = ROLE_LABEL[variant.displayRole] ?? variant.displayRole;

  return (
    <div
      onClick={() => setExpanded(e => !e)}
      style={{
        borderRadius: 12,
        border: isSelected
          ? "2px solid #50B388"
          : isRec
          ? "1px solid rgba(212,168,67,0.5)"
          : "1px solid rgba(204,171,175,0.15)",
        background: isRec
          ? "rgba(212,168,67,0.06)"
          : "rgba(255,255,255,0.03)",
        padding: isRec ? "20px 22px" : "14px 18px",
        cursor: "pointer",
        transition: "border-color 0.2s, box-shadow 0.2s",
        boxShadow: isSelected ? "0 0 0 3px rgba(80,179,136,0.2)" : isRec ? "0 0 20px rgba(212,168,67,0.08)" : "none",
        position: "relative",
      }}
    >
      {/* Role badge */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <span style={{
          fontSize: 11, fontWeight: 600, letterSpacing: "0.05em",
          color: isRec ? "#D4A843" : "#C084FC",
        }}>
          {roleLabel}
        </span>
        <span style={{ fontSize: 13, fontWeight: 700, color: scoreColor(variant.finalScore) }}>
          {variant.finalScore}
        </span>
      </div>

      {/* Hook */}
      <p style={{
        fontSize: isRec ? 16 : 14, fontWeight: isRec ? 600 : 500,
        color: "#E8DEFF", lineHeight: 1.5, marginBottom: 8,
      }}>
        &ldquo;{variant.hook}&rdquo;
      </p>

      {/* Format + strategy tag */}
      <div style={{ display: "flex", gap: 6, marginBottom: expanded ? 14 : 0 }}>
        <span style={{
          fontSize: 10, padding: "2px 8px", borderRadius: 20,
          background: "rgba(192,132,252,0.1)", border: "1px solid rgba(192,132,252,0.25)", color: "#C084FC",
        }}>
          {variant.format?.replace(/_/g, " ")}
        </span>
        <span style={{
          fontSize: 10, padding: "2px 8px", borderRadius: 20,
          background: "rgba(232,135,249,0.08)", border: "1px solid rgba(232,135,249,0.2)", color: "#E879F9",
        }}>
          {variant.psychologicalStrategy?.replace(/_/g, " ")}
        </span>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ marginTop: 12 }}>
          {/* Script */}
          <div style={{
            background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "10px 12px",
            fontSize: 13, color: "#C0A4C8", lineHeight: 1.7, marginBottom: 14,
            borderLeft: "3px solid rgba(192,132,252,0.3)",
          }}>
            {variant.script}
          </div>

          {/* Score bars */}
          <div style={{ marginBottom: 12 }}>
            <ScoreBar label="Scroll Hold" value={variant.scores.scrollHold} />
            <ScoreBar label="Share Potential" value={variant.scores.sharePotential} />
            <ScoreBar label="Message Strength" value={variant.scores.messageStrength} />
          </div>

          {/* Platform fit */}
          <PlatformDots platformFit={variant.scores.platformFit} />

          {/* Why this wins (recommended only) */}
          {isRec && variant.recommendationReason && (
            <div style={{
              marginTop: 14, padding: "10px 12px", borderRadius: 8,
              background: "rgba(212,168,67,0.08)", border: "1px solid rgba(212,168,67,0.2)",
              fontSize: 12, color: "#D4A843", lineHeight: 1.6,
            }}>
              <span style={{ fontWeight: 600 }}>Why this wins: </span>
              {variant.recommendationReason}
            </div>
          )}

          {/* Select button */}
          {!sessionCompleted && (
            <button
              onClick={e => { e.stopPropagation(); onSelect(variant); }}
              style={{
                marginTop: 14, width: "100%", padding: "10px 0",
                borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 600, fontSize: 13,
                background: isSelected ? "#50B388" : isRec ? "#D4A843" : "rgba(192,132,252,0.15)",
                color: isSelected || isRec ? "#0D0010" : "#C084FC",
                transition: "background 0.2s",
              }}
            >
              {isSelected ? "✓ Selected" : "Select this direction"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function LoadingSteps({ step }) {
  const steps = [
    "Building hooks",
    "Writing scripts",
    "Scoring variants",
    "Ranking results",
  ];
  return (
    <div style={{ maxWidth: 360, margin: "0 auto", padding: "60px 0" }}>
      <p style={{ textAlign: "center", color: "#C084FC", fontSize: 16, marginBottom: 32, fontWeight: 500 }}>
        Generating 6 content directions…
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {steps.map((s, i) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{
              width: 24, height: 24, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, fontWeight: 700, flexShrink: 0,
              background: i < step ? "#50B388" : i === step ? "rgba(212,168,67,0.3)" : "rgba(255,255,255,0.06)",
              color: i < step ? "#0D0010" : i === step ? "#D4A843" : "#555",
              border: i === step ? "1px solid rgba(212,168,67,0.5)" : "none",
            }}>
              {i < step ? "✓" : i + 1}
            </span>
            <span style={{
              fontSize: 14, color: i < step ? "#50B388" : i === step ? "#D4A843" : "#555",
              fontWeight: i === step ? 600 : 400,
            }}>
              {s}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ViralStrategyPage() {
  const router = useRouter();

  // Screen state: "input" | "loading" | "results"
  const [screen, setScreen] = useState("input");
  const [loadStep, setLoadStep] = useState(0);

  // Input
  const [idea, setIdea] = useState("");
  const [niche, setNiche] = useState(NICHES[0]);
  const [platform, setPlatform] = useState("TikTok");

  // Results
  const [variants, setVariants] = useState([]);
  const [sessionId, setSessionId] = useState("");
  const [recommendationReason, setRecommendationReason] = useState("");
  const [selectedVariant, setSelectedVariant] = useState(null);
  const [sessionPrefs, setSessionPrefs] = useState(null);
  const [sessionCompleted, setSessionCompleted] = useState(false);

  const [error, setError] = useState("");

  async function generate() {
    if (!idea.trim()) return;
    setError("");
    setScreen("loading");
    setLoadStep(0);
    setSelectedVariant(null);
    setSessionCompleted(false);

    // Animate loading steps
    const stepTimer = setInterval(() => setLoadStep(s => Math.min(s + 1, 3)), 800);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/viral-strategy/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session && { Authorization: `Bearer ${session.access_token}` }),
        },
        body: JSON.stringify({
          idea: idea.trim(),
          niche,
          platform,
          sessionPreferences: sessionPrefs ?? undefined,
        }),
      });

      clearInterval(stepTimer);

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");

      setSessionId(data.sessionId);
      setRecommendationReason(data.recommendationReason);
      // Attach recommendationReason to the recommended card
      setVariants(data.variants.map(v => ({
        ...v,
        recommendationReason: v.isRecommended ? data.recommendationReason : null,
      })));
      setLoadStep(4);
      setScreen("results");
    } catch (err) {
      clearInterval(stepTimer);
      setError(err.message || "Generation failed. Please try again.");
      setScreen("input");
    }
  }

  async function handleSelect(variant) {
    setSelectedVariant(variant.id);
    setSessionCompleted(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/viral-strategy/select", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session && { Authorization: `Bearer ${session.access_token}` }),
        },
        body: JSON.stringify({
          sessionId,
          selectedStrategy: variant.psychologicalStrategy,
          currentPrefs: sessionPrefs ?? undefined,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSessionPrefs(data.updatedPrefs);
      }
    } catch {
      // Non-fatal — session bias update is best-effort
    }
  }

  const inputBorder = "1px solid rgba(204,171,175,0.25)";
  const inputStyle = {
    width: "100%", padding: "12px 14px", borderRadius: 8,
    border: inputBorder, background: "#0D0010", color: "#E8DEFF",
    fontSize: 14, fontFamily: "inherit", boxSizing: "border-box",
  };

  return (
    <div style={{ minHeight: "100vh", background: "transparent", color: "#fff", position: "relative" }}>

      {/* Header */}
      <div style={{
        padding: "28px 32px 0",
        borderBottom: "1px solid rgba(204,171,175,0.1)",
        paddingBottom: 20, marginBottom: 32,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <button
            onClick={() => router.push("/dashboard")}
            style={{ background: "none", border: "none", color: "#C084FC", cursor: "pointer", fontSize: 20, padding: 0 }}
          >
            ←
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#E8DEFF", margin: 0 }}>
            Content Direction Engine
          </h1>
        </div>
        <p style={{ fontSize: 13, color: "#8B7A8E", marginLeft: 30 }}>
          6 ranked hook + script variants — score, compare, select.
        </p>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "0 24px 80px" }}>

        {/* SCREEN 1 — INPUT */}
        {screen === "input" && (
          <div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ display: "block", fontSize: 13, color: "#C0A4C8", marginBottom: 6 }}>
                  Content Idea
                </label>
                <textarea
                  value={idea}
                  onChange={e => setIdea(e.target.value)}
                  placeholder="What is your video about? Be specific — better input = sharper output."
                  rows={4}
                  style={{ ...inputStyle, resize: "vertical", color: "#E8DEFF" }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, color: "#C0A4C8", marginBottom: 6 }}>
                    Niche
                  </label>
                  <select value={niche} onChange={e => setNiche(e.target.value)} style={inputStyle}>
                    {NICHES.map(n => <option key={n}>{n}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: 13, color: "#C0A4C8", marginBottom: 6 }}>
                    Platform
                  </label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {PLATFORMS.map(p => (
                      <button
                        key={p}
                        onClick={() => setPlatform(p)}
                        style={{
                          flex: 1, padding: "10px 6px", borderRadius: 8, cursor: "pointer",
                          fontSize: 11, fontWeight: 600, border: "none",
                          background: platform === p ? "#C084FC" : "rgba(192,132,252,0.1)",
                          color: platform === p ? "#0D0010" : "#C084FC",
                          transition: "background 0.2s",
                        }}
                      >
                        {p.split(" ")[0]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {error && (
                <p style={{ fontSize: 13, color: "#E879F9", padding: "10px 14px", borderRadius: 8, background: "rgba(232,121,249,0.08)" }}>
                  {error}
                </p>
              )}

              <button
                onClick={generate}
                disabled={!idea.trim()}
                style={{
                  padding: "14px 0", borderRadius: 10, border: "none", cursor: idea.trim() ? "pointer" : "not-allowed",
                  background: idea.trim() ? "#C084FC" : "rgba(192,132,252,0.2)",
                  color: idea.trim() ? "#0D0010" : "#555",
                  fontSize: 15, fontWeight: 700, transition: "background 0.2s",
                }}
              >
                Generate 6 Variants
              </button>
            </div>

            {/* Disclaimer */}
            <p style={{ marginTop: 20, fontSize: 11, color: "#5A4A5E", textAlign: "center", lineHeight: 1.5 }}>
              Virality is not guaranteed — outputs only increase the likelihood of performance based on predictive modeling.
            </p>
          </div>
        )}

        {/* SCREEN 2 — LOADING */}
        {screen === "loading" && <LoadingSteps step={loadStep} />}

        {/* SCREEN 3 — RESULTS */}
        {screen === "results" && (
          <div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 600, color: "#E8DEFF", margin: 0 }}>
                  6 Content Directions
                </h2>
                <p style={{ fontSize: 12, color: "#8B7A8E", marginTop: 3 }}>
                  Ranked by score. Select one to lock your direction.
                </p>
              </div>
              <button
                onClick={() => { setScreen("input"); setVariants([]); setSelectedVariant(null); setSessionCompleted(false); }}
                style={{
                  padding: "8px 16px", borderRadius: 8, border: "1px solid rgba(192,132,252,0.3)",
                  background: "none", color: "#C084FC", cursor: "pointer", fontSize: 13,
                }}
              >
                New Idea
              </button>
            </div>

            {/* Regenerate same idea */}
            {sessionCompleted && (
              <div style={{
                marginBottom: 20, padding: "12px 16px", borderRadius: 8,
                background: "rgba(80,179,136,0.08)", border: "1px solid rgba(80,179,136,0.25)",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}>
                <p style={{ fontSize: 13, color: "#50B388", margin: 0 }}>
                  Direction selected. Next generation will use your session preference.
                </p>
                <button
                  onClick={generate}
                  style={{
                    padding: "6px 14px", borderRadius: 6, border: "1px solid rgba(80,179,136,0.4)",
                    background: "none", color: "#50B388", cursor: "pointer", fontSize: 12,
                  }}
                >
                  Regenerate
                </button>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {variants.map(v => (
                <VariantCard
                  key={v.id}
                  variant={v}
                  isSelected={selectedVariant === v.id}
                  onSelect={handleSelect}
                  sessionCompleted={sessionCompleted}
                />
              ))}
            </div>

            <p style={{ marginTop: 24, fontSize: 11, color: "#5A4A5E", textAlign: "center", lineHeight: 1.5 }}>
              Virality is not guaranteed — outputs only increase the likelihood of performance based on predictive modeling.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
