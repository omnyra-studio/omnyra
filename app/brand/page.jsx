"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrandProfile, saveBrandProfile } from "@/lib/brand";
import AnimatedBackground from "@/components/AnimatedBackground";

const C = { text: "#E8DEFF", sub: "#BBA8C8" };
const CARD = {
  background: "rgba(75,30,130,0.65)",
  backdropFilter: "blur(16px)",
  border: "1px solid rgba(207,164,47,0.25)",
  borderRadius: 16,
};

const TONES = [
  { id: "Professional",  emoji: "💼" },
  { id: "Casual",        emoji: "😊" },
  { id: "Funny",         emoji: "😂" },
  { id: "Inspirational", emoji: "✨" },
  { id: "Educational",   emoji: "📚" },
  { id: "Bold",          emoji: "🔥" },
  { id: "Luxurious",     emoji: "💎" },
];

const NICHES = [
  "Beauty & Skincare", "Fitness & Wellness", "Finance & Investing",
  "Productivity & Tech", "Food & Cooking", "Fashion & Style",
  "Health & Nutrition", "Travel & Lifestyle", "Gaming", "Education",
  "Pets & Animals", "Parenting & Family", "Business & Entrepreneurship",
  "Relationships", "Friendship", "Entertainment & Comedy", "Real Estate",
  "Spirituality & Mindfulness", "Sports", "E-commerce & Dropshipping",
  "SaaS & Software", "Psychology & Mental Health", "Teens & Youth Culture",
  "Animation", "Motion Content", "History", "True Crime",
  "News & Current Affairs", "Other",
];

const TARGET_AUDIENCES = [
  "Gen Z (13–24)", "Millennials (25–40)", "Gen X (41–56)",
  "Women 18–34", "Men 18–34", "Women 35–55", "Men 35–55",
  "Parents", "Students", "Entrepreneurs", "Small Business Owners",
  "Content Creators", "Fitness Enthusiasts", "Beauty Lovers",
  "Gamers", "Foodies", "Travellers", "Tech Enthusiasts",
  "Finance & Investing", "Health & Wellness", "Other",
];

const BRAND_VOICES = ["Casual", "Professional", "Edgy", "Educational", "Inspirational"];

const inp = {
  width: "100%",
  padding: "12px 16px",
  borderRadius: 12,
  border: "1px solid rgba(204,171,175,0.25)",
  background: "#0D0010",
  color: "#C084FC",
  fontSize: 14,
  fontFamily: "inherit",
  boxSizing: "border-box",
  outline: "none",
};

