"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// ── Types ──────────────────────────────────────────────────────────────────────

interface Character {
  id: string;
  name: string;
  core_prompt: string;
  visual_signature: string;
  neg_prompt: string;
  ref_frame_url: string | null;
  created_at: string;
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const CARD: React.CSSProperties = {
  background:    "rgba(75,30,130,0.65)",
  backdropFilter:"blur(12px)",
  border:        "1px solid rgba(207,164,47,0.2)",
  borderRadius:  16,
  padding:       "24px",
};

const LABEL: React.CSSProperties = {
  display:       "block",
  fontSize:      12,
  fontWeight:    600,
  color:         "rgba(224,208,255,0.7)",
  marginBottom:  6,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
};

const INPUT: React.CSSProperties = {
  width:        "100%",
  background:   "rgba(13,0,16,0.6)",
  border:       "1px solid rgba(207,164,47,0.25)",
  borderRadius:  10,
  padding:      "10px 14px",
  color:        "#FFFFFF",
  fontSize:     14,
  fontFamily:   "inherit",
  outline:      "none",
  boxSizing:    "border-box",
};

// ── Component ──────────────────────────────────────────────────────────────────

export default function CharactersPage() {
  const router  = useRouter();

  const [characters,  setCharacters]  = useState<Character[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);
  const [error,       setError]       = useState<string | null>(null);
  const [showForm,    setShowForm]    = useState(false);
  const [editingId,   setEditingId]   = useState<string | null>(null);

  const [form, setForm] = useState({
    name:             "",
    core_prompt:      "",
    visual_signature: "",
    neg_prompt:       "",
  });

  // Auth gate
  useEffect(() => {
    const sb = createClient();
    sb.auth.getSession().then(({ data: { session } }) => {
      if (!session) router.replace("/signin");
    });
  }, [router]);

  // Load characters
  async function loadCharacters() {
    setLoading(true);
    try {
      const res = await fetch("/api/characters");
      if (res.ok) {
        const data = await res.json() as { characters: Character[] };
        setCharacters(data.characters);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { setTimeout(() => { void loadCharacters(); }, 0); }, []);

  function resetForm() {
    setForm({ name: "", core_prompt: "", visual_signature: "", neg_prompt: "" });
    setEditingId(null);
    setShowForm(false);
    setError(null);
  }

  function startEdit(c: Character) {
    setForm({
      name:             c.name,
      core_prompt:      c.core_prompt,
      visual_signature: c.visual_signature,
      neg_prompt:       c.neg_prompt,
    });
    setEditingId(c.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSave() {
    if (!form.name.trim())        { setError("Name is required"); return; }
    if (!form.core_prompt.trim()) { setError("Core prompt is required"); return; }
    setSaving(true);
    setError(null);
    try {
      const url    = editingId ? `/api/characters/${editingId}` : "/api/characters";
      const method = editingId ? "PATCH" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      await loadCharacters();
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      await fetch(`/api/characters/${id}`, { method: "DELETE" });
      setCharacters(prev => prev.filter(c => c.id !== id));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div style={{ minHeight: "100vh", maxWidth: 720, margin: "0 auto", padding: "28px 24px 80px" }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: "#C084FC", margin: 0 }}>Characters</h1>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: "4px 0 0" }}>
            Reusable visual identities injected into every avatar scene prompt
          </p>
        </div>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setEditingId(null); setForm({ name: "", core_prompt: "", visual_signature: "", neg_prompt: "" }); }}
            style={{ background: "linear-gradient(135deg,#C9A84C,#FFD700)", border: "none", borderRadius: 9999, color: "#1a0a2e", padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
          >
            + New Character
          </button>
        )}
      </div>

      {/* Create / edit form */}
      {showForm && (
        <div style={{ ...CARD, marginBottom: 24, border: "1px solid rgba(207,164,47,0.45)" }}>
          <p style={{ fontSize: 14, fontWeight: 700, color: "#C9A84C", margin: "0 0 20px" }}>
            {editingId ? "Edit Character" : "New Character"}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <label style={LABEL}>Name *</label>
              <input
                style={INPUT}
                value={form.name}
                onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Sarah — Tech Founder"
              />
            </div>

            <div>
              <label style={LABEL}>Core Prompt * <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 400, textTransform: "none" }}>(injected into every scene)</span></label>
              <textarea
                rows={3}
                style={{ ...INPUT, resize: "vertical" }}
                value={form.core_prompt}
                onChange={e => setForm(p => ({ ...p, core_prompt: e.target.value }))}
                placeholder="professional woman in her 30s, confident expression, business casual attire, neutral background"
              />
              <p style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", margin: "5px 0 0" }}>
                Describe the character&apos;s appearance, clothing, and expression. This becomes the foundation of every Kling prompt.
              </p>
            </div>

            <div>
              <label style={LABEL}>Visual Signature <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 400, textTransform: "none" }}>(optional — fine details)</span></label>
              <input
                style={INPUT}
                value={form.visual_signature}
                onChange={e => setForm(p => ({ ...p, visual_signature: e.target.value }))}
                placeholder="dark curly hair, green eyes, small gold earrings"
              />
            </div>

