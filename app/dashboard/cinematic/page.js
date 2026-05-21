"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

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

const VOICES = [
  { id: "JBFqnCBsd6RMkjVDRZzb", name: "George", desc: "Warm · Male" },
  { id: "EXAVITQu4vr4xnSDxMaL", name: "Bella",  desc: "Soft · Female" },
  { id: "21m00Tcm4TlvDq8ikWAM", name: "Rachel", desc: "Clear · Female" },
  { id: "TxGEqnHWrfWFTfGW9XjX", name: "Josh",   desc: "Deep · Male" },
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
  const [voiceId, setVoiceId] = useState(VOICES[0].id);
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
  const [credits, setCredits] = useState(null);

  const sceneDesc = scene.value || customScene;

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
    setStep(1); setScript(""); setVoiceId(VOICES[0].id);
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
    <main style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: '"Instrument Sans","Inter",-apple-system,sans-serif', padding: "0 0 80px" }}>
      <div style={{ maxWidth: 480, margin: "0 auto", padding: "0 20px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "20px 0 20px" }}>
          <button onClick={() => router.push("/dashboard")}
            style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12, padding: "8px 12px", color: C.text, cursor: "pointer", fontSize: 18 }}>
            ←
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>Cinematic Studio</h1>
            <p style={{ margin: 0, fontSize: 12, color: C.sub }}>Real AI person · Runway · Your voice synced</p>
          </div>
          {credits !== null && (
            <div style={{ marginLeft: "auto", fontSize: 12, color: C.sub, background: "rgba(255,255,255,0.05)", borderRadius: 8, padding: "4px 10px" }}>
              ⚡ {credits}
            </div>
          )}
        </div>

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
              <div style={{ fontSize: 11, color: C.sub, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>Voice</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {VOICES.map(v => (
                  <button key={v.id} onClick={() => setVoiceId(v.id)}
                    style={{ padding: "10px 14px", borderRadius: 10, textAlign: "left", cursor: "pointer", fontFamily: "inherit",
                      background: voiceId === v.id ? "rgba(124,111,255,0.18)" : "rgba(255,255,255,0.04)",
                      border: voiceId === v.id ? "1px solid rgba(124,111,255,0.6)" : "1px solid rgba(255,255,255,0.08)",
                      color: voiceId === v.id ? "#fff" : C.sub }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{v.name}</div>
                    <div style={{ fontSize: 11, marginTop: 2, color: C.sub }}>{v.desc}</div>
                  </button>
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
            <div style={{ fontSize: 11, color: C.sub, textAlign: "center" }}>Voice generation · 1-2 credits</div>
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
            <div style={{ fontSize: 11, color: C.sub, textAlign: "center" }}>Runway gen takes 60-90 seconds · 20 credits</div>
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
            <div style={{ fontSize: 11, color: C.sub, textAlign: "center" }}>6 credits · SyncLabs</div>
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
    </main>
  );
}
