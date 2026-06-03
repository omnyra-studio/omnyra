"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrandProfile, saveBrandProfile } from "@/lib/brand";
import AnimatedBackground from "@/components/AnimatedBackground";
import { supabase } from "@/lib/supabase";

const PAGE_LOAD_TIME = Date.now();

function timeAgo(iso, now) {
  if (!iso) return "";
  const diff = now - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

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
                  color: value === o ? "#F0C040" : "#C084FC",
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

export default function BrandSettings() {
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
  });
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [error, setError]           = useState("");
  const [usageLogs, setUsageLogs]   = useState([]);
  const [creditBal, setCreditBal]   = useState(null);
  const [usedMonth, setUsedMonth]   = useState(0);
  const [userPlan, setUserPlan]     = useState("free");

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
        }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Credit usage fetch
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) return;
      const uid = session.user.id;
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);

      Promise.all([
        supabase.from("usage_logs").select("*").eq("user_id", uid)
          .order("created_at", { ascending: false }).limit(20),
        supabase.from("credits").select("balance").eq("user_id", uid).single(),
        supabase.from("profiles").select("plan").eq("id", uid).single(),
        supabase.from("credit_transactions")
          .select("amount").eq("user_id", uid).eq("type", "debit")
          .gte("created_at", monthStart.toISOString()),
      ]).then(([logsRes, credRes, profRes, txRes]) => {
        setUsageLogs(logsRes.data ?? []);
        setCreditBal(credRes.data?.balance ?? null);
        setUserPlan((profRes.data?.plan || "free").toLowerCase());
        const used = (txRes.data ?? []).reduce((sum, r) => sum + Math.abs(r.amount || 0), 0);
        setUsedMonth(used);
      }).catch(() => {});
    });
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

  const ACTION_META = {
    script:  { icon: "📝", label: "Script / Caption", color: "#C084FC" },
    image:   { icon: "🖼️",  label: "Image",            color: "#60A5FA" },
    voice:   { icon: "🎙️", label: "Voice",             color: "#22D3EE" },
    video:   { icon: "🎬", label: "Video",             color: "#FB923C" },
    avatar:  { icon: "👤", label: "Avatar",            color: "#F0C040" },
  };

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

        {/* HEADER */}
        <div style={{ borderBottom: "1px solid rgba(207,164,47,0.15)", padding: "1rem 1.5rem", display: "flex", alignItems: "center", gap: 14, position: "sticky", top: 0, background: "rgba(45,10,62,0.75)", backdropFilter: "blur(16px)", zIndex: 40 }}>
          <span style={{ fontWeight: 700, fontSize: 20, background: "linear-gradient(90deg,#CFA42F,#E8B84B)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginRight: 4 }}>
            Omnyra
          </span>
          <button onClick={() => router.push("/dashboard")} style={{ background: "transparent", border: "none", color: "#aaa", cursor: "pointer", fontSize: 22, lineHeight: 1, padding: 0 }}>
            ←
          </button>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, letterSpacing: "-0.02em" }}>Brand Memory</h1>
            <p style={{ fontSize: 11, color: C.sub, margin: 0, marginTop: 2 }}>Auto-injects into every script, caption &amp; generation</p>
          </div>
          {brandActive && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 100, background: "rgba(207,164,47,0.1)", border: "1px solid rgba(207,164,47,0.3)", fontSize: 10, fontWeight: 600, color: "#F0C040", letterSpacing: "0.08em" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#F0C040", boxShadow: "0 0 6px rgba(212,168,67,0.6)", display: "inline-block" }} />
              ACTIVE
            </div>
          )}
        </div>

        {/* BODY */}
        <div style={{ maxWidth: 640, margin: "0 auto", padding: "1.5rem 1.5rem 6rem", display: "flex", flexDirection: "column", gap: 18 }}>

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
                placeholder='e.g. budget-conscious, scroll TikTok at night'
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
                        color: active ? "#F0C040" : C.sub,
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
                      color: active ? "#F0C040" : C.sub,
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

          {/* CREDIT USAGE */}
          <div id="usage" style={{ ...CARD, display: "flex", flexDirection: "column", gap: 14, padding: "1.25rem" }}>
            <div style={{ fontSize: 10, color: "#E879F9", textTransform: "uppercase", letterSpacing: "0.2em", fontWeight: 700 }}>Credit Usage</div>

            {/* Summary bar */}
            {creditBal !== null && (
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {[
                  { label: "Used This Month", value: usedMonth, color: "#FB923C" },
                  { label: "Credits Remaining", value: creditBal, color: "#F0C040" },
                  { label: "Plan", value: userPlan.charAt(0).toUpperCase() + userPlan.slice(1), color: "#C084FC", isText: true },
                ].map(item => (
                  <div key={item.label} style={{
                    flex: "1 1 120px",
                    background: "rgba(0,0,0,0.2)",
                    border: "1px solid rgba(207,164,47,0.15)",
                    borderRadius: 10,
                    padding: "10px 14px",
                  }}>
                    <div style={{ fontSize: 10, color: "#8A7D92", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 4 }}>{item.label}</div>
                    <div style={{ fontSize: item.isText ? 15 : 20, fontWeight: 700, color: item.color }}>{item.value}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Usage table */}
            {usageLogs.length === 0 ? (
              <p style={{ fontSize: 13, color: "#8A7D92", margin: 0, lineHeight: 1.6 }}>
                No credits used yet — start creating to see your history here.
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 360 }}>
                  <thead>
                    <tr>
                      {["Action", "Credits", "Date"].map(h => (
                        <th key={h} style={{ padding: "6px 8px", fontSize: 10, fontWeight: 700, color: "#8A7D92", textTransform: "uppercase", letterSpacing: "0.1em", textAlign: h === "Credits" ? "right" : "left", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {usageLogs.map((log, i) => {
                      const meta = ACTION_META[log.action_type] || { icon: "⚡", label: log.action_type, color: "#BBA8C8" };
                      return (
                        <tr key={log.id || i} style={{ borderTop: i > 0 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                          <td style={{ padding: "9px 8px", fontSize: 13, color: meta.color, display: "flex", alignItems: "center", gap: 6 }}>
                            <span>{meta.icon}</span>
                            <span>{meta.label}</span>
                          </td>
                          <td style={{ padding: "9px 8px", fontSize: 13, fontWeight: 700, color: "#F0C040", textAlign: "right", whiteSpace: "nowrap" }}>
                            {log.credits_used != null ? `${log.credits_used} cr` : log.estimated_cost_usd != null ? `~$${log.estimated_cost_usd}` : "—"}
                          </td>
                          <td style={{ padding: "9px 8px", fontSize: 12, color: "#8A7D92", textAlign: "left", whiteSpace: "nowrap" }}>
                            {timeAgo(log.created_at, PAGE_LOAD_TIME)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
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
