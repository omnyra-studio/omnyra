"use client";
import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import AnimatedBackground from "@/components/AnimatedBackground";

const C = {
  bg: "#07070f", text: "#f5f3ff", sub: "rgba(245,243,255,0.5)",
  violet: "#7c6fff", cyan: "#22d3ee",
};

const PERSON_STYLES = [
  { id: "woman",      label: "Confident woman walking toward camera", value: "confident young woman walking toward camera, athletic, natural movement" },
  { id: "creator",   label: "Creator talking to camera",              value: "energetic creator talking directly to camera, casual style, gesturing naturally" },
  { id: "presenter", label: "Professional presenter",                 value: "professional presenter in motion, business casual, authoritative presence" },
  { id: "influencer",label: "Casual influencer",                     value: "casual influencer, natural beauty, authentic and approachable" },
];

const SCENES = [
  { label: "City street — golden hour",  value: "bustling city street at golden hour, bokeh lights behind, warm tones" },
  { label: "Rooftop at sunset",          value: "modern rooftop terrace at sunset, city skyline, amber light" },
  { label: "Beach at sunrise",           value: "tropical beach at sunrise, soft waves, golden light" },
  { label: "Clean modern studio",        value: "modern minimal studio, professional ring lighting, clean background" },
  { label: "Forest trail — morning",     value: "lush forest trail in morning light, dappled sunbeams, green canopy" },
  { label: "Custom scene...",            value: "" },
];

function authHeaders(session) {
  return {
    "Content-Type": "application/json",
    ...(session && { Authorization: `Bearer ${session.access_token}` }),
  };
}

