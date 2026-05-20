"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

const PLATFORMS = ["TikTok","Instagram Reels","YouTube Shorts","YouTube","LinkedIn","Twitter/X","Podcast"];
const DURATIONS = ["15 seconds","30 seconds","60 seconds","90 seconds","3 minutes","5 minutes","10 minutes"];
const TONES     = ["Engaging","Professional","Funny","Educational","Inspirational","Casual","Storytelling"];

export default function ScriptStudio() {
  const router = useRouter();
  const [topic,    setTopic]   = useState("");
  const [platform, setPlatform]= useState("TikTok");
  const [duration, setDuration]= useState("60 seconds");
  const [tone,     setTone]    = useState("Engaging");
  const [result,   setResult]  = useState("");
  const [loading,  setLoading] = useState(false);
  const [copied,   setCopied]  = useState(false);
  const [error,    setError]   = useState("");

  async function generate() {
    if (!topic.trim()) return;
    setLoading(true); setResult(""); setError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session && { Authorization: `Bearer ${session.access_token}` }),
        },
        body: JSON.stringify({
          prompt: `Write a ${duration} ${platform} video script about: "${topic}".
Tone: ${tone}.
Format the script with these clear sections:
🎣 HOOK (first 3 seconds — grab attention immediately)
📖 MAIN CONTENT (key points, story, or value)
🎯 CALL TO ACTION (what should viewers do next)
Include stage directions in [brackets] where helpful.
Make it natural, conversational, and optimised for ${platform}.`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setResult(data.result || data.content || data.text || "");
    } catch (err) {
      setError(err.message || "Generation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function copy() {
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  const Dropdown = ({ opts, val, set }) => (
    <select value={val} onChange={e => set(e.target.value)} style={{
      padding:"10px 14px", borderRadius:8, border:"0.5px solid #2a2a2a",
      background:"#1a1a1a", color:"#fff", fontSize:14, width:"100%", cursor:"pointer",
    }}>
      {opts.map(o => <option key={o}>{o}</option>)}
    </select>
  );

  return (
    <div style={{ minHeight:"100vh", background:"#0a0a0a", color:"#fff" }}>

      {/* HEADER */}
      <div style={{ borderBottom:"0.5px solid #1a1a1a", padding:"1rem 2rem",
        display:"flex", alignItems:"center", gap:16 }}>
        <button onClick={() => router.push("/dashboard")} style={{
          background:"transparent", border:"none", color:"#555",
          cursor:"pointer", fontSize:20, lineHeight:1,
        }}>←</button>
        <div>
          <h1 style={{ fontSize:20, fontWeight:700, margin:0 }}>✍️ Script Studio</h1>
          <p style={{ fontSize:12, color:"#555", margin:0 }}>AI-powered scripts for any platform</p>
        </div>
      </div>

      {/* MAIN */}
      <div style={{
        display:"grid",
        gridTemplateColumns:"minmax(300px,420px) 1fr",
        gap:24,
        padding:"2rem",
        maxWidth:1200,
        margin:"0 auto",
      }}>

        {/* LEFT — INPUTS */}
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>

          <div>
            <label style={{ fontSize:11, color:"#666", display:"block",
              marginBottom:6, textTransform:"uppercase", letterSpacing:1.5 }}>
              Topic / Idea *
            </label>
            <textarea
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="e.g. 5 morning habits that changed my life"
              rows={4}
              style={{ padding:"12px 16px", borderRadius:10, border:"0.5px solid #2a2a2a",
                background:"#1a1a1a", color:"#fff", fontSize:14, width:"100%",
                resize:"vertical", fontFamily:"inherit", lineHeight:1.6,
                boxSizing:"border-box" }}
            />
          </div>

          <div>
            <label style={{ fontSize:11, color:"#666", display:"block",
              marginBottom:6, textTransform:"uppercase", letterSpacing:1.5 }}>Platform</label>
            <Dropdown opts={PLATFORMS} val={platform} set={setPlatform} />
          </div>

          <div>
            <label style={{ fontSize:11, color:"#666", display:"block",
              marginBottom:6, textTransform:"uppercase", letterSpacing:1.5 }}>Duration</label>
            <Dropdown opts={DURATIONS} val={duration} set={setDuration} />
          </div>

          <div>
            <label style={{ fontSize:11, color:"#666", display:"block",
              marginBottom:6, textTransform:"uppercase", letterSpacing:1.5 }}>Tone</label>
            <Dropdown opts={TONES} val={tone} set={setTone} />
          </div>

          {error && (
            <div style={{ background:"#2a1111", border:"0.5px solid #5a1f1f",
              borderRadius:8, padding:"10px 14px", color:"#f87171", fontSize:13 }}>
              {error}
            </div>
          )}

          <button
            onClick={generate}
            disabled={loading || !topic.trim()}
            style={{
              padding:"14px 20px", borderRadius:10, fontWeight:700, fontSize:15,
              border:"none", cursor: loading || !topic.trim() ? "not-allowed" : "pointer",
              background: loading || !topic.trim()
                ? "#1a1a1a"
                : "linear-gradient(135deg, #7c6fff, #06b6d4)",
              color: loading || !topic.trim() ? "#444" : "#fff",
              transition:"all 0.2s",
            }}>
            {loading ? "✨ Writing your script..." : "Generate Script →"}
          </button>

          {result && (
            <button onClick={() => { setResult(""); setTopic(""); setError(""); }}
              style={{ padding:"10px", borderRadius:8, border:"0.5px solid #333",
                background:"transparent", color:"#666", fontSize:13, cursor:"pointer" }}>
              Clear & Start Over
            </button>
          )}
        </div>

        {/* RIGHT — OUTPUT */}
        <div style={{ background:"#0f0f0f", borderRadius:16,
          border:"0.5px solid #1e1e1e", minHeight:500, position:"relative",
          display:"flex", flexDirection:"column" }}>

          {/* OUTPUT HEADER */}
          <div style={{ padding:"1rem 1.5rem", borderBottom:"0.5px solid #1a1a1a",
            display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span style={{ fontSize:13, color:"#555" }}>
              {result ? `Script ready — ${result.length} characters` : "Output"}
            </span>
            {result && (
              <button onClick={copy} style={{
                padding:"6px 16px", borderRadius:8,
                border:"0.5px solid " + (copied ? "#7c6fff" : "#333"),
                background: copied ? "#1a1133" : "transparent",
                color: copied ? "#7c6fff" : "#888",
                fontSize:12, cursor:"pointer", fontWeight:600,
                transition:"all 0.2s",
              }}>
                {copied ? "✓ Copied!" : "Copy Script"}
              </button>
            )}
          </div>

          {/* OUTPUT BODY */}
          <div style={{ padding:"1.5rem", flex:1, overflowY:"auto" }}>
            {loading && (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
                justifyContent:"center", height:"100%", gap:16 }}>
                <div style={{ width:40, height:40, border:"3px solid #1a1a1a",
                  borderTop:"3px solid #7c6fff", borderRadius:"50%",
                  animation:"spin 0.8s linear infinite" }} />
                <p style={{ color:"#555", fontSize:14 }}>Writing your script...</p>
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
              </div>
            )}
            {!loading && !result && (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
                justifyContent:"center", height:"100%", gap:8, color:"#333" }}>
                <span style={{ fontSize:48 }}>✍️</span>
                <p style={{ fontSize:14, textAlign:"center", maxWidth:260, lineHeight:1.6 }}>
                  Fill in your topic, choose your platform and tone, then hit Generate.
                </p>
              </div>
            )}
            {result && !loading && (
              <pre style={{ whiteSpace:"pre-wrap", fontFamily:"inherit",
                fontSize:14, lineHeight:1.8, color:"#e5e5e5", margin:0 }}>
                {result}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
