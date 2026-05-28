"use client";
import { useEffect, useRef, useState } from "react";

export const NICHES = [
  "Beauty & Skincare",
  "Fitness & Wellness",
  "Finance & Investing",
  "Productivity & Tech",
  "Food & Cooking",
  "Fashion & Style",
  "Health & Nutrition",
  "Travel & Lifestyle",
  "Gaming",
  "Education",
  "Pets & Animals",
  "Parenting & Family",
  "Business & Entrepreneurship",
  "Relationships",
  "Friendship",
  "Entertainment & Comedy",
  "Real Estate",
  "Spirituality & Mindfulness",
  "Sports",
  "E-commerce & Dropshipping",
  "SaaS & Software",
  "Psychology & Mental Health",
  "Teens & Youth Culture",
  "Animation",
  "Motion Content",
  "History",
  "True Crime",
  "News & Current Affairs",
  "Other",
];

const INPUT_BASE = {
  width: "100%",
  background: "#0D0010",
  border: "1px solid rgba(204,171,175,0.25)",
  borderRadius: 12,
  padding: "12px 16px",
  color: "#C084FC",
  fontSize: 14,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.2s",
};

const LABEL_S = {
  color: "#BBA8C8",
  fontSize: 13,
  fontWeight: 500,
  marginBottom: 6,
  display: "block",
};

const OPT_S = { color: "#8A7D92", fontSize: 12, fontWeight: 400 };

/**
 * @param {{
 *   values: { niche?: string, targetAudience?: string, pastWins?: string, competitors?: string, uniqueAngle?: string },
 *   onChange: (field: string, value: string) => void,
 *   showNiche?: boolean
 * }} props
 */
export default function BrandContextFields({ values, onChange, showNiche = true }) {
  const [nicheOpen, setNicheOpen] = useState(false);
  const [nicheSearch, setNicheSearch] = useState("");
  const nicheRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (nicheRef.current && !nicheRef.current.contains(e.target)) {
        setNicheOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const filteredNiches = NICHES.filter((n) =>
    n.toLowerCase().includes((nicheSearch || "").toLowerCase())
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {showNiche && (
        <div ref={nicheRef} style={{ position: "relative" }}>
          <label style={LABEL_S}>Niche / Industry</label>
          <div
            onClick={() => setNicheOpen((o) => !o)}
            style={{
              ...INPUT_BASE,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              cursor: "pointer",
              color: values.niche ? "#C084FC" : "#8A7D92",
            }}
          >
            <span>{values.niche || "Select your niche..."}</span>
            <span style={{ fontSize: 10, opacity: 0.6 }}>{nicheOpen ? "▲" : "▼"}</span>
          </div>

          {nicheOpen && (
            <div
              style={{
                position: "absolute",
                top: "calc(100% + 4px)",
                left: 0,
                right: 0,
                background: "#0D0010",
                border: "1px solid rgba(204,171,175,0.25)",
                borderRadius: 12,
                zIndex: 50,
                maxHeight: 280,
                overflow: "hidden",
                display: "flex",
                flexDirection: "column",
                boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
              }}
            >
              <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(204,171,175,0.12)" }}>
                <input
                  autoFocus
                  placeholder="Search niches..."
                  value={nicheSearch}
                  onChange={(e) => setNicheSearch(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    width: "100%",
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(204,171,175,0.2)",
                    borderRadius: 8,
                    padding: "8px 12px",
                    color: "#C084FC",
                    fontSize: 13,
                    fontFamily: "inherit",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div style={{ overflowY: "auto", flex: 1 }}>
                {filteredNiches.map((n) => (
                  <div
                    key={n}
                    onClick={() => {
                      onChange("niche", n);
                      setNicheSearch("");
                      setNicheOpen(false);
                    }}
                    style={{
                      padding: "10px 16px",
                      color: values.niche === n ? "#D4A843" : "#BBA8C8",
                      fontSize: 14,
                      cursor: "pointer",
                      background: values.niche === n ? "rgba(212,168,67,0.08)" : "transparent",
                      transition: "background 0.15s",
                      borderBottom: "1px solid rgba(255,255,255,0.04)",
                    }}
                  >
                    {n}
                  </div>
                ))}
                {filteredNiches.length === 0 && (
                  <div style={{ padding: "14px 16px", color: "#8A7D92", fontSize: 13 }}>
                    No match — try &quot;Other&quot;
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <label style={LABEL_S}>
          Target Audience <span style={OPT_S}>(optional)</span>
        </label>
        <input
          type="text"
          value={values.targetAudience || ""}
          onChange={(e) => onChange("targetAudience", e.target.value)}
          placeholder="e.g. Women 25–34, budget-conscious, scroll TikTok at night"
          style={INPUT_BASE}
        />
      </div>

      <div>
        <label style={LABEL_S}>
          Past Wins <span style={OPT_S}>(optional)</span>
        </label>
        <textarea
          rows={2}
          value={values.pastWins || ""}
          onChange={(e) => onChange("pastWins", e.target.value)}
          placeholder="e.g. My last skincare video hit 200K — hook was a bold claim in the first second"
          style={{ ...INPUT_BASE, resize: "vertical" }}
        />
      </div>

      <div>
        <label style={LABEL_S}>
          Competitors <span style={OPT_S}>(optional)</span>
        </label>
        <input
          type="text"
          value={values.competitors || ""}
          onChange={(e) => onChange("competitors", e.target.value)}
          placeholder="e.g. @glowrecipe, @cerave, @paulaschoice"
          style={INPUT_BASE}
        />
      </div>

      <div>
        <label style={LABEL_S}>
          Unique Angle <span style={OPT_S}>(optional)</span>
        </label>
        <textarea
          rows={2}
          value={values.uniqueAngle || ""}
          onChange={(e) => onChange("uniqueAngle", e.target.value)}
          placeholder="What makes your product, story, or brand different from everyone else"
          style={{ ...INPUT_BASE, resize: "vertical" }}
        />
      </div>
    </div>
  );
}
