"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import AnimatedBackground from "@/components/AnimatedBackground";

const TONE_TAGS = ["professional", "bold", "witty", "minimal", "luxury", "playful"];
const STYLE_PRESETS = ["cinematic", "minimal", "bold", "editorial", "corporate"];

interface Product { name: string; description: string }

interface BrandForm {
  brand_name: string;
  logo_url: string;
  colors: string[];
  tone_of_voice: string;
  tone_tags: string[];
  products: Product[];
  style_preset: string;
  niche: string;
  target_audience: string;
  content_style_notes: string;
}

const EMPTY: BrandForm = {
  brand_name: "",
  logo_url: "",
  colors: ["", "", "", "", ""],
  tone_of_voice: "",
  tone_tags: [],
  products: [],
  style_preset: "",
  niche: "",
  target_audience: "",
  content_style_notes: "",
};

const CARD: React.CSSProperties = {
  background: "rgba(75,30,130,0.75)",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(207,164,47,0.2)",
  borderRadius: "16px",
  padding: "24px",
  marginBottom: "24px",
};

const LABEL: React.CSSProperties = {
  display: "block",
  fontSize: "13px",
  fontWeight: 600,
  color: "rgba(224,208,255,0.75)",
  marginBottom: "6px",
  letterSpacing: "0.04em",
  textTransform: "uppercase",
};

const INPUT: React.CSSProperties = {
  width: "100%",
  background: "rgba(45,10,62,0.6)",
  border: "1px solid rgba(207,164,47,0.25)",
  borderRadius: "8px",
  padding: "10px 14px",
  color: "#FFFFFF",
  fontSize: "14px",
  outline: "none",
  boxSizing: "border-box",
};

const SECTION_TITLE: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 700,
  color: "#FFFFFF",
  marginBottom: "16px",
  letterSpacing: "0.02em",
};

