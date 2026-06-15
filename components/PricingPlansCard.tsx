"use client";

/**
 * PricingPlansCard — Omnyra plan & credits overview.
 *
 * Shows all 4 plans (Free → Starter → Creator → Studio), highlights the
 * current plan, credits-per-action table, and top-up packs (Coming Soon).
 *
 * Usage:
 *   <PricingPlansCard currentPlan="creator" onUpgrade={handleUpgrade} />
 */

import { type CSSProperties, useState } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type Plan = "free" | "starter" | "creator" | "studio";

interface PlanDef {
  id:           Plan;
  name:         string;
  price:        string;
  priceNote:    string;
  credits:      number;
  features:     string[];
  videoLabel:   string;
  cta:          string;
  highlight?:   boolean;
}

interface TopUpPack {
  id:       string;
  name:     string;
  credits:  number;
  price:    string;
  badge?:   "popular" | "best_value";
}

// ── Data ──────────────────────────────────────────────────────────────────────

const PLANS: PlanDef[] = [
  {
    id:        "free",
    name:      "Free",
    price:     "$0",
    priceNote: "forever",
    credits:   30,
    videoLabel: "1 × 30s watermarked preview/mo",
    features: [
      "30 credits/month",
      "Unlimited scripts & captions",
      "10 images/month",
      "5 voice clips/month",
      "1 × 30s watermarked video/month",
    ],
    cta: "Current plan",
  },
  {
    id:        "starter",
    name:      "Starter",
    price:     "$19",
    priceNote: "AUD/month",
    credits:   100,
    videoLabel: "1 × 30s clean cinematic/mo",
    features: [
      "100 credits/month",
      "Unlimited scripts & captions",
      "33 images/month",
      "20 voice clips/month",
      "1 × 30s cinematic video/month",
    ],
    cta: "Upgrade",
  },
  {
    id:        "creator",
    name:      "Creator",
    price:     "$49",
    priceNote: "AUD/month",
    credits:   350,
    videoLabel: "5 × 30s cinematic + 5 avatar/mo",
    highlight: true,
    features: [
      "350 credits/month",
      "Unlimited scripts & captions",
      "116 images/month",
      "60 voice clips/month",
      "5 × 30s cinematic videos/month",
      "5 avatar videos/month",
    ],
    cta: "Upgrade",
  },
  {
    id:        "studio",
    name:      "Studio",
    price:     "$99",
    priceNote: "AUD/month",
    credits:   900,
    videoLabel: "20 × 30s cinematic + 10 avatar + 5 × 60s/mo",
    features: [
      "900 credits/month",
      "Unlimited scripts & captions",
      "300 images/month",
      "150 voice clips/month",
      "20 × 30s cinematic videos/month",
      "10 avatar videos/month",
      "5 × 60s full sequences/month",
    ],
    cta: "Upgrade",
  },
];

const CREDIT_ACTIONS = [
  { label: "Script / Caption / Brief",    cost: "Free" },
  { label: "Voice-Over Script",           cost: "Free" },
  { label: "Truth Card",                  cost: "Free" },
  { label: "Image (Standard)",            cost: "3 cr" },
  { label: "Image (HD)",                  cost: "6 cr" },
  { label: "4 Scene Images",              cost: "12 cr" },
  { label: "Voice 30s",                   cost: "5 cr" },
  { label: "Voice 60s",                   cost: "10 cr" },
  { label: "Voice Clone",                 cost: "15 cr" },
  { label: "Cinematic Video (30s)",       cost: "40 cr" },
  { label: "Avatar Video (30s)",          cost: "40 cr" },
  { label: "Avatar Video (60s)",          cost: "80 cr" },
  { label: "Full Sequence (60s)",         cost: "80 cr" },
];

const TOP_UP_PACKS: TopUpPack[] = [
  { id: "small",  name: "Small Pack",  credits: 100, price: "$19 AUD" },
  { id: "medium", name: "Medium Pack", credits: 300, price: "$49 AUD", badge: "popular" },
  { id: "large",  name: "Large Pack",  credits: 700, price: "$99 AUD", badge: "best_value" },
];

