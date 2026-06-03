"use client";
import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import AnimatedBackground from "@/components/AnimatedBackground";

const C = {
  text: "#E8DEFF",
  sub: "#BBA8C8",
  violet: "#C084FC",
  gold: "#F0C040",
  border: "rgba(207,164,47,0.2)",
};

const MOTION_PROMPTS = [
  "walking confidently toward camera, natural smile",
  "running through scene toward camera, energetic",
  "turning to face camera, surprised delight",
  "gesturing expressively while talking, passionate",
  "walking in profile then turning to camera",
  "dancing lightly, joyful energy",
  "sitting down, leaning forward engaging",
  "standing up from sitting, powerful moment",
];

const SCENES = [
  { label: "🌳 Golden Hour Park",  prompt: "lush park path, golden hour sunlight through trees, bokeh background" },
  { label: "🌆 City Rooftop",      prompt: "city rooftop at sunset, skyline behind, warm golden light" },
  { label: "🏖️ Beach Sunrise",     prompt: "tropical beach at sunrise, waves, golden pink sky" },
  { label: "🏢 Modern Office",     prompt: "sleek modern office, floor to ceiling windows, city view" },
  { label: "🎨 Creative Studio",   prompt: "modern minimal creative studio, white walls, plants" },
  { label: "🌃 Neon City Night",   prompt: "futuristic city at night, neon lights, rain-slicked streets" },
  { label: "🏔️ Mountain Vista",    prompt: "mountain summit, dramatic clouds, epic landscape" },
  { label: "☁️ Clean White",       prompt: "clean white studio background, professional, minimal" },
  { label: "✏️ Custom Scene",      prompt: "" },
];

const STEPS = [
  [0, "💡 Brief"],
  [1, "🎙️ Voice"],
  [2, "🎬 Scene"],
  [3, "👄 Sync"],
  [4, "⬇️ Done"],
];

async function getAuthHeaders(session) {
  const s = session ?? (await supabase.auth.getSession()).data.session;
  return {
    "Content-Type": "application/json",
    ...(s && { Authorization: `Bearer ${s.access_token}` }),
  };
}