export default function BrandMemoryPage() {
  const router = useRouter();
  const [form, setForm] = useState<BrandForm>(EMPTY);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [savedMsg, setSavedMsg] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auth guard
  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace("/signin"); return; }

      try {
        const res = await fetch("/api/brand/get");
        if (res.ok) {
          const data = await res.json();
          if (data && Object.keys(data).length) {
            setForm({
              brand_name:          data.brand_name          ?? "",
              logo_url:            data.logo_url            ?? "",
              colors:              Array.isArray(data.colors) && data.colors.length
                                     ? [...data.colors, ...Array(5).fill("")].slice(0, 5)
                                     : ["", "", "", "", ""],
              tone_of_voice:       data.tone_of_voice       ?? "",
              tone_tags:           Array.isArray(data.tone_tags)    ? data.tone_tags    : [],
              products:            Array.isArray(data.products)     ? data.products     : [],
              style_preset:        data.style_preset        ?? "",
              niche:               data.niche               ?? "",
              target_audience:     data.target_audience     ?? "",
              content_style_notes: data.content_style_notes ?? "",
            });
          }
        }
      } catch { /* load failure is non-fatal */ }
      setLoading(false);
    })();
  }, [router]);

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingLogo(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const ext = file.name.split(".").pop() ?? "png";
      const path = `${session.user.id}/logo.${ext}`;
      const { error } = await supabase.storage.from("brand-assets").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("brand-assets").getPublicUrl(path);
      setForm((f) => ({ ...f, logo_url: publicUrl }));
    } catch (err) {
      console.error("[brand] logo upload failed:", err);
    } finally {
      setUploadingLogo(false);
    }
  }

  function setColor(i: number, val: string) {
    setForm((f) => {
      const next = [...f.colors];
      next[i] = val;
      return { ...f, colors: next };
    });
  }

  function toggleTag(tag: string) {
    setForm((f) => ({
      ...f,
      tone_tags: f.tone_tags.includes(tag)
        ? f.tone_tags.filter((t) => t !== tag)
        : [...f.tone_tags, tag],
    }));
  }

  function addProduct() {
    setForm((f) => ({ ...f, products: [...f.products, { name: "", description: "" }] }));
  }

  function removeProduct(i: number) {
    setForm((f) => ({ ...f, products: f.products.filter((_, idx) => idx !== i) }));
  }

  function setProduct(i: number, field: keyof Product, val: string) {
    setForm((f) => {
      const next = [...f.products];
      next[i] = { ...next[i], [field]: val };
      return { ...f, products: next };
    });
  }

  async function handleSave() {
    setSaving(true);
    setSavedMsg("");
    try {
      const payload = {
        ...form,
        colors: form.colors.filter((c) => c.trim()),
        products: form.products.filter((p) => p.name.trim()),
      };
      const res = await fetch("/api/brand/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Save failed");
      }
      setSavedMsg("Brand memory saved.");
      setTimeout(() => setSavedMsg(""), 3000);
    } catch (err) {
      setSavedMsg(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ position: "relative", background: "transparent" }}>
      <AnimatedBackground />
      <div style={{ position: "relative", zIndex: 1 }}>
        <main className="max-w-3xl mx-auto px-6 py-8">
          <div style={{
            fontSize: "1.5rem", fontWeight: 700, letterSpacing: "0.1em",
            textTransform: "uppercase",
            background: "linear-gradient(105deg,#CFA42F,#F7D96B)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
            backgroundClip: "text", marginBottom: "8px",
          }}>
            Brand Memory
          </div>
          <p style={{ color: "rgba(224,208,255,0.65)", fontSize: "14px", marginBottom: "32px" }}>
            Every AI generation will be aligned to your brand identity.
          </p>

          {loading ? (
            <div style={{ color: "rgba(224,208,255,0.5)", textAlign: "center", padding: "60px 0" }}>
              Loading…
            </div>
          ) : (
            <>
              {/* Workspace */}
              <div style={CARD}>
                <div style={SECTION_TITLE}>Workspace</div>
                <div style={{ marginBottom: "16px" }}>
                  <label style={LABEL}>Workspace / Brand Name</label>
                  <input
                    style={INPUT}
                    value={form.brand_name}
                    placeholder="e.g. Omnyra Studio"
                    onChange={(e) => setForm((f) => ({ ...f, brand_name: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={LABEL}>Industry / Niche</label>
                  <input
                    style={INPUT}
                    value={form.niche}
                    placeholder="e.g. Beauty & Skincare"
                    onChange={(e) => setForm((f) => ({ ...f, niche: e.target.value }))}
                  />
                </div>
              </div>

              {/* Logo */}
              <div style={CARD}>
                <div style={SECTION_TITLE}>Logo</div>
                <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
                  {form.logo_url && (
                    <img
                      src={form.logo_url}
                      alt="Brand logo"
                      style={{ width: 80, height: 80, objectFit: "contain", borderRadius: "8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(207,164,47,0.2)" }}
                    />
                  )}
                  <input type="file" accept="image/*" ref={fileInputRef} style={{ display: "none" }} onChange={handleLogoUpload} />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingLogo}
                    style={{
                      padding: "10px 20px", borderRadius: "8px",
                      background: "rgba(207,164,47,0.12)", border: "1px solid rgba(207,164,47,0.35)",
                      color: "#CFA42F", fontSize: "13px", fontWeight: 600, cursor: "pointer",
                    }}
                  >
                    {uploadingLogo ? "Uploading…" : form.logo_url ? "Replace Logo" : "Upload Logo"}
                  </button>
                  {form.logo_url && (
                    <input
                      style={{ ...INPUT, flex: 1, minWidth: "180px" }}
                      value={form.logo_url}
                      placeholder="Logo URL"
                      onChange={(e) => setForm((f) => ({ ...f, logo_url: e.target.value }))}
                    />
                  )}
                </div>
              </div>

              {/* Colors */}
              <div style={CARD}>
                <div style={SECTION_TITLE}>Brand Colors</div>
                <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                  {form.colors.map((c, i) => (
                    <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                      <div style={{ position: "relative" }}>
                        <input
                          type="color"
                          value={c || "#CFA42F"}
                          onChange={(e) => setColor(i, e.target.value)}
                          style={{
                            width: "48px", height: "48px", borderRadius: "8px", border: "none",
                            cursor: "pointer", padding: 0, background: "transparent",
                          }}
                        />
                        {c && (
                          <div style={{
                            width: "48px", height: "48px", borderRadius: "8px",
                            background: c, position: "absolute", top: 0, left: 0,
                            border: "2px solid rgba(207,164,47,0.4)", pointerEvents: "none",
                          }} />
                        )}
                      </div>
                      <input
                        style={{
                          width: "64px", background: "rgba(45,10,62,0.6)",
                          border: "1px solid rgba(207,164,47,0.2)", borderRadius: "6px",
                          padding: "4px 6px", color: "#fff", fontSize: "11px", textAlign: "center",
                        }}
                        value={c}
                        placeholder="#RRGGBB"
                        maxLength={7}
                        onChange={(e) => setColor(i, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Tone */}
              <div style={CARD}>
                <div style={SECTION_TITLE}>Tone &amp; Voice</div>
                <div style={{ marginBottom: "16px" }}>
                  <label style={LABEL}>Tone Description</label>
                  <textarea
                    style={{ ...INPUT, minHeight: "80px", resize: "vertical" }}
                    value={form.tone_of_voice}
                    placeholder="Describe your brand voice… e.g. 'Confident, aspirational, never corporate. Speaks to the high-achiever.'"
                    onChange={(e) => setForm((f) => ({ ...f, tone_of_voice: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={LABEL}>Voice Tags</label>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    {TONE_TAGS.map((tag) => (
                      <button
                        key={tag}
                        onClick={() => toggleTag(tag)}
                        style={{
                          padding: "6px 14px", borderRadius: "9999px", fontSize: "13px",
                          fontWeight: 600, cursor: "pointer", transition: "all 0.15s",
                          background: form.tone_tags.includes(tag)
                            ? "rgba(207,164,47,0.25)" : "rgba(45,10,62,0.6)",
                          border: form.tone_tags.includes(tag)
                            ? "1px solid rgba(207,164,47,0.7)" : "1px solid rgba(207,164,47,0.2)",
                          color: form.tone_tags.includes(tag) ? "#CFA42F" : "rgba(255,255,255,0.6)",
                        }}
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Products */}
              <div style={CARD}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                  <div style={SECTION_TITLE}>Products &amp; Services</div>
                  <button
                    onClick={addProduct}
                    style={{
                      padding: "6px 14px", borderRadius: "8px", fontSize: "13px",
                      fontWeight: 600, cursor: "pointer",
                      background: "rgba(207,164,47,0.12)", border: "1px solid rgba(207,164,47,0.35)",
                      color: "#CFA42F",
                    }}
                  >
                    + Add
                  </button>
                </div>
                {form.products.length === 0 && (
                  <p style={{ color: "rgba(224,208,255,0.4)", fontSize: "13px" }}>
                    No products yet. Add one so AI can mention them in content.
                  </p>
                )}
                {form.products.map((p, i) => (
                  <div key={i} style={{ display: "flex", gap: "10px", marginBottom: "12px", alignItems: "flex-start" }}>
                    <div style={{ flex: "0 0 160px" }}>
                      <input
                        style={INPUT}
                        placeholder="Product name"
                        value={p.name}
                        onChange={(e) => setProduct(i, "name", e.target.value)}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <input
                        style={INPUT}
                        placeholder="Short description"
                        value={p.description}
                        onChange={(e) => setProduct(i, "description", e.target.value)}
                      />
                    </div>
                    <button
                      onClick={() => removeProduct(i)}
                      style={{
                        padding: "10px 12px", borderRadius: "8px", fontSize: "13px",
                        background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)",
                        color: "#f87171", cursor: "pointer", flexShrink: 0,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>

              {/* Style & Audience */}
              <div style={CARD}>
                <div style={SECTION_TITLE}>Content Style</div>
                <div style={{ marginBottom: "16px" }}>
                  <label style={LABEL}>Style Preset</label>
                  <select
                    style={{ ...INPUT, appearance: "none" as const }}
                    value={form.style_preset}
                    onChange={(e) => setForm((f) => ({ ...f, style_preset: e.target.value }))}
                  >
                    <option value="">— Select preset —</option>
                    {STYLE_PRESETS.map((p) => (
                      <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div style={{ marginBottom: "16px" }}>
                  <label style={LABEL}>Target Audience</label>
                  <input
                    style={INPUT}
                    value={form.target_audience}
                    placeholder="e.g. Women 25-40 interested in wellness"
                    onChange={(e) => setForm((f) => ({ ...f, target_audience: e.target.value }))}
                  />
                </div>
                <div>
                  <label style={LABEL}>Content Style Notes</label>
                  <textarea
                    style={{ ...INPUT, minHeight: "72px", resize: "vertical" }}
                    value={form.content_style_notes}
                    placeholder="Additional style guidelines, dos and don'ts…"
                    onChange={(e) => setForm((f) => ({ ...f, content_style_notes: e.target.value }))}
                  />
                </div>
              </div>

              {/* Save */}
              <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "60px" }}>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  style={{
                    padding: "12px 32px", borderRadius: "9999px", fontSize: "15px", fontWeight: 700,
                    cursor: saving ? "not-allowed" : "pointer", letterSpacing: "0.03em",
                    background: saving
                      ? "rgba(207,164,47,0.3)"
                      : "linear-gradient(105deg, #5A3400 0%, #9A7010 20%, #CFA42F 42%, #E8C84A 50%, #CFA42F 58%, #9A7010 80%, #5A3400 100%)",
                    backgroundSize: "200% auto",
                    animation: saving ? "none" : "metalShimmer 3s linear infinite",
                    color: saving ? "rgba(255,255,255,0.5)" : "#0D0010",
                    border: "none",
                    boxShadow: saving ? "none" : "0 0 24px rgba(207,164,47,0.35)",
                  }}
                >
                  {saving ? "Saving…" : "Save Brand Memory"}
                </button>
                {savedMsg && (
                  <span style={{
                    fontSize: "13px",
                    color: savedMsg.startsWith("Error") ? "#f87171" : "#4ECB8C",
                    fontWeight: 600,
                  }}>
                    {savedMsg}
                  </span>
                )}
              </div>
            </>
          )}
        </main>
      </div>
      <style>{`@keyframes metalShimmer { 0% { background-position: 0% 50% } 100% { background-position: 200% 50% } }`}</style>
    </div>
  );
}
