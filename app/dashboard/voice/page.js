"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import AnimatedBackground from "@/components/AnimatedBackground";

const C = { bg: "#070710", text: "#f5f3ff", sub: "rgba(245,243,255,0.55)", violet: "#8b5cf6" };

const GENDER_FILTERS = ["All", "male", "female"];
const USE_CASE_FILTERS = ["All", "narration", "conversational", "social media", "news", "video games"];

function tag(label) {
  return (
    <span style={{ display: "inline-block", padding: "2px 7px", borderRadius: 6, background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.25)", fontSize: 10, color: "#a78bfa", fontWeight: 600, textTransform: "capitalize", letterSpacing: "0.03em" }}>
      {label}
    </span>
  );
}

export default function VoicePage() {
  const router = useRouter();
  const [voices, setVoices] = useState([]);
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [voicesError, setVoicesError] = useState("");
  const [search, setSearch] = useState("");
  const [genderFilter, setGenderFilter] = useState("All");
  const [useCaseFilter, setUseCaseFilter] = useState("All");
  const [voiceId, setVoiceId] = useState("");
  const [text, setText] = useState("");
  const [generating, setGenerating] = useState(false);
  const [audioUrl, setAudioUrl] = useState(null);
  const [error, setError] = useState("");
  const [playingId, setPlayingId] = useState(null);
  const audioRef = useRef(null);

  useEffect(() => {
    async function fetchVoices() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch("/api/voices", {
          headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load voices");
        setVoices(data.voices ?? []);
        if (data.voices?.length) setVoiceId(data.voices[0].id);
      } catch (err) {
        setVoicesError(err.message);
      } finally {
        setLoadingVoices(false);
      }
    }
    fetchVoices();
  }, []);

  function playPreview(voice) {
    if (!voice.previewUrl) return;
    if (playingId === voice.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const a = new Audio(voice.previewUrl);
    audioRef.current = a;
    a.play();
    setPlayingId(voice.id);
    a.onended = () => setPlayingId(null);
    a.onerror = () => setPlayingId(null);
  }

  const filtered = voices.filter(v => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      v.name.toLowerCase().includes(q) ||
      v.accent.toLowerCase().includes(q) ||
      v.description.toLowerCase().includes(q) ||
      v.useCase.toLowerCase().includes(q);
    const matchGender = genderFilter === "All" || v.gender === genderFilter;
    const matchUseCase = useCaseFilter === "All" || v.useCase.toLowerCase().includes(useCaseFilter.toLowerCase());
    return matchSearch && matchGender && matchUseCase;
  });

  const selected = voices.find(v => v.id === voiceId);

  async function generate() {
    if (!text.trim() || !voiceId) return;
    setGenerating(true); setError(""); setAudioUrl(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session && { Authorization: `Bearer ${session.access_token}` }),
        },
        body: JSON.stringify({ text, voiceId }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Voice generation failed");
      }
      const remaining = res.headers.get("X-Credits-Remaining");
      if (remaining) setCredits(remaining);
      const blob = await res.blob();
      setAudioUrl(URL.createObjectURL(blob));
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  }

  const inp = {
    padding: "9px 14px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.04)", color: C.text, fontSize: 14, fontFamily: "inherit",
    outline: "none",
  };

  return (
    <main style={{ minHeight: "100vh", background: "transparent", position: "relative", color: C.text, fontFamily: '"Instrument Sans","Inter",-apple-system,sans-serif', padding: "0 0 80px" }}>
      <AnimatedBackground />
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ borderBottom: "1px solid rgba(207,164,47,0.15)", padding: "12px 20px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, background: "rgba(45,10,62,0.75)", backdropFilter: "blur(16px)", zIndex: 40 }}>
          <span style={{ fontWeight: 700, fontSize: 18, background: "linear-gradient(90deg,#CFA42F,#E8B84B)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Omnyra</span>
          <button onClick={() => router.push("/dashboard")} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "6px 10px", color: C.text, cursor: "pointer", fontSize: 16 }}>←</button>
          <span style={{ fontWeight: 700, fontSize: 16 }}>AI Voice Library</span>
        </div>
        <div style={{ maxWidth: 520, margin: "0 auto", padding: "16px 20px 0" }}>


        {/* Selected voice pill */}
        {selected && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 12, background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.3)", marginBottom: 16 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: C.violet, flexShrink: 0 }} />
            <span style={{ fontWeight: 700, fontSize: 14 }}>{selected.name}</span>
            <span style={{ fontSize: 12, color: C.sub }}>{selected.gender} · {selected.accent}</span>
            {selected.description && tag(selected.description)}
            <button onClick={() => playPreview(selected)}
              style={{ marginLeft: "auto", background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.4)", borderRadius: 8, padding: "4px 10px", color: "#a78bfa", cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: 600 }}>
              {playingId === selected.id ? "■ Stop" : "▶ Preview"}
            </button>
          </div>
        )}

        {/* Search */}
        <div style={{ marginBottom: 12 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search voices by name, accent, style..."
            style={{ ...inp, width: "100%", boxSizing: "border-box" }}
          />
        </div>

        {/* Gender filter */}
        <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
          {GENDER_FILTERS.map(f => (
            <button key={f} onClick={() => setGenderFilter(f)}
              style={{ padding: "5px 12px", borderRadius: 20, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600,
                background: genderFilter === f ? C.violet : "rgba(255,255,255,0.05)",
                border: genderFilter === f ? "1px solid transparent" : "1px solid rgba(255,255,255,0.1)",
                color: genderFilter === f ? "#fff" : C.sub }}>
              {f === "All" ? "All" : f === "male" ? "Male" : "Female"}
            </button>
          ))}
        </div>

        {/* Use case filter */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
          {USE_CASE_FILTERS.map(f => (
            <button key={f} onClick={() => setUseCaseFilter(f)}
              style={{ padding: "5px 12px", borderRadius: 20, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: 600, textTransform: "capitalize",
                background: useCaseFilter === f ? "rgba(34,211,238,0.2)" : "rgba(255,255,255,0.05)",
                border: useCaseFilter === f ? "1px solid rgba(34,211,238,0.5)" : "1px solid rgba(255,255,255,0.1)",
                color: useCaseFilter === f ? "#22d3ee" : C.sub }}>
              {f === "All" ? "All Uses" : f}
            </button>
          ))}
        </div>

        {/* Voice grid */}
        {loadingVoices && (
          <div style={{ textAlign: "center", padding: "40px 0", color: C.sub, fontSize: 14 }}>Loading voice library...</div>
        )}
        {voicesError && (
          <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 10, padding: "10px 14px", color: "#f87171", fontSize: 13, marginBottom: 16 }}>{voicesError}</div>
        )}
        {!loadingVoices && !voicesError && (
          <>
            <div style={{ fontSize: 11, color: C.sub, marginBottom: 8, fontWeight: 600 }}>{filtered.length} voices</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 360, overflowY: "auto", marginBottom: 20, paddingRight: 4 }}>
              {filtered.map(v => (
                <div key={v.id}
                  onClick={() => setVoiceId(v.id)}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", borderRadius: 12, cursor: "pointer",
                    background: voiceId === v.id ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.03)",
                    border: voiceId === v.id ? "1px solid rgba(139,92,246,0.5)" : "1px solid rgba(255,255,255,0.07)",
                    transition: "background 0.1s" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>{v.name}</span>
                      {v.accent && v.accent !== "unknown" && tag(v.accent)}
                      {v.description && tag(v.description)}
                    </div>
                    <div style={{ fontSize: 11, color: C.sub, marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {v.gender !== "unknown" && <span style={{ textTransform: "capitalize" }}>{v.gender}</span>}
                      {v.age !== "unknown" && <span style={{ textTransform: "capitalize" }}>{v.age}</span>}
                      {v.useCase && <span style={{ textTransform: "capitalize", color: "#6d28d9" }}>{v.useCase}</span>}
                    </div>
                  </div>
                  {v.previewUrl && (
                    <button
                      onClick={e => { e.stopPropagation(); playPreview(v); }}
                      style={{ flexShrink: 0, padding: "5px 10px", borderRadius: 8, border: "1px solid rgba(139,92,246,0.3)",
                        background: playingId === v.id ? "rgba(139,92,246,0.3)" : "rgba(139,92,246,0.1)",
                        color: "#a78bfa", cursor: "pointer", fontSize: 11, fontFamily: "inherit", fontWeight: 600 }}>
                      {playingId === v.id ? "■" : "▶"}
                    </button>
                  )}
                </div>
              ))}
              {filtered.length === 0 && (
                <div style={{ textAlign: "center", padding: "32px 0", color: C.sub, fontSize: 14 }}>No voices match your filters</div>
              )}
            </div>
          </>
        )}

        {/* Script */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: C.sub, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 600, marginBottom: 8 }}>Your Script</div>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Enter your script here..."
            rows={5}
            style={{ width: "100%", padding: "14px 16px", borderRadius: 14, border: "1px solid rgba(255,255,255,0.1)",
              background: "rgba(255,255,255,0.04)", color: C.text, fontSize: 14, fontFamily: "inherit",
              resize: "vertical", outline: "none", boxSizing: "border-box" }}
          />
          <div style={{ fontSize: 11, color: C.sub, marginTop: 4, textAlign: "right" }}>
            {text.length} chars
          </div>
        </div>

        {error && (
          <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 10, padding: "10px 14px", marginBottom: 12, color: "#f87171", fontSize: 13 }}>
            {error}
          </div>
        )}

        <button onClick={generate} disabled={generating || !text.trim() || !voiceId}
          style={{ width: "100%", padding: "16px", borderRadius: 14, border: "none", fontFamily: "inherit",
            cursor: generating || !text.trim() || !voiceId ? "not-allowed" : "pointer",
            background: generating || !text.trim() || !voiceId ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg,#8b5cf6,#6d28d9)",
            color: generating || !text.trim() || !voiceId ? C.sub : "#fff", fontWeight: 700, fontSize: 15 }}>
          {generating ? "Generating voice..." : `Generate with ${selected?.name ?? "selected voice"} ✦`}
        </button>

        {audioUrl && (
          <div style={{ marginTop: 20, padding: "20px", borderRadius: 16, background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.3)" }}>
            <div style={{ fontSize: 12, color: C.sub, marginBottom: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>Generated Audio</div>
            <audio controls src={audioUrl} style={{ width: "100%", borderRadius: 8 }} />
            <a href={audioUrl} download="omnyra-voice.mp3"
              style={{ display: "block", marginTop: 12, textAlign: "center", padding: "10px", borderRadius: 10,
                background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)",
                color: C.text, textDecoration: "none", fontSize: 13 }}>
              Download MP3 ↓
            </a>
          </div>
        )}
        </div>
      </div>
    </main>
  );
}