export default function CreatorStudio() {
  const router = useRouter();
  const [step, setStep] = useState(0);

  // Brief
  const [briefMode, setBriefMode]     = useState("generate");
  const [topic, setTopic]             = useState("");
  const [platform, setPlatform]       = useState("TikTok");
  const [duration, setDuration]       = useState("60 seconds");
  const [brief, setBrief]             = useState("");
  const [pastedScript, setPastedScript] = useState("");

  // Photo
  const [photoFile, setPhotoFile]     = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [usePhoto, setUsePhoto]       = useState(false);
  const fileInputRef = useRef(null);

  // Voice
  const [script, setScript]           = useState("");
  const [voices, setVoices]           = useState([]);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [voiceSearch, setVoiceSearch] = useState("");
  const [audioUrl, setAudioUrl]       = useState(null);

  // Scene
  const [scene, setScene]             = useState(SCENES[0]);
  const [customScene, setCustomScene] = useState("");
  const [motionPrompt, setMotionPrompt] = useState(MOTION_PROMPTS[0]);
  const [videoUrl, setVideoUrl]       = useState(null);

  // Lip sync
  const [finalUrl, setFinalUrl]       = useState(null);

  // Status
  const [loading, setLoading]         = useState(false);
  const [status, setStatus]           = useState("");
  const [error, setError]             = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      fetch("/api/voices", {
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
      })
        .then(r => r.json())
        .then(d => {
          if (d.voices?.length) {
            setVoices(d.voices);
            setSelectedVoice(d.voices[0]);
          }
        })
        .catch(() => {});
    });

    const saved = localStorage.getItem("omnyra_script");
    if (saved) {
      setTimeout(() => {
        setScript(saved);
        setBriefMode("paste");
        setPastedScript(saved);
      }, 0);
    }
  }, []);

  function cleanForVoice(text) {
    return text
      .replace(/\*\*\[.*?\]\*\*/g, "").replace(/\[.*?\]/g, "")
      .replace(/##.*?\n/g, "").replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/🎣|📖|🎯|✨|💡|🎬/g, "")
      .replace(/HOOK[:\s].*?\n/gi, "").replace(/MAIN CONTENT.*?\n/gi, "")
      .replace(/CALL TO ACTION.*?\n/gi, "").replace(/SCENE \d+.*?\n/gi, "")
      .replace(/PRODUCTION NOTES[\s\S]*/gi, "")
      .replace(/SPOKEN SCRIPT[:\s]*/gi, "")
      .replace(/\n{3,}/g, "\n\n").trim();
  }

  function handlePhotoChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = ev => setPhotoPreview(ev.target.result);
    reader.readAsDataURL(file);
  }

  async function uploadFile(fileOrBlob, name = "file.bin") {
    const { data: { session } } = await supabase.auth.getSession();
    const form = new FormData();
    form.append("file", fileOrBlob, name);
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
      body: form,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Upload failed");
    return data.url;
  }

  async function generateBrief() {
    setLoading(true); setError(""); setBrief("");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/generate", {
        method: "POST",
        headers,
        body: JSON.stringify({
          type: "cinematic_brief",
          prompt: `Create a cinematic ${platform} video brief (${duration}) about: "${topic}".

SPOKEN SCRIPT:
[Write 50-150 words, conversational, no stage directions]

SCENE:
[Specific location + lighting + what person is doing — must involve movement]

VISUAL STYLE:
[Camera movement, lighting references]

CAPTION:
[Platform-optimised hook]

HASHTAGS:
[10 relevant tags]`,
        }),
      });
      const data = await res.json();
      const fullBrief = data.result || "";
      setBrief(fullBrief);
      const match = fullBrief.match(/SPOKEN SCRIPT[:\s]*([\s\S]*?)(?=SCENE:|VISUAL|CAPTION|HASHTAG|$)/i);
      setScript(cleanForVoice(match ? match[1] : fullBrief));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function generateVoice() {
    if (!script.trim()) return;
    setLoading(true); setError(""); setStatus("Generating voice...");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/voice", {
        method: "POST",
        headers,
        body: JSON.stringify({ text: script, voiceId: selectedVoice?.id }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Voice generation failed");
      }
      const rem = res.headers.get("X-Credits-Remaining");
      if (rem) setCredits(rem);
      const blob = await res.blob();

      setStatus("Uploading audio...");
      const url = await uploadFile(blob, "voice.mp3");
      setAudioUrl(url);
      setStatus("Voice ready!");
      setStep(2);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function generateVideo() {
    const scenePrompt = scene.prompt || customScene;
    if (!scenePrompt) return;
    setLoading(true); setError(""); setStatus("Generating your video — 2-3 minutes...");
    try {
      const headers = await getAuthHeaders();

      let uploadedPhotoUrl = null;
      if (usePhoto && photoFile) {
        setStatus("Uploading your photo...");
        uploadedPhotoUrl = await uploadFile(photoFile);
      }

      const isPhotoMode = !!uploadedPhotoUrl;
      const endpoint = isPhotoMode ? "/api/photo-animate" : "/api/cinematic";
      const bodyObj  = isPhotoMode
        ? { photoUrl: uploadedPhotoUrl, prompt: `${motionPrompt}, ${scenePrompt}` }
        : { sceneDescription: `${motionPrompt}, ${scenePrompt}`, duration: 8 };

      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(bodyObj),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      if (data.balance !== undefined) setCredits(data.balance);

      if (data.status === "complete" && data.url) {
        setVideoUrl(data.url);
        setStatus("Video ready!");
        setStep(3);
        setLoading(false);
      } else if (data.jobId) {
        setStatus(data.message || "Processing...");
        pollVideo(data.jobId, data.provider, data.creditAction);
      } else {
        throw new Error(data.error || "No job ID returned");
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  async function pollVideo(jobId, provider, creditAction) {
    const { data: { session } } = await supabase.auth.getSession();
    const authH = session ? { Authorization: `Bearer ${session.access_token}` } : {};
    const isPhotoProvider = provider === "kling" || provider === "did";
    const caParam = creditAction ? `&creditAction=${creditAction}` : "";
    const statusUrl = isPhotoProvider
      ? `/api/photo-animate/status?jobId=${jobId}&provider=${provider}${caParam}`
      : `/api/status?jobId=${jobId}&provider=${provider}&subtype=text2video${caParam}`;

    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > 60) {
        clearInterval(interval);
        setError("Video generation timed out. Please try again.");
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(statusUrl, { headers: authH });
        const data = await res.json();
        if (data.status === "complete" && data.url) {
          clearInterval(interval);
          setVideoUrl(data.url);
          setStatus("Video ready!");
          setStep(3);
          setLoading(false);
        } else if (data.status === "failed") {
          clearInterval(interval);
          setError("Video generation failed. Please try again.");
          setLoading(false);
        } else {
          const pct = data.progress != null ? ` ${Math.round(data.progress * 100)}%` : "";
          setStatus(`Generating scene${pct}...`);
        }
      } catch { /* keep polling */ }
    }, 5000);
  }

  async function generateLipsync() {
    if (!videoUrl || !audioUrl) return;
    setLoading(true); setError(""); setStatus("Syncing your voice to the video...");
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/cinematic/lipsync", {
        method: "POST",
        headers,
        body: JSON.stringify({ videoUrl, audioUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Lip sync failed");
      if (data.balance !== undefined) setCredits(data.balance);
      if (data.jobId) {
        setStatus(data.message || "Syncing...");
        pollLipsync(data.jobId, data.provider, data.creditAction);
      } else {
        throw new Error("No job ID returned from lip sync");
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }

  async function pollLipsync(jobId, provider, creditAction) {
    const { data: { session } } = await supabase.auth.getSession();
    const authH = session ? { Authorization: `Bearer ${session.access_token}` } : {};
    const caParam = creditAction ? `&creditAction=${creditAction}` : "";
    let attempts = 0;
    const interval = setInterval(async () => {
      attempts++;
      if (attempts > 48) {
        clearInterval(interval);
        setError("Lip sync timed out. Please try again.");
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(
          `/api/lipsync/status?jobId=${jobId}&provider=${provider}${caParam}`,
          { headers: authH }
        );
        const data = await res.json();
        if (data.url || data.status === "complete") {
          clearInterval(interval);
          setFinalUrl(data.url);
          setStatus("Your video is ready!");
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
    setStep(0); setScript(""); setBrief(""); setTopic(""); setPastedScript("");
    setPhotoFile(null); setPhotoPreview(null); setUsePhoto(false);
    setAudioUrl(null); setVideoUrl(null); setFinalUrl(null);
    setError(""); setStatus("");
  }

  const btn = (disabled) => ({
    padding: "14px", borderRadius: 10, fontWeight: 700, fontSize: 15,
    border: "none", cursor: disabled ? "not-allowed" : "pointer",
    background: disabled
      ? "rgba(255,255,255,0.06)"
      : "linear-gradient(105deg, #5A3400, #9A7010, #CFA42F, #E8C84A, #CFA42F, #9A7010, #5A3400)",
    backgroundSize: disabled ? undefined : "200% auto",
    animation: disabled ? undefined : "metalShimmer 3s linear infinite",
    color: disabled ? "#555" : "#0D0010", width: "100%",
    fontFamily: "inherit",
    boxShadow: disabled ? undefined : "0 0 20px rgba(207,164,47,0.2)",
  });

  const inputStyle = {
    padding: "12px 16px", borderRadius: 10,
    border: "1px solid rgba(204,171,175,0.25)",
    background: "#0D0010", color: "#C084FC", fontSize: 14,
    width: "100%", boxSizing: "border-box", fontFamily: "inherit", outline: "none",
  };

  return (
    <div style={{ minHeight: "100vh", background: "transparent", position: "relative", color: C.text, fontFamily: '"Instrument Sans","Inter",-apple-system,sans-serif' }}>
      <AnimatedBackground />
      <div style={{ position: "relative", zIndex: 1 }}>

      {/* HEADER */}
      <div style={{ borderBottom: "1px solid rgba(207,164,47,0.15)", padding: "16px 20px",
        display: "flex", alignItems: "center", gap: 14, position: "sticky", top: 0, zIndex: 40,
        background: "rgba(45,10,62,0.75)", backdropFilter: "blur(16px)" }}>
        <span style={{ fontWeight: 700, fontSize: 20, background: "linear-gradient(90deg,#CFA42F,#E8B84B)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          Omnyra
        </span>
        <button onClick={() => router.push("/dashboard")}
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 10, padding: "8px 12px", color: C.text, cursor: "pointer", fontSize: 18 }}>
          ←
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>AI Creator Studio</h1>
          <p style={{ fontSize: 12, color: C.sub, margin: 0 }}>
            Photo or AI person · Any scene · Your voice · Full motion
          </p>
        </div>
      </div>

      {/* STEP INDICATOR */}
      <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, overflowX: "auto" }}>
        {STEPS.map(([s, label]) => (
          <div key={s}
            onClick={() => step > s && setStep(s)}
            style={{
              flex: 1, padding: "12px 8px", textAlign: "center",
              borderRight: `1px solid ${C.border}`,
              background: step === s ? "rgba(192,132,252,0.08)" : "transparent",
              color: step >= s ? C.violet : "#555",
              fontSize: 12, fontWeight: step === s ? 700 : 400,
              cursor: step > s ? "pointer" : "default",
              minWidth: 80,
            }}>
            {label}
          </div>
        ))}
      </div>

      <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 20px 80px",
        display: "flex", flexDirection: "column", gap: 20 }}>

        {/* ── STEP 0: BRIEF ── */}
        {step === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>What are we creating?</h2>

            <div style={{ display: "flex", gap: 8 }}>
              {[["generate", "✨ AI writes it"], ["paste", "📋 I have a script"]].map(([m, label]) => (
                <button key={m} onClick={() => setBriefMode(m)}
                  style={{ padding: "8px 20px", borderRadius: 20, fontWeight: 600, fontSize: 13,
                    border: briefMode === m ? `1px solid ${C.violet}` : `1px solid ${C.border}`,
                    background: briefMode === m ? "rgba(192,132,252,0.12)" : "transparent",
                    color: briefMode === m ? C.violet : C.sub, cursor: "pointer", fontFamily: "inherit" }}>
                  {label}
                </button>
              ))}
            </div>

            {briefMode === "generate" ? (
              <>
                <textarea value={topic} onChange={e => setTopic(e.target.value)}
                  placeholder="What is your video about? e.g. How I replaced 5 apps with one AI tool"
                  rows={3}
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <select value={platform} onChange={e => setPlatform(e.target.value)}
                    style={{ padding: "10px", borderRadius: 8,
                      border: "1px solid rgba(204,171,175,0.25)",
                      background: "#0D0010", color: "#C084FC", fontSize: 14, fontFamily: "inherit" }}>
                    {["TikTok", "Instagram Reels", "YouTube Shorts", "YouTube", "LinkedIn"].map(p =>
                      <option key={p}>{p}</option>)}
                  </select>
                  <select value={duration} onChange={e => setDuration(e.target.value)}
                    style={{ padding: "10px", borderRadius: 8,
                      border: "1px solid rgba(204,171,175,0.25)",
                      background: "#0D0010", color: "#C084FC", fontSize: 14, fontFamily: "inherit" }}>
                    {["15 seconds", "30 seconds", "60 seconds", "90 seconds"].map(d =>
                      <option key={d}>{d}</option>)}
                  </select>
                </div>

                {error && (
                  <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)",
                    borderRadius: 10, padding: "10px 14px", color: "#f87171", fontSize: 13 }}>
                    {error}
                  </div>
                )}

                <button onClick={generateBrief} disabled={loading || !topic.trim()} style={btn(loading || !topic.trim())}>
                  {loading ? "Writing your brief..." : "Generate Creative Brief →"}
                </button>

                {brief && (
                  <div style={{ background: "rgba(75,30,130,0.65)", backdropFilter: "blur(16px)", borderRadius: 12,
                    border: `1px solid rgba(192,132,252,0.35)`, padding: "1.5rem" }}>
                    <pre style={{ whiteSpace: "pre-wrap", fontFamily: "inherit", fontSize: 13,
                      lineHeight: 1.7, color: "#E8DEFF", margin: 0, maxHeight: 300, overflowY: "auto" }}>
                      {brief}
                    </pre>
                    <button onClick={() => { setError(""); setStep(1); }}
                      style={{ ...btn(false), marginTop: 16 }}>
                      Use This Brief → Choose Voice
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <textarea value={pastedScript} onChange={e => setPastedScript(e.target.value)}
                  placeholder="Paste your script here — we'll extract just the spoken words automatically"
                  rows={10}
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
                {error && (
                  <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)",
                    borderRadius: 10, padding: "10px 14px", color: "#f87171", fontSize: 13 }}>
                    {error}
                  </div>
                )}
                <button onClick={() => { setScript(cleanForVoice(pastedScript)); setError(""); setStep(1); }}
                  disabled={!pastedScript.trim()}
                  style={btn(!pastedScript.trim())}>
                  Use This Script → Choose Voice
                </button>
              </>
            )}
          </div>
        )}

        {/* ── STEP 1: VOICE ── */}
        {step === 1 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Choose Your Voice</h2>

            <div>
              <div style={{ fontSize: 11, color: C.sub, marginBottom: 6,
                textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>
                Script (edit if needed)
              </div>
              <textarea value={script} onChange={e => setScript(e.target.value)} rows={6}
                style={{ ...inputStyle, resize: "vertical", lineHeight: 1.6 }} />
              <div style={{ fontSize: 11, color: C.sub, textAlign: "right", marginTop: 4 }}>
                {script.length} chars
              </div>
            </div>

            <input value={voiceSearch} onChange={e => setVoiceSearch(e.target.value)}
              placeholder={`Search ${voices.length} voices...`}
              style={{ ...inputStyle, marginBottom: 0 }} />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr",
              gap: 8, maxHeight: 260, overflowY: "auto" }}>
              {voices.length === 0 && (
                <div style={{ gridColumn: "1/-1", fontSize: 13, color: C.sub,
                  textAlign: "center", padding: 20 }}>Loading voices...</div>
              )}
              {voices.filter(v => v.name.toLowerCase().includes(voiceSearch.toLowerCase())).map(v => (
                <div key={v.id} onClick={() => setSelectedVoice(v)}
                  style={{ padding: "10px 12px", borderRadius: 10, cursor: "pointer",
                    border: selectedVoice?.id === v.id
                      ? `1px solid rgba(192,132,252,0.6)`
                      : `1px solid ${C.border}`,
                    background: selectedVoice?.id === v.id
                      ? "rgba(192,132,252,0.1)"
                      : "rgba(75,30,130,0.4)",
                    display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: C.text }}>{v.name}</p>
                    <p style={{ margin: 0, fontSize: 11, color: C.sub }}>
                      {v.gender}{v.accent && v.accent !== "unknown" ? ` · ${v.accent}` : ""}
                    </p>
                  </div>
                  {v.previewUrl && (
                    <button onClick={e => { e.stopPropagation(); new Audio(v.previewUrl).play(); }}
                      style={{ background: "transparent", border: `1px solid ${C.border}`,
                        borderRadius: 6, padding: "3px 8px", color: C.violet,
                        cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>
                      ▶
                    </button>
                  )}
                </div>
              ))}
            </div>

            {error && (
              <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)",
                borderRadius: 10, padding: "10px 14px", color: "#f87171", fontSize: 13 }}>
                {error}
              </div>
            )}

            <button onClick={generateVoice} disabled={loading || !script.trim()}
              style={btn(loading || !script.trim())}>
              {loading
                ? status || "Generating..."
                : `Generate Voice with ${selectedVoice?.name || "..."} →`}
            </button>
          </div>
        )}

        {/* ── STEP 2: SCENE ── */}
        {step === 2 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Choose Your Scene</h2>

            {/* PHOTO UPLOAD */}
            <div style={{ background: "rgba(75,30,130,0.65)", backdropFilter: "blur(16px)",
              borderRadius: 12, border: `1px solid rgba(192,132,252,0.25)`, padding: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center",
                justifyContent: "space-between", marginBottom: usePhoto ? 14 : 0 }}>
                <div>
                  <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: C.text }}>📸 Use my photo</p>
                  <p style={{ margin: 0, fontSize: 12, color: C.sub }}>
                    Upload your photo — AI animates YOU into the scene
                  </p>
                </div>
                <button onClick={() => setUsePhoto(!usePhoto)}
                  style={{ padding: "6px 16px", borderRadius: 20, fontWeight: 600,
                    border: usePhoto ? `1px solid ${C.violet}` : `1px solid ${C.border}`,
                    background: usePhoto ? "rgba(192,132,252,0.15)" : "transparent",
                    color: usePhoto ? C.violet : C.sub, cursor: "pointer",
                    fontSize: 12, fontFamily: "inherit" }}>
                  {usePhoto ? "On" : "Off"}
                </button>
              </div>
              {usePhoto && (
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button onClick={() => fileInputRef.current?.click()}
                    style={{ padding: "10px 20px", borderRadius: 8,
                      border: `1px solid rgba(192,132,252,0.4)`, background: `rgba(192,132,252,0.1)`,
                      color: C.violet, cursor: "pointer", fontSize: 13,
                      fontWeight: 600, fontFamily: "inherit" }}>
                    📸 Upload Photo
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*"
                    onChange={handlePhotoChange} style={{ display: "none" }} />
                  {photoPreview && (
                    <Image src={photoPreview} alt="Your photo"
                      width={60} height={60} unoptimized
                      style={{ borderRadius: 8, objectFit: "cover" }} />
                  )}
                  {photoPreview && (
                    <span style={{ color: C.violet, fontSize: 13 }}>✓ Photo ready</span>
                  )}
                </div>
              )}
            </div>

            {/* MOTION */}
            <div>
              <div style={{ fontSize: 11, color: C.sub, marginBottom: 8,
                textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>
                Motion / Action
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {MOTION_PROMPTS.map(m => (
                  <button key={m} onClick={() => setMotionPrompt(m)}
                    style={{ padding: "9px 12px", borderRadius: 8, textAlign: "left",
                      border: motionPrompt === m ? `1px solid rgba(192,132,252,0.6)` : `1px solid ${C.border}`,
                      background: motionPrompt === m ? "rgba(192,132,252,0.1)" : "rgba(75,30,130,0.4)",
                      color: C.text, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>
                    {m}
                  </button>
                ))}
              </div>
            </div>

            {/* SCENE */}
            <div>
              <div style={{ fontSize: 11, color: C.sub, marginBottom: 8,
                textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>
                Background Scene
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                {SCENES.map(s => (
                  <button key={s.label} onClick={() => setScene(s)}
                    style={{ padding: "10px 8px", borderRadius: 8,
                      border: scene.label === s.label ? `1px solid rgba(192,132,252,0.6)` : `1px solid ${C.border}`,
                      background: scene.label === s.label ? "rgba(192,132,252,0.1)" : "rgba(75,30,130,0.4)",
                      color: C.text, cursor: "pointer", fontSize: 12,
                      textAlign: "center", fontFamily: "inherit" }}>
                    {s.label}
                  </button>
                ))}
              </div>
              {scene.prompt === "" && (
                <input value={customScene} onChange={e => setCustomScene(e.target.value)}
                  placeholder="Describe your scene in detail..."
                  style={{ ...inputStyle, marginTop: 8 }} />
              )}
            </div>

            {audioUrl && (
              <div>
                <div style={{ fontSize: 11, color: C.sub, marginBottom: 6,
                  textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600 }}>
                  Voice Preview
                </div>
                <audio controls src={audioUrl} style={{ width: "100%" }} />
              </div>
            )}

            {error && (
              <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)",
                borderRadius: 10, padding: "10px 14px", color: "#f87171", fontSize: 13 }}>
                {error}
              </div>
            )}

            <button onClick={generateVideo}
              disabled={loading || (!scene.prompt && !customScene)}
              style={btn(loading || (!scene.prompt && !customScene))}>
              {loading ? status || "Generating..." : "Generate Video →"}
            </button>
            <div style={{ fontSize: 11, color: C.sub, textAlign: "center" }}>
              {usePhoto && photoFile ? "Kling image-to-video" : "Runway · 60-90 seconds"}
            </div>
          </div>
        )}

        {/* ── STEP 3: LIP SYNC ── */}
        {step === 3 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <h2 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Sync Voice to Video</h2>
            <p style={{ color: C.sub, margin: 0 }}>
              AI matches your voice to the person&apos;s lips perfectly
            </p>

            {videoUrl && (
              <video src={videoUrl} controls muted autoPlay loop
                style={{ width: "100%", borderRadius: 12, maxHeight: 320, background: "#000" }} />
            )}

            {error && (
              <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.3)",
                borderRadius: 10, padding: "10px 14px", color: "#f87171", fontSize: 13 }}>
                {error}
              </div>
            )}

            <button onClick={generateLipsync} disabled={loading} style={btn(loading)}>
              {loading ? status || "Syncing..." : "Sync Voice to Video →"}
            </button>

            <button onClick={() => { setFinalUrl(videoUrl); setStep(4); }}
              style={{ padding: "10px", borderRadius: 8, border: `1px solid ${C.border}`,
                background: "transparent", color: C.sub, cursor: "pointer",
                fontSize: 13, fontFamily: "inherit" }}>
              Skip lip sync → Download as is
            </button>
            <div style={{ fontSize: 11, color: C.sub, textAlign: "center" }}>SyncLabs lip sync</div>
          </div>
        )}

        {/* ── STEP 4: DONE ── */}
        {step === 4 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20,
            alignItems: "center", textAlign: "center" }}>
            <div style={{ fontSize: 72 }}>🎉</div>
            <h2 style={{ fontSize: 28, fontWeight: 800, margin: 0 }}>Your video is ready!</h2>
            <p style={{ color: C.sub, margin: 0, maxWidth: 400 }}>
              Download and post it anywhere. Share it. Go viral.
            </p>

            {(finalUrl || videoUrl) && (
              <video src={finalUrl || videoUrl} controls
                style={{ width: "100%", borderRadius: 16, maxHeight: 420, background: "#000" }} />
            )}

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center", width: "100%" }}>
              <a href={finalUrl || videoUrl} download="omnyra-video.mp4"
                style={{ flex: 1, minWidth: 160, padding: "14px", borderRadius: 10, fontWeight: 700,
                  background: "linear-gradient(105deg, #5A3400, #9A7010, #CFA42F, #E8C84A, #CFA42F, #9A7010, #5A3400)",
                  backgroundSize: "200% auto", animation: "metalShimmer 3s linear infinite",
                  color: "#0D0010", textDecoration: "none", fontSize: 15, textAlign: "center",
                  boxShadow: "0 0 20px rgba(207,164,47,0.25)" }}>
                Download Video ↓
              </a>
              <button onClick={reset}
                style={{ flex: 1, minWidth: 160, padding: "14px", borderRadius: 10, fontWeight: 700,
                  border: `1px solid ${C.border}`, background: "transparent",
                  color: C.sub, cursor: "pointer", fontSize: 15, fontFamily: "inherit" }}>
                Create Another
              </button>
            </div>
          </div>
        )}

      </div>
      </div>
    </div>
  );
}
