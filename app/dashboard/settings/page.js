"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getBrandProfile, saveBrandProfile } from "@/lib/brand";

const C = { bg: "#0a0a0a", text: "#f5f3ff", sub: "rgba(245,243,255,0.45)", border: "#1e1e1e" };

const TONES = [
  { id: "Professional",  emoji: "💼" },
  { id: "Casual",        emoji: "😊" },
  { id: "Funny",         emoji: "😂" },
  { id: "Inspirational", emoji: "✨" },
  { id: "Educational",   emoji: "📚" },
  { id: "Bold",          emoji: "🔥" },
  { id: "Luxurious",     emoji: "💎" },
];

const inp = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: 12,
  border: "0.5px solid #2a2a2a",
  background: "#111",
  color: "#f5f3ff",
  fontSize: 14,
  fontFamily: "inherit",
  boxSizing: "border-box",
  outline: "none",
};

function Field({ label, hint, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <label style={{ fontSize: 10, color: C.sub, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600 }}>
          {label}
        </label>
        {hint && <span style={{ fontSize: 11, color: C.sub }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

export default function BrandSettings() {
  const router = useRouter();
  const [form, setForm] = useState({
    brand_name: "",
    tagline: "",
    niche: "",
    target_audience: "",
    tone_of_voice: "",
    primary_color: "#8b5cf6",
    secondary_color: "",
    content_style_notes: "",
  });
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [error, setError]       = useState("");

  useEffect(() => {
    getBrandProfile()
      .then(p => {
        if (p) {
          setForm({
            brand_name:          p.brand_name          || "",
            tagline:             p.tagline             || "",
            niche:               p.niche               || "",
            target_audience:     p.target_audience     || "",
            tone_of_voice:       p.tone_of_voice       || "",
            primary_color:       p.colors?.[0]         || "#8b5cf6",
            secondary_color:     p.colors?.[1]         || "",
            content_style_notes: p.content_style_notes || "",
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const colors = [form.primary_color, form.secondary_color].filter(Boolean);
      await saveBrandProfile({
        brand_name:          form.brand_name          || null,
        tagline:             form.tagline             || null,
        niche:               form.niche               || null,
        target_audience:     form.target_audience     || null,
        tone_of_voice:       form.tone_of_voice       || null,
        colors,
        content_style_notes: form.content_style_notes || null,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }));
  const brandActive = !!(form.brand_name || form.niche);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid #1e1e1e", borderTopColor: "#8b5cf6", animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text }}>

      {/* HEADER */}
      <div style={{ borderBottom: "0.5px solid #1a1a1a", padding: "1rem 1.5rem", display: "flex", alignItems: "center", gap: 14, position: "sticky", top: 0, background: C.bg, zIndex: 10 }}>
        <button onClick={() => router.push("/dashboard")} style={{ background: "transparent", border: "none", color: "#666", cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 0 }}>
          ←
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, letterSpacing: "-0.02em" }}>Brand Memory</h1>
          <p style={{ fontSize: 11, color: C.sub, margin: 0, marginTop: 2 }}>Auto-injects into every script, caption &amp; generation</p>
        </div>
        {brandActive && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 100, background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", fontSize: 10, fontWeight: 600, color: "#a78bfa", letterSpacing: "0.08em" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#a78bfa", boxShadow: "0 0 6px #8b5cf6", display: "inline-block" }} />
            ACTIVE
          </div>
        )}
      </div>

      {/* BODY */}
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "1.5rem 1.5rem 6rem", display: "flex", flexDirection: "column", gap: 18 }}>

        {/* Info banner */}
        <div style={{ background: "rgba(139,92,246,0.08)", borderRadius: 12, padding: "12px 16px", border: "0.5px solid rgba(139,92,246,0.25)", fontSize: 13, color: "#a78bfa", lineHeight: 1.5 }}>
          ✦ Everything saved here is automatically used when generating scripts, captions, and research — so your content always sounds like you.
        </div>

        {/* IDENTITY */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, background: "#0f0f0f", borderRadius: 16, padding: "1.25rem", border: "0.5px solid #1e1e1e" }}>
          <div style={{ fontSize: 10, color: C.sub, textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 700 }}>Identity</div>

          <Field label="Brand Name" hint="Required for injection">
            <input value={form.brand_name} onChange={set("brand_name")} placeholder="e.g. Omnyra AI" style={inp} />
          </Field>

          <Field label="Tagline">
            <input value={form.tagline} onChange={set("tagline")} placeholder='e.g. Create. Don&apos;t juggle.' style={inp} />
          </Field>

          <Field label="Niche / Industry">
            <input value={form.niche} onChange={set("niche")} placeholder="e.g. AI tools, fitness, real estate, e-commerce" style={inp} />
          </Field>

          <Field label="Target Audience">
            <input value={form.target_audience} onChange={set("target_audience")} placeholder="e.g. Entrepreneurs 25–40, content creators, side hustlers" style={inp} />
          </Field>
        </div>

        {/* TONE */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, background: "#0f0f0f", borderRadius: 16, padding: "1.25rem", border: "0.5px solid #1e1e1e" }}>
          <div style={{ fontSize: 10, color: C.sub, textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 700 }}>Tone of Voice</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {TONES.map(t => {
              const active = form.tone_of_voice === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setForm(f => ({ ...f, tone_of_voice: active ? "" : t.id }))}
                  style={{
                    padding: "8px 14px", borderRadius: 100, fontSize: 12, fontFamily: "inherit", cursor: "pointer",
                    background: active ? "linear-gradient(135deg,rgba(139,92,246,0.35),rgba(34,211,238,0.2))" : "rgba(255,255,255,0.04)",
                    border: active ? "1px solid rgba(139,92,246,0.55)" : "1px solid rgba(255,255,255,0.08)",
                    color: active ? "#fff" : C.sub,
                    fontWeight: active ? 600 : 400,
                    display: "flex", alignItems: "center", gap: 5,
                  }}
                >
                  <span>{t.emoji}</span>
                  <span>{t.id}</span>
                  {active && <span style={{ fontSize: 10, marginLeft: 2 }}>✓</span>}
                </button>
              );
            })}
          </div>
          <Field label="Or describe your tone">
            <input value={form.tone_of_voice} onChange={set("tone_of_voice")} placeholder="e.g. Bold, direct, educational but never corporate" style={inp} />
          </Field>
        </div>

        {/* VISUAL */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, background: "#0f0f0f", borderRadius: 16, padding: "1.25rem", border: "0.5px solid #1e1e1e" }}>
          <div style={{ fontSize: 10, color: C.sub, textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 700 }}>Brand Colors</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <Field label="Primary">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="color" value={form.primary_color} onChange={set("primary_color")}
                  style={{ width: 36, height: 36, padding: 2, borderRadius: 8, border: "0.5px solid #2a2a2a", background: "#111", cursor: "pointer" }} />
                <input value={form.primary_color} onChange={set("primary_color")} placeholder="#8b5cf6" style={{ ...inp, flex: 1 }} />
              </div>
            </Field>
            <Field label="Secondary">
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input type="color" value={form.secondary_color || "#22d3ee"} onChange={set("secondary_color")}
                  style={{ width: 36, height: 36, padding: 2, borderRadius: 8, border: "0.5px solid #2a2a2a", background: "#111", cursor: "pointer" }} />
                <input value={form.secondary_color} onChange={set("secondary_color")} placeholder="#22d3ee" style={{ ...inp, flex: 1 }} />
              </div>
            </Field>
          </div>
        </div>

        {/* CUSTOM INSTRUCTIONS */}
        <div style={{ display: "flex", flexDirection: "column", gap: 14, background: "#0f0f0f", borderRadius: 16, padding: "1.25rem", border: "0.5px solid #1e1e1e" }}>
          <div style={{ fontSize: 10, color: C.sub, textTransform: "uppercase", letterSpacing: "0.15em", fontWeight: 700 }}>Content Style Notes</div>
          <textarea
            value={form.content_style_notes}
            onChange={set("content_style_notes")}
            rows={4}
            placeholder="e.g. Always end scripts with a question. Never use the word 'leverage'. Keep sentences under 15 words. Use metric units."
            style={{ ...inp, resize: "vertical", lineHeight: 1.6 }}
          />
        </div>

        {/* ERROR */}
        {error && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "0.5px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "10px 14px", color: "#f87171", fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* SAVE */}
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            padding: "15px", borderRadius: 12, fontWeight: 700, fontSize: 15,
            border: "none", cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit",
            background: saved
              ? "rgba(34,197,94,0.2)"
              : saving
                ? "rgba(255,255,255,0.05)"
                : "linear-gradient(135deg, #8b5cf6, #22d3ee)",
            color: saved ? "#4ade80" : saving ? "#444" : "#fff",
            border: saved ? "0.5px solid rgba(34,197,94,0.35)" : "none",
            transition: "all 0.2s",
          }}
        >
          {saving ? "Saving..." : saved ? "✓ Brand Memory Saved!" : "Save Brand Profile →"}
        </button>

        <p style={{ fontSize: 11, color: C.sub, textAlign: "center", margin: 0 }}>
          Your brand profile is private and only used to improve your AI generations.
        </p>
      </div>
    </div>
  );
}