function Field({ label, hint, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <label style={{ fontSize: 10, color: "#BBA8C8", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600 }}>
          {label}
        </label>
        {hint && <span style={{ fontSize: 11, color: "#8A7D92" }}>{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function SearchSelect({ value, onChange, options, placeholder }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setSearch(""); }}
        style={{
          ...inp,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          textAlign: "left",
          color: value ? "#C084FC" : "#8A7D92",
          border: open ? "1px solid rgba(207,164,47,0.5)" : "1px solid rgba(204,171,175,0.25)",
        }}
      >
        <span>{value || placeholder}</span>
        <span style={{ fontSize: 10, opacity: 0.5 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 4px)",
          left: 0,
          right: 0,
          zIndex: 50,
          background: "#1a0030",
          border: "1px solid rgba(207,164,47,0.3)",
          borderRadius: 12,
          overflow: "hidden",
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}>
          <div style={{ padding: "8px 10px", borderBottom: "1px solid rgba(207,164,47,0.1)" }}>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              style={{ ...inp, padding: "8px 12px", border: "1px solid rgba(207,164,47,0.2)", borderRadius: 8 }}
            />
          </div>
          <div style={{ maxHeight: 200, overflowY: "auto" }}>
            {filtered.length === 0 ? (
              <div style={{ padding: "10px 16px", fontSize: 13, color: "#8A7D92" }}>No matches</div>
            ) : filtered.map(o => (
              <button
                key={o}
                type="button"
                onClick={() => { onChange(o); setOpen(false); setSearch(""); }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 16px",
                  fontSize: 13,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  background: value === o ? "rgba(207,164,47,0.12)" : "transparent",
                  border: "none",
                  color: value === o ? "#D4A843" : "#C084FC",
                  fontWeight: value === o ? 600 : 400,
                }}
              >
                {o}{value === o && " ✓"}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function BrandPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    brand_name: "",
    tagline: "",
    niche: "",
    target_audience: "",
    audience_detail: "",
    tone_of_voice: "",
    primary_color: "#8b5cf6",
    secondary_color: "",
    content_style_notes: "",
    brand_voice: "",
    competitors: "",
    tiktok_handle: "",
    instagram_handle: "",
    youtube_url: "",
    facebook_url: "",
    linkedin_url: "",
    twitter_handle: "",
    website_url: "",
    // Manual analytics
    avg_views: "",
    engagement_rate: "",
    best_posting_time: "",
    top_styles: "",
    analytics_notes: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState("");

  useEffect(() => {
    getBrandProfile()
      .then(p => {
        if (!p) return;
        const raw = p.target_audience || "";
        const parts = raw.split(" ||| ");
        const audienceSelect = TARGET_AUDIENCES.includes(parts[0]) ? parts[0] : "";
        const audienceDetail = audienceSelect ? (parts[1] || "") : raw;

        setForm(f => ({
          ...f,
          brand_name:          p.brand_name          || "",
          tagline:             p.tagline             || "",
          niche:               p.primary_niche || p.niche || "",
          target_audience:     audienceSelect,
          audience_detail:     audienceDetail,
          tone_of_voice:       p.tone_of_voice       || "",
          primary_color:       p.colors?.[0]         || "#8b5cf6",
          secondary_color:     p.colors?.[1]         || "",
          content_style_notes: p.content_style_notes || "",
          brand_voice:         p.brand_voice         || "",
          competitors:         p.competitors         || "",
          tiktok_handle:       p.tiktok_handle       || "",
          instagram_handle:    p.instagram_handle    || "",
          youtube_url:         p.youtube_url         || "",
          facebook_url:        p.facebook_url        || "",
          linkedin_url:        p.linkedin_url        || "",
          twitter_handle:      p.twitter_handle      || "",
          website_url:         p.website_url         || "",
          // Manual analytics
          avg_views:          p.manual_analytics?.avg_views        || "",
          engagement_rate:    p.manual_analytics?.engagement_rate  || "",
          best_posting_time:  p.manual_analytics?.best_posting_time || "",
          top_styles:         (p.manual_analytics?.top_styles || []).join(", "),
          analytics_notes:    p.manual_analytics?.analytics_notes  || "",
        }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const colors = [form.primary_color, form.secondary_color].filter(Boolean);
      const combinedAudience = [form.target_audience, form.audience_detail]
        .filter(Boolean)
        .join(" ||| ");

      await saveBrandProfile({
        brand_name:          form.brand_name          || null,
        tagline:             form.tagline             || null,
        niche:               form.niche               || null,
        primary_niche:       form.niche               || null,
        target_audience:     combinedAudience         || null,
        tone_of_voice:       form.tone_of_voice       || null,
        colors,
        content_style_notes: form.content_style_notes || null,
        brand_voice:         form.brand_voice         || null,
        competitors:         form.competitors         || null,
        tiktok_handle:       form.tiktok_handle       || null,
        instagram_handle:    form.instagram_handle    || null,
        youtube_url:         form.youtube_url         || null,
        facebook_url:        form.facebook_url        || null,
        linkedin_url:        form.linkedin_url        || null,
        twitter_handle:      form.twitter_handle      || null,
        website_url:         form.website_url         || null,
        manual_analytics: {
          avg_views:         form.avg_views          || undefined,
          engagement_rate:   form.engagement_rate    || undefined,
          best_posting_time: form.best_posting_time  || undefined,
          top_styles:        form.top_styles
            ? form.top_styles.split(",").map(s => s.trim()).filter(Boolean)
            : [],
          analytics_notes:   form.analytics_notes    || undefined,
        },
      });
      console.log("[BRAND_UPDATED] manual_analytics saved", { avg_views: form.avg_views, engagement_rate: form.engagement_rate });
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
    <div style={{ minHeight: "100vh", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 28, height: 28, borderRadius: "50%", border: "2px solid rgba(207,164,47,0.2)", borderTopColor: "#CFA42F", animation: "spin 1s linear infinite" }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "transparent", position: "relative", color: C.text }}>
      <AnimatedBackground />
      <div style={{ position: "relative", zIndex: 1 }}>

        {/* BODY */}
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "1.5rem 1.5rem 6rem", display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Page title */}
          <div style={{ paddingTop: 8 }}>
            <div className="page-title" style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", background: "linear-gradient(105deg,#CFA42F,#F7D96B)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
              Brand Memory
            </div>
          </div>

          {/* Info banner */}
          <div style={{ background: "rgba(232,121,249,0.06)", borderRadius: 12, padding: "12px 16px", border: "1px solid rgba(232,121,249,0.2)", fontSize: 13, color: "#BBA8C8", lineHeight: 1.5 }}>
            ✦ Everything saved here is automatically used when generating scripts, captions, and research — so your content always sounds like you.
          </div>

          {/* IDENTITY */}
          <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 14, padding: "1.25rem" }}>
            <div style={{ fontSize: 10, color: "#E879F9", textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700 }}>Identity</div>

            <Field label="Brand Name" hint="Required for injection">
              <input value={form.brand_name} onChange={set("brand_name")} placeholder="e.g. Omnyra AI" style={inp} />
            </Field>

            <Field label="Tagline">
              <input value={form.tagline} onChange={set("tagline")} placeholder="e.g. Create. Don't juggle." style={inp} />
            </Field>

            <Field label="Niche / Industry">
              <SearchSelect
                value={form.niche}
                onChange={v => setForm(f => ({ ...f, niche: v }))}
                options={NICHES}
                placeholder="Select your niche..."
              />
            </Field>

            <Field label="Target Audience">
              <SearchSelect
                value={form.target_audience}
                onChange={v => setForm(f => ({ ...f, target_audience: v }))}
                options={TARGET_AUDIENCES}
                placeholder="Select primary audience..."
              />
            </Field>

            <Field label="Add more detail" hint="optional">
              <input
                value={form.audience_detail}
                onChange={set("audience_detail")}
                placeholder="e.g. budget-conscious, scroll TikTok at night"
                style={inp}
              />
            </Field>

            <Field label="Brand Voice">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {BRAND_VOICES.map(v => {
                  const active = form.brand_voice === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setForm(f => ({ ...f, brand_voice: active ? "" : v }))}
                      style={{
                        padding: "8px 14px", borderRadius: 100, fontSize: 12, fontFamily: "inherit", cursor: "pointer",
                        background: active ? "rgba(207,164,47,0.15)" : "rgba(255,255,255,0.04)",
                        border: active ? "1px solid rgba(207,164,47,0.55)" : "1px solid rgba(207,164,47,0.15)",
                        color: active ? "#D4A843" : C.sub,
                        fontWeight: active ? 600 : 400,
                      }}
                    >
                      {v}{active && " ✓"}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Competitors" hint="optional">
              <input value={form.competitors} onChange={set("competitors")} placeholder="e.g. @glowrecipe, @cerave, Nike, Gymshark" style={inp} />
            </Field>
          </div>

          {/* TONE OF VOICE */}
          <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 14, padding: "1.25rem" }}>
            <div style={{ fontSize: 10, color: "#E879F9", textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700 }}>Tone of Voice</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {TONES.map(t => {
                const active = form.tone_of_voice === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, tone_of_voice: active ? "" : t.id }))}
                    style={{
                      padding: "8px 14px", borderRadius: 100, fontSize: 12, fontFamily: "inherit", cursor: "pointer",
                      background: active ? "rgba(207,164,47,0.15)" : "rgba(255,255,255,0.04)",
                      border: active ? "1px solid rgba(207,164,47,0.55)" : "1px solid rgba(207,164,47,0.15)",
                      color: active ? "#D4A843" : C.sub,
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

          {/* BRAND COLORS */}
          <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 14, padding: "1.25rem" }}>
            <div style={{ fontSize: 10, color: "#E879F9", textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700 }}>Brand Colors</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Primary">
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="color" value={form.primary_color} onChange={set("primary_color")}
                    style={{ width: 36, height: 36, padding: 2, borderRadius: 8, border: "1px solid rgba(207,164,47,0.25)", background: "#0D0010", cursor: "pointer" }} />
                  <input value={form.primary_color} onChange={set("primary_color")} placeholder="#8b5cf6" style={{ ...inp, flex: 1 }} />
                </div>
              </Field>
              <Field label="Secondary">
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="color" value={form.secondary_color || "#22d3ee"} onChange={set("secondary_color")}
                    style={{ width: 36, height: 36, padding: 2, borderRadius: 8, border: "1px solid rgba(207,164,47,0.25)", background: "#0D0010", cursor: "pointer" }} />
                  <input value={form.secondary_color} onChange={set("secondary_color")} placeholder="#22d3ee" style={{ ...inp, flex: 1 }} />
                </div>
              </Field>
            </div>
          </div>

          {/* CONTENT STYLE NOTES */}
          <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 14, padding: "1.25rem" }}>
            <div style={{ fontSize: 10, color: "#E879F9", textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700 }}>Content Style Notes</div>
            <textarea
              value={form.content_style_notes}
              onChange={set("content_style_notes")}
              rows={4}
              placeholder="e.g. Always end scripts with a question. Never use the word 'leverage'. Keep sentences under 15 words. Use metric units."
              style={{ ...inp, resize: "vertical", lineHeight: 1.6 }}
            />
          </div>

          {/* PERFORMANCE ANALYTICS */}
          <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 14, padding: "1.25rem" }}>
            <div style={{ fontSize: 10, color: "#E879F9", textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700 }}>Performance Analytics</div>
            <p style={{ fontSize: 12, color: "#BBA8C8", margin: 0, lineHeight: 1.5 }}>
              Help Omnyra understand what&apos;s working — this data shapes your scripts and content strategy.
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <Field label="Avg Views per Video" hint="optional">
                <input
                  value={form.avg_views}
                  onChange={set("avg_views")}
                  placeholder="e.g. 12000"
                  style={inp}
                  type="number"
                  min="0"
                />
              </Field>
              <Field label="Engagement Rate (%)" hint="optional">
                <input
                  value={form.engagement_rate}
                  onChange={set("engagement_rate")}
                  placeholder="e.g. 4.2"
                  style={inp}
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                />
              </Field>
            </div>

            <Field label="Best Posting Time" hint="optional">
              <input
                value={form.best_posting_time}
                onChange={set("best_posting_time")}
                placeholder="e.g. Weekdays 7–9 PM AEST"
                style={inp}
              />
            </Field>

            <Field label="Top Performing Styles" hint="comma-separated">
              <input
                value={form.top_styles}
                onChange={set("top_styles")}
                placeholder="e.g. Hook + Tutorial, Trending Sound, Day-in-the-life"
                style={inp}
              />
            </Field>

            <Field label="Analytics Notes" hint="optional">
              <textarea
                value={form.analytics_notes}
                onChange={set("analytics_notes")}
                rows={3}
                placeholder="e.g. Videos over 45s consistently underperform. Hooks with questions get 2x retention."
                style={{ ...inp, resize: "vertical", lineHeight: 1.6 }}
              />
            </Field>
          </div>

          {/* SOCIAL LINKS */}
          <div style={{ ...CARD, display: "flex", flexDirection: "column", gap: 14, padding: "1.25rem" }}>
            <div style={{ fontSize: 10, color: "#E879F9", textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700 }}>Social Links</div>
            <p style={{ fontSize: 12, color: "#BBA8C8", margin: 0, lineHeight: 1.5 }}>
              All optional — used to personalise content and auto-generate platform-specific CTAs.
            </p>

            {[
              { field: "tiktok_handle",    label: "TikTok",      placeholder: "@yourusername" },
              { field: "instagram_handle", label: "Instagram",   placeholder: "@yourusername" },
              { field: "twitter_handle",   label: "Twitter / X", placeholder: "@yourusername" },
            ].map(({ field, label, placeholder }) => (
              <Field key={field} label={label} hint="optional">
                <input value={form[field]} onChange={set(field)} placeholder={placeholder} style={inp} />
              </Field>
            ))}

            {[
              { field: "youtube_url",  label: "YouTube URL",  placeholder: "https://youtube.com/@channel" },
              { field: "facebook_url", label: "Facebook URL", placeholder: "https://facebook.com/page" },
              { field: "linkedin_url", label: "LinkedIn URL", placeholder: "https://linkedin.com/in/you" },
              { field: "website_url",  label: "Website URL",  placeholder: "https://yourbrand.com" },
            ].map(({ field, label, placeholder }) => (
              <Field key={field} label={label} hint="optional">
                <input value={form[field]} onChange={set(field)} placeholder={placeholder} style={inp} type="url" />
              </Field>
            ))}
          </div>

          {error && (
            <div style={{ background: "rgba(239,68,68,0.1)", border: "0.5px solid rgba(239,68,68,0.3)", borderRadius: 10, padding: "10px 14px", color: "#f87171", fontSize: 13 }}>
              {error}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            type="button"
            style={{
              padding: "15px", borderRadius: 12, fontWeight: 700, fontSize: 15,
              cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit",
              background: saved
                ? "rgba(78,203,140,0.15)"
                : saving
                  ? "rgba(255,255,255,0.05)"
                  : "linear-gradient(105deg, #5A3400, #9A7010, #CFA42F, #E8C84A, #CFA42F, #9A7010, #5A3400)",
              backgroundSize: !saved && !saving ? "200% auto" : undefined,
              animation: !saved && !saving ? "metalShimmer 3s linear infinite" : undefined,
              color: saved ? "#4ECB8C" : saving ? "#555" : "#0D0010",
              border: saved ? "1px solid rgba(78,203,140,0.35)" : "none",
              transition: "all 0.2s",
              boxShadow: !saved && !saving ? "0 0 20px rgba(207,164,47,0.25)" : undefined,
            }}
          >
            {saving ? "Saving..." : saved ? "✓ Brand Memory Saved!" : "Save Brand Profile →"}
          </button>

          <p style={{ fontSize: 11, color: C.sub, textAlign: "center", margin: 0 }}>
            Your brand profile is private and only used to improve your AI generations.
          </p>
        </div>
      </div>

      <style>{`
        @keyframes metalShimmer { 0% { background-position: 0% 50% } 100% { background-position: 200% 50% } }
      `}</style>
    </div>
  );
}