            <div>
              <label style={LABEL}>Negative Prompt <span style={{ color: "rgba(255,255,255,0.3)", fontWeight: 400, textTransform: "none" }}>(optional — things to avoid)</span></label>
              <input
                style={INPUT}
                value={form.neg_prompt}
                onChange={e => setForm(p => ({ ...p, neg_prompt: e.target.value }))}
                placeholder="cartoon, anime, different hair color, glasses, hat"
              />
            </div>
          </div>

          {error && (
            <p style={{ fontSize: 13, color: "#FF6B6B", margin: "12px 0 0" }}>⚠ {error}</p>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              style={{ background: "linear-gradient(135deg,#C9A84C,#FFD700)", border: "none", borderRadius: 9999, color: "#1a0a2e", padding: "11px 24px", fontSize: 14, fontWeight: 700, cursor: saving ? "wait" : "pointer", fontFamily: "inherit", opacity: saving ? 0.7 : 1 }}
            >
              {saving ? "Saving..." : editingId ? "Save Changes" : "Create Character"}
            </button>
            <button
              onClick={resetForm}
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 9999, color: "rgba(255,255,255,0.7)", padding: "11px 20px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Character list */}
      {loading ? (
        <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13 }}>Loading...</p>
      ) : characters.length === 0 ? (
        <div style={{ ...CARD, textAlign: "center", padding: "48px 24px" }}>
          <p style={{ fontSize: 32, marginBottom: 12 }}>🎭</p>
          <p style={{ fontSize: 16, fontWeight: 600, color: "#C084FC", marginBottom: 8 }}>No characters yet</p>
          <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", marginBottom: 20, lineHeight: 1.6 }}>
            Create a character to lock a visual identity across all scenes in your avatar videos.
            Once generated, the first scene frame becomes the reference image for future runs.
          </p>
          <button
            onClick={() => setShowForm(true)}
            style={{ background: "linear-gradient(135deg,#C9A84C,#FFD700)", border: "none", borderRadius: 9999, color: "#1a0a2e", padding: "11px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
          >
            + Create First Character
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {characters.map(c => (
            <div key={c.id} style={CARD}>
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>

                {/* Reference frame thumbnail or placeholder */}
                <div style={{ flexShrink: 0, width: 64, height: 64, borderRadius: 10, overflow: "hidden", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {c.ref_frame_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.ref_frame_url} alt={c.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span style={{ fontSize: 24 }}>🎭</span>
                  )}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 16, fontWeight: 700, color: "#FFFFFF", margin: "0 0 4px" }}>{c.name}</p>
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", margin: "0 0 6px", lineHeight: 1.5, wordBreak: "break-word" }}>
                    {c.core_prompt}
                  </p>
                  {c.visual_signature && (
                    <p style={{ fontSize: 11, color: "rgba(192,132,252,0.7)", margin: 0 }}>+ {c.visual_signature}</p>
                  )}
                  {!c.ref_frame_url && (
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", margin: "6px 0 0" }}>
                      Reference frame auto-captures after first generation
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button
                    onClick={() => startEdit(c)}
                    style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, color: "rgba(255,255,255,0.7)", padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => void handleDelete(c.id)}
                    disabled={deletingId === c.id}
                    style={{ background: "rgba(255,80,80,0.12)", border: "1px solid rgba(255,80,80,0.25)", borderRadius: 8, color: "#FF6B6B", padding: "6px 14px", fontSize: 12, cursor: "pointer", fontFamily: "inherit", opacity: deletingId === c.id ? 0.5 : 1 }}
                  >
                    {deletingId === c.id ? "..." : "Delete"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Back link */}
      <button
        onClick={() => router.push("/create")}
        style={{ marginTop: 32, background: "none", border: "none", color: "rgba(255,255,255,0.4)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
      >
        ← Back to Create
      </button>
    </div>
  );
}