export default function CinematicStudio() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [script, setScript] = useState("");
  const [voices, setVoices] = useState([]);
  const [voiceSearch, setVoiceSearch] = useState("");
  const [voiceGender, setVoiceGender] = useState("All");
  const [voiceId, setVoiceId] = useState("");
  const previewRef = useRef(null);
  const [playingId, setPlayingId] = useState(null);
  const [scene, setScene] = useState(SCENES[0]);
  const [customScene, setCustomScene] = useState("");
  const [personStyle, setPersonStyle] = useState(PERSON_STYLES[0].value);
  const [audioBlobUrl, setAudioBlobUrl] = useState("");
  const [audioPublicUrl, setAudioPublicUrl] = useState("");
  const [videoUrl, setVideoUrl] = useState("");
  const [finalUrl, setFinalUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const sceneDesc = scene.value || customScene;

  // Load full ElevenLabs voice library on mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      fetch("/api/voices", {
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
      })
        .then(r => r.json())
        .then(d => {
          if (d.voices?.length) {
            setVoices(d.voices);
            setVoiceId(d.voices[0].id);
          }
        })
        .catch(() => {});
    });
  }, []);

  function playVoicePreview(v) {
    if (!v.previewUrl) return;
    if (playingId === v.id) {
      previewRef.current?.pause();
      setPlayingId(null);
      return;
    }
    previewRef.current?.pause();
    const a = new Audio(v.previewUrl);
    previewRef.current = a;
    a.play();
    setPlayingId(v.id);
    a.onended = () => setPlayingId(null);
  }

  const filteredVoices = voices.filter(v => {
    const q = voiceSearch.toLowerCase();
    const matchQ = !q || v.name.toLowerCase().includes(q) || v.accent?.toLowerCase().includes(q) || v.description?.toLowerCase().includes(q);
    const matchG = voiceGender === "All" || v.gender === voiceGender;
    return matchQ && matchG;
  });

  const selectedVoice = voices.find(v => v.id === voiceId);

  async function generateVoice() {
    if (!script.trim()) return;
    setLoading(true); setError(""); setStatus("Generating voice...");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/voice", {
        method: "POST",
        headers: authHeaders(session),
        body: JSON.stringify({ text: script, voiceId }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Voice generation failed");
      }
      const remaining = res.headers.get("X-Credits-Remaining");
      if (remaining) setCredits(remaining);
      const blob = await res.blob();
      setAudioBlobUrl(URL.createObjectURL(blob));
      setStatus("Uploading audio for lip sync...");

      // Upload to lipsync-media bucket so SyncLabs can fetch it via public URL
      const { data: { user } } = await supabase.auth.getUser();
      const path = `audio/${user.id}/${Date.now()}.mp3`;
      const { data: upData, error: upErr } = await supabase.storage
        .from("lipsync-media")
        .upload(path, blob, { contentType: "audio/mpeg", upsert: true });
      if (upErr) throw new Error("Audio upload failed — check lipsync-media bucket exists in Supabase");
      const { data: { publicUrl } } = supabase.storage.from("lipsync-media").getPublicUrl(upData.path);
      setAudioPublicUrl(publicUrl);
      setStatus("Voice ready");
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function generateCinematic() {
    if (!sceneDesc) return;
    setLoading(true); setError(""); setStatus("Submitting to Runway — takes 60-90 seconds...");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/cinematic", {
        method: "POST",
        headers: authHeaders(session),
        body: JSON.stringify({ sceneDescription: sceneDesc, personStyle, duration: 8 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      if (data.balance !== undefined) setCredits(data.balance);

      if (data.status === "complete" && data.url) {
        setVideoUrl(data.url);
        setStatus("Scene ready");
        setStep(3);
        setLoading(false);
      } else if (data.jobId) {
        pollVideo(data.jobId, data.provider, session);
      } else {
        throw new Error("No job ID returned from cinematic API");
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  function pollVideo(jobId, provider, session) {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > 36) {
        clearInterval(interval); setLoading(false);
        setError("Video generation timed out. Please try again.");
        return;
      }
      try {
        const res = await fetch(`/api/status?provider=${provider}&jobId=${jobId}`, {
          headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
        });
        const data = await res.json();
        if (data.status === "complete" && data.url) {
          clearInterval(interval);
          setVideoUrl(data.url);
          setStatus("Scene ready");
          setStep(3);
          setLoading(false);
        } else if (data.status === "failed") {
          clearInterval(interval);
          setError("Video generation failed. Try again.");
          setLoading(false);
        } else {
          const pct = data.progress != null ? ` ${Math.round(data.progress * 100)}%` : "";
          setStatus(`Generating cinematic scene${pct}...`);
        }
      } catch { /* keep polling */ }
    }, 5000);
  }

  async function generateLipsync() {
    if (!videoUrl || !audioPublicUrl) return;
    setLoading(true); setError(""); setStatus("Submitting to SyncLabs — 2-3 minutes...");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/cinematic/lipsync", {
        method: "POST",
        headers: authHeaders(session),
        body: JSON.stringify({ videoUrl, audioUrl: audioPublicUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lip sync failed");
      if (data.balance !== undefined) setCredits(data.balance);
      if (data.jobId) {
        pollLipsync(data.jobId, data.provider, session);
      } else {
        throw new Error("No job ID returned from lipsync API");
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  function pollLipsync(jobId, provider, session) {
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > 48) {
        clearInterval(interval); setLoading(false);
        setError("Lip sync timed out. Please try again.");
        return;
      }
      try {
        const res = await fetch(`/api/lipsync/status?jobId=${jobId}&provider=${provider}`, {
          headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
        });
        const data = await res.json();
        if (data.url) {
          clearInterval(interval);
          setFinalUrl(data.url);
          setStatus("Your video is ready");
          setStep(4);
          setLoading(false);
        } else if (data.status === "failed") {
          clearInterval(interval);
          setError("Lip sync failed. Please try again.");
          setLoading(false);
        } else {
          setStatus("Syncing lips to voice...");
        }
      } catch { /* keep polling */ }
    }, 5000);
  }

  function reset() {
    setStep(1); setScript(""); setVoiceId(voices[0]?.id ?? "");
    setScene(SCENES[0]); setCustomScene(""); setPersonStyle(PERSON_STYLES[0].value);
    setAudioBlobUrl(""); setAudioPublicUrl(""); setVideoUrl(""); setFinalUrl("");
    setError(""); setStatus("");
  }

  const btnStyle = (disabled) => ({
    width: "100%", padding: "15px", borderRadius: 12, border: "none", fontFamily: "inherit",
    fontWeight: 700, fontSize: 15, cursor: disabled ? "not-allowed" : "pointer",
    background: disabled ? "rgba(255,255,255,0.06)" : `linear-gradient(135deg, ${C.violet}, ${C.cyan})`,
    color: disabled ? C.sub : "#fff",
  });

  return (
    <main style={{ minHeight: "100vh", background: "transparent", position: "relative", color: C.text, fontFamily: '"Instrument Sans","Inter",-apple-system,sans-serif', padding: "0 0 80px" }}>
      <AnimatedBackground />
      <div style={{ position: "relative", zIndex: 1 }}>
        <div style={{ borderBottom: "1px solid rgba(207,164,47,0.15)", padding: "12px 20px", display: "flex", alignItems: "center", gap: 12, position: "sticky", top: 0, background: "rgba(45,10,62,0.75)", backdropFilter: "blur(16px)", zIndex: 40 }}>
          <span style={{ fontWeight: 700, fontSize: 18, background: "linear-gradient(90deg,#CFA42F,#E8B84B)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>Omnyra</span>
          <button onClick={() => router.push("/dashboard")} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "6px 10px", color: C.text, cursor: "pointer", fontSize: 16 }}>←</button>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Cinematic Studio</span>
        </div>
        <div style={{ maxWidth: 480, margin: "0 auto", padding: "16px 20px 0" }}>

        {/* Step indicator */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: 28 }}>
          {[
            [1, "Script & Voice"],
            [2, "Scene"],
            [3, "Lip Sync"],
            [4, "Done"],
          ].map(([s, label], i, arr) => (
            <div key={s} style={{ display: "flex", alignItems: "center", flex: i < arr.length - 1 ? 1 : 0 }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: "50%", display: "flex", alignItems: "center",
                  justifyContent: "center", fontSize: 11, fontWeight: 700,
                  background: step > s ? C.violet : step === s ? C.violet : "rgba(255,255,255,0.08)",
                  color: step >= s ? "#fff" : C.sub,
                }}>
                  {step > s ? "✓" : s}
                </div>
                <span style={{ fontSize: 9, color: step >= s ? C.violet : C.sub, fontWeight: step === s ? 700 : 400, whiteSpace: "nowrap" }}>{label}</span>
              </div>
              {i < arr.length - 1 && (
                <div style={{ flex: 1, height: 1, background: step > s ? C.violet : "rgba(255,255,255,0.08)", margin: "0 6px", marginBottom: 14 }} />
              )}
            </div>
          ))}
        </div>

        {/* ── STEP 1: Script + Voice ── */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 11, color: C.sub, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>Step 1 — Write your script</div>

            <div>
              <div style={{ fontSize: 11, color: C.sub, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>
                Voice {selectedVoice && <span style={{ color: C.violet, textTransform: "none", fontWeight: 700 }}>— {selectedVoice.name}</span>}
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                <input value={voiceSearch} onChange={e => setVoiceSearch(e.target.value)}
                  placeholder="Search voices..."
                  style={{ flex: 1, padding: "7px 12px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)", color: C.text, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
                {["All", "male", "female"].map(g => (
                  <button key={g} onClick={() => setVoiceGender(g)}
                    style={{ padding: "6px 10px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: 600,
                      background: voiceGender === g ? C.violet : "rgba(255,255,255,0.05)",
                      border: voiceGender === g ? "1px solid transparent" : "1px solid rgba(255,255,255,0.1)",
                      color: voiceGender === g ? "#fff" : C.sub }}>
                    {g === "All" ? "All" : g === "male" ? "M" : "F"}
                  </button>
                ))}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 5, maxHeight: 220, overflowY: "auto" }}>
                {filteredVoices.length === 0 && voices.length === 0 && (
                  <div style={{ fontSize: 12, color: C.sub, padding: "12px 0", textAlign: "center" }}>Loading voices...</div>
                )}
                {filteredVoices.map(v => (
                  <div key={v.id}
                    onClick={() => setVoiceId(v.id)}
                    style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 10, cursor: "pointer",
                      background: voiceId === v.id ? "rgba(124,111,255,0.18)" : "rgba(255,255,255,0.03)",
                      border: voiceId === v.id ? "1px solid rgba(124,111,255,0.6)" : "1px solid rgba(255,255,255,0.07)" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 700, fontSize: 13, color: voiceId === v.id ? "#fff" : C.text }}>{v.name}</span>
                      <span style={{ fontSize: 11, color: C.sub, marginLeft: 8, textTransform: "capitalize" }}>{v.gender}{v.accent && v.accent !== "unknown" ? ` · ${v.accent}` : ""}</span>
                    </div>
                    {v.previewUrl && (
                      <button onClick={e => { e.stopPropagation(); playVoicePreview(v); }}
                        style={{ flexShrink: 0, padding: "3px 8px", borderRadius: 6, border: "1px solid rgba(124,111,255,0.3)", background: playingId === v.id ? "rgba(124,111,255,0.3)" : "rgba(124,111,255,0.1)", color: "#a78bfa", cursor: "pointer", fontSize: 10, fontFamily: "inherit", fontWeight: 700 }}>
                        {playingId === v.id ? "■" : "▶"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, color: C.sub, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>Script</div>
              <textarea
                value={script}
                onChange={e => setScript(e.target.value)}
                placeholder="Hey! Today I'm going to show you exactly how to..."
                rows={7}
                style={{ width: "100%", padding: "14px 16px", borderRadius: 12,
                  border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.04)",
                  color: C.text, fontSize: 14, fontFamily: "inherit",
                  resize: "vertical", outline: "none", boxSizing: "border-box", lineHeight: 1.6 }}
              />
              <div style={{ fontSize: 11, color: C.sub, marginTop: 4, textAlign: "right" }}>{script.length} chars</div>
            </div>

            {error && <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 10, padding: "10px 14px", color: "#f87171", fontSize: 13 }}>{error}</div>}

            <button onClick={generateVoice} disabled={loading || !script.trim()} style={btnStyle(loading || !script.trim())}>
              {loading ? status || "Generating..." : "Generate Voice →"}
            </button>
          </div>
        )}

        {/* ── STEP 2: Scene + Person ── */}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 11, color: C.sub, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>Step 2 — Choose your scene</div>

            {audioBlobUrl && (
              <div style={{ padding: "12px 16px", borderRadius: 12, background: "rgba(124,111,255,0.08)", border: "1px solid rgba(124,111,255,0.2)" }}>
                <div style={{ fontSize: 11, color: C.sub, marginBottom: 8, fontWeight: 600, textTransform: "uppercase" }}>Voice Preview</div>
                <audio controls src={audioBlobUrl} style={{ width: "100%" }} />
              </div>
            )}

            <div>
              <div style={{ fontSize: 11, color: C.sub, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>Scene</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {SCENES.map(s => (
                  <button key={s.label} onClick={() => setScene(s)}
                    style={{ padding: "10px 12px", borderRadius: 10, textAlign: "left", cursor: "pointer", fontFamily: "inherit", fontSize: 12,
                      background: scene.label === s.label ? "rgba(124,111,255,0.18)" : "rgba(255,255,255,0.04)",
                      border: scene.label === s.label ? "1px solid rgba(124,111,255,0.6)" : "1px solid rgba(255,255,255,0.08)",
                      color: scene.label === s.label ? "#fff" : C.sub }}>
                    {s.label}
                  </button>
                ))}
              </div>
              {scene.value === "" && (
                <textarea
                  value={customScene}
                  onChange={e => setCustomScene(e.target.value)}
                  placeholder="e.g. modern gym with morning light, mirrors behind..."
                  rows={3}
                  style={{ width: "100%", marginTop: 8, padding: "12px 14px", borderRadius: 10,
                    border: "1px solid rgba(124,111,255,0.5)", background: "rgba(255,255,255,0.04)",
                    color: C.text, fontSize: 14, fontFamily: "inherit",
                    resize: "vertical", outline: "none", boxSizing: "border-box" }}
                />
              )}
            </div>

            <div>
              <div style={{ fontSize: 11, color: C.sub, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>Person Style</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {PERSON_STYLES.map(p => (
                  <button key={p.id} onClick={() => setPersonStyle(p.value)}
                    style={{ padding: "11px 14px", borderRadius: 10, textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                      background: personStyle === p.value ? "rgba(124,111,255,0.18)" : "rgba(255,255,255,0.04)",
                      border: personStyle === p.value ? "1px solid rgba(124,111,255,0.6)" : "1px solid rgba(255,255,255,0.08)",
                      color: personStyle === p.value ? "#fff" : C.sub, fontSize: 13 }}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {error && <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 10, padding: "10px 14px", color: "#f87171", fontSize: 13 }}>{error}</div>}

            <button onClick={generateCinematic} disabled={loading || !sceneDesc} style={btnStyle(loading || !sceneDesc)}>
              {loading ? status || "Generating..." : "🎬 Generate Cinematic Scene →"}
            </button>
            <div style={{ fontSize: 11, color: C.sub, textAlign: "center" }}>Runway gen takes 60-90 seconds</div>
          </div>
        )}

        {/* ── STEP 3: Lip Sync ── */}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ fontSize: 11, color: C.sub, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em" }}>Step 3 — Sync voice to video</div>

            {videoUrl && (
              <div>
                <div style={{ fontSize: 11, color: C.sub, marginBottom: 8, fontWeight: 600, textTransform: "uppercase" }}>Cinematic Scene</div>
                <video src={videoUrl} controls muted autoPlay loop
                  style={{ width: "100%", borderRadius: 12, maxHeight: 280, objectFit: "cover", background: "#000" }} />
              </div>
            )}

            {audioBlobUrl && (
              <div style={{ padding: "12px 16px", borderRadius: 12, background: "rgba(124,111,255,0.08)", border: "1px solid rgba(124,111,255,0.2)" }}>
                <div style={{ fontSize: 11, color: C.sub, marginBottom: 8, fontWeight: 600, textTransform: "uppercase" }}>Your Voice</div>
                <audio controls src={audioBlobUrl} style={{ width: "100%" }} />
              </div>
            )}

            <div style={{ padding: "12px 16px", borderRadius: 10, background: "rgba(124,111,255,0.06)", border: "1px solid rgba(124,111,255,0.15)", fontSize: 13, color: C.sub, lineHeight: 1.6 }}>
              SyncLabs will animate the person&apos;s lips to match your voice perfectly. Takes 2-3 minutes.
            </div>

            {error && <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 10, padding: "10px 14px", color: "#f87171", fontSize: 13 }}>{error}</div>}

            <button onClick={generateLipsync} disabled={loading} style={btnStyle(loading)}>
              {loading ? status || "Syncing..." : "👄 Sync Lips to Voice →"}
            </button>
            <div style={{ fontSize: 11, color: C.sub, textAlign: "center" }}>SyncLabs lip sync</div>
          </div>
        )}

        {/* ── STEP 4: Done ── */}
        {step === 4 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20, alignItems: "center", textAlign: "center" }}>
            <div style={{ fontSize: 56 }}>🎉</div>
            <h2 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>Your video is ready</h2>
            <p style={{ color: C.sub, margin: 0, fontSize: 15 }}>Download and post anywhere</p>

            {finalUrl && (
              <video src={finalUrl} controls
                style={{ width: "100%", borderRadius: 14, maxHeight: 340, background: "#000" }} />
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10, width: "100%" }}>
              <a href={finalUrl} download="omnyra-cinematic.mp4"
                style={{ display: "block", padding: "14px", borderRadius: 12, fontWeight: 700, fontSize: 15,
                  background: `linear-gradient(135deg, ${C.violet}, ${C.cyan})`,
                  color: "#fff", textDecoration: "none", textAlign: "center" }}>
                Download Video ↓
              </a>
              <button onClick={reset}
                style={{ padding: "13px", borderRadius: 12, border: "1px solid rgba(255,255,255,0.12)",
                  background: "rgba(255,255,255,0.04)", color: C.sub,
                  fontFamily: "inherit", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>
                Create Another
              </button>
            </div>
          </div>
        )}

        </div>
      </div>
    </main>
  );
}