// ── Styles ────────────────────────────────────────────────────────────────────

const C = {
  bg:      "#0D0010",
  card:    "rgba(75,30,130,0.55)",
  border:  "rgba(204,171,175,0.18)",
  gold:    "#D4A843",
  purple:  "#C084FC",
  text:    "#E8DEFF",
  sub:     "#BBA8C8",
  green:   "#4ECB8C",
  muted:   "rgba(255,255,255,0.08)",
};

const baseCard: CSSProperties = {
  background:    C.card,
  backdropFilter: "blur(16px)",
  border:        `1px solid ${C.border}`,
  borderRadius:  20,
  padding:       "28px 24px",
  display:       "flex",
  flexDirection: "column",
  gap:           12,
  flex:          "1 1 200px",
  minWidth:      0,
};

const highlightCard: CSSProperties = {
  ...baseCard,
  border:     `1.5px solid ${C.gold}`,
  boxShadow:  `0 0 40px -12px rgba(212,168,67,0.3)`,
  background: "rgba(90,40,160,0.7)",
};

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  currentPlan:  Plan;
  onUpgrade?:   (plan: Plan) => void;
  onDowngrade?: (plan: Plan) => void;
  className?:   string;
}

export default function PricingPlansCard({ currentPlan, onUpgrade, onDowngrade, className }: Props) {
  const [showTable, setShowTable] = useState(false);

  const planRank: Record<Plan, number> = { free: 0, starter: 1, creator: 2, studio: 3 };

  return (
    <div className={className} style={{ color: C.text, fontFamily: "inherit" }}>

      {/* ── Section heading ─────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>
          Plans &amp; Credits
        </h2>
        <p style={{ fontSize: 13, color: C.sub, marginTop: 4, marginBottom: 0 }}>
          All plans include unlimited scripts, captions, and briefs. Credits reset monthly.
        </p>
      </div>

      {/* ── Plan cards ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "stretch" }}>
        {PLANS.map(plan => {
          const isCurrent   = plan.id === currentPlan;
          const isHigher    = planRank[plan.id] > planRank[currentPlan];
          const isLower     = planRank[plan.id] < planRank[currentPlan];
          const cardStyle   = plan.highlight ? highlightCard : baseCard;

          return (
            <div key={plan.id} style={{ ...cardStyle, position: "relative" }}>

              {/* Current plan badge */}
              {isCurrent && (
                <div style={{
                  position:   "absolute",
                  top:        -12,
                  left:       "50%",
                  transform:  "translateX(-50%)",
                  background: C.gold,
                  color:      "#0D0010",
                  fontSize:   11,
                  fontWeight: 700,
                  padding:    "3px 12px",
                  borderRadius: 20,
                  letterSpacing: "0.08em",
                  whiteSpace: "nowrap",
                }}>
                  CURRENT PLAN
                </div>
              )}

              {/* Plan name + price */}
              <div>
                <div style={{ fontSize: 13, color: C.sub, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  {plan.name}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 4 }}>
                  <span style={{ fontSize: 32, fontWeight: 800, color: plan.highlight ? C.gold : C.purple }}>
                    {plan.price}
                  </span>
                  <span style={{ fontSize: 12, color: C.sub }}>{plan.priceNote}</span>
                </div>
                <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>
                  {plan.credits.toLocaleString()} credits/month
                </div>
              </div>

              {/* Feature list */}
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                {plan.features.map((f, i) => (
                  <li key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: C.text }}>
                    <span style={{ color: C.green, marginTop: 1, flexShrink: 0 }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              {/* Video label */}
              <div style={{
                background: C.muted,
                borderRadius: 8,
                padding:    "6px 10px",
                fontSize:   12,
                color:      C.sub,
              }}>
                🎬 {plan.videoLabel}
              </div>

              {/* CTA button */}
              {isCurrent ? (
                <div style={{
                  textAlign:  "center",
                  fontSize:   13,
                  color:      C.gold,
                  fontWeight: 600,
                  padding:    "10px 0",
                }}>
                  ✓ Active
                </div>
              ) : isHigher ? (
                <button
                  onClick={() => onUpgrade?.(plan.id)}
                  style={{
                    background:   `linear-gradient(135deg, ${C.gold}, #c8962a)`,
                    color:        "#0D0010",
                    border:       "none",
                    borderRadius: 12,
                    padding:      "11px 0",
                    fontSize:     14,
                    fontWeight:   700,
                    cursor:       "pointer",
                    width:        "100%",
                    letterSpacing: "0.02em",
                  }}
                >
                  Upgrade → {plan.name}
                </button>
              ) : isLower ? (
                <button
                  onClick={() => onDowngrade?.(plan.id)}
                  style={{
                    background:   "transparent",
                    color:        C.sub,
                    border:       `1px solid ${C.border}`,
                    borderRadius: 12,
                    padding:      "10px 0",
                    fontSize:     13,
                    fontWeight:   500,
                    cursor:       "pointer",
                    width:        "100%",
                  }}
                >
                  Downgrade
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* ── Credits per action table ─────────────────────────────────────────── */}
      <div style={{ marginTop: 32 }}>
        <button
          onClick={() => setShowTable(v => !v)}
          style={{
            background:   "none",
            border:       "none",
            color:        C.purple,
            fontSize:     14,
            fontWeight:   600,
            cursor:       "pointer",
            padding:      0,
            marginBottom: 12,
            display:      "flex",
            alignItems:   "center",
            gap:          6,
          }}
        >
          Credits per action {showTable ? "▲" : "▼"}
        </button>

        {showTable && (
          <div style={{
            background:   C.card,
            border:       `1px solid ${C.border}`,
            borderRadius: 16,
            overflow:     "hidden",
          }}>
            {CREDIT_ACTIONS.map((row, i) => (
              <div
                key={i}
                style={{
                  display:       "flex",
                  justifyContent: "space-between",
                  alignItems:    "center",
                  padding:       "11px 20px",
                  borderBottom:  i < CREDIT_ACTIONS.length - 1 ? `1px solid ${C.border}` : "none",
                  background:    i % 2 === 0 ? "transparent" : C.muted,
                }}
              >
                <span style={{ fontSize: 13, color: C.text }}>{row.label}</span>
                <span style={{
                  fontSize:   13,
                  fontWeight: 700,
                  color:      row.cost === "Free" ? C.green : C.gold,
                  minWidth:   52,
                  textAlign:  "right",
                }}>
                  {row.cost}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Top-up packs ────────────────────────────────────────────────────── */}
      <div style={{ marginTop: 32 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: C.text, margin: "0 0 4px" }}>
          Credit Top-Ups
        </h3>
        <p style={{ fontSize: 12, color: C.sub, margin: "0 0 16px" }}>
          Never expire. Stack on top of your monthly credits.
        </p>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {TOP_UP_PACKS.map(pack => (
            <div
              key={pack.id}
              style={{
                ...baseCard,
                padding:   "18px 20px",
                gap:       8,
                minWidth:  160,
                maxWidth:  220,
                position:  "relative",
                opacity:   0.75,
              }}
            >
              {pack.badge && (
                <div style={{
                  position:   "absolute",
                  top:        -10,
                  right:      12,
                  background: pack.badge === "popular" ? C.purple : C.gold,
                  color:      "#0D0010",
                  fontSize:   10,
                  fontWeight: 700,
                  padding:    "2px 10px",
                  borderRadius: 20,
                  letterSpacing: "0.06em",
                }}>
                  {pack.badge === "popular" ? "POPULAR" : "BEST VALUE"}
                </div>
              )}
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{pack.name}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.purple }}>
                {pack.credits.toLocaleString()} <span style={{ fontSize: 13, fontWeight: 500, color: C.sub }}>credits</span>
              </div>
              <div style={{ fontSize: 13, color: C.gold, fontWeight: 600 }}>{pack.price}</div>
              <div style={{
                marginTop:  6,
                background: C.muted,
                borderRadius: 8,
                padding:    "7px 12px",
                fontSize:   12,
                color:      C.sub,
                textAlign:  "center",
                fontWeight: 600,
              }}>
                Coming Soon
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
