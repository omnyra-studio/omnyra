"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import AnimatedBackground from "@/components/AnimatedBackground";
import { getBrandProfile } from "../../../lib/brand";

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
  const [brand,    setBrand]   = useState(null);

  useEffect(() => { getBrandProfile().then(setBrand).catch(() => {}); }, []);

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
          brand,
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
      padding:"10px 14px", borderRadius:8,
      border:"1px solid rgba(204,171,175,0.25)",
      background:"#0D0010", color:"#C084FC", fontSize:14, width:"100%", cursor:"pointer",
      fontFamily:"inherit",
    }}>
      {opts.map(o => <option key={o}>{o}</option>)}
    </select>
  );

  return (
    <div style={{ minHeight:"100vh", background:"transparent", position:"relative", color:"#fff" }}>
      <AnimatedBackground />
      <div style={{ position:"relative", zIndex:1 }}>

      {/* HEADER */}
      <div style={{ borderBottom:"1px solid rgba(207,164,47,0.15)", padding:"1rem 2rem",
        display:"flex", alignItems:"center", gap:16, position:"sticky", top:0,
        background:"rgba(45,10,62,0.75)", backdropFilter:"blur(16px)", zIndex:40 }}>
        <span style={{ fontWeight:700, fontSize:20, background:"linear-gradient(90deg,#CFA42F,#E8B84B)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", marginRight:4 }}>
          Omnyra
        </span>
        <button onClick={() => router.push("/dashboard")} style={{
          background:"transparent", border:"none", color:"#aaa",
          cursor:"pointer", fontSize:20, lineHeight:1,
        }}>←</button>
        <div>
          <h1 style={{ fontSize:20, fontWeight:700, margin:0 }}>✍️ Script Studio</h1>
          <p style={{ fontSize:12, color:"#BBA8C8", margin:0 }}>AI-powered scripts for any platform</p>
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
            <label style={{ fontSize:11, color:"#BBA8C8", display:"block",
              marginBottom:6, textTransform:"uppercase", letterSpacing:"0.15em", fontWeight:600 }}>
              Topic / Idea *
            </label>
            <textarea
              value={topic}
              onChange={e => setTopic(e.target.value)}
              placeholder="e.g. 5 morning habits that changed my life"
              rows={4}
              style={{ padding:"12px 16px", borderRadius:10,
                border:"1px solid rgba(204,171,175,0.25)",
                background:"#0D0010", color:"#C084FC", fontSize:14, width:"100%",
                resize:"vertical", fontFamily:"inherit", lineHeight:1.6,
                boxSizing:"border-box", outline:"none" }}
            />
          </div>

          <div>
            <label style={{ fontSize:11, color:"#BBA8C8", display:"block",
              marginBottom:6, textTransform:"uppercase", letterSpacing:"0.15em", fontWeight:600 }}>Platform</label>
            <Dropdown opts={PLATFORMS} val={platform} set={setPlatform} />
          </div>

          <div>
            <label style={{ fontSize:11, color:"#BBA8C8", display:"block",
              marginBottom:6, textTransform:"uppercase", letterSpacing:"0.15em", fontWeight:600 }}>Duration</label>
            <Dropdown opts={DURATIONS} val={duration} set={setDuration} />
          </div>

          <div>
            <label style={{ fontSize:11, color:"#BBA8C8", display:"block",
              marginBottom:6, textTransform:"uppercase", letterSpacing:"0.15em", fontWeight:600 }}>Tone</label>
            <Dropdown opts={TONES} val={tone} set={setTone} />
          </div>

          {error && (
            <div style={{ background:"rgba(196,122,90,0.08)", border:"1px solid rgba(196,122,90,0.35)",
              borderRadius:8, padding:"10px 14px", color:"#CCABAF", fontSize:13 }}>
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
                ? "rgba(255,255,255,0.06)"
                : "linear-gradient(105deg, #5A3400, #9A7010, #CFA42F, #E8C84A, #CFA42F, #9A7010, #5A3400)",
              backgroundSize: !loading && topic.trim() ? "200% auto" : undefined,
              animation: !loading && topic.trim() ? "metalShimmer 3s linear infinite" : undefined,
              color: loading || !topic.trim() ? "#555" : "#0D0010",
              boxShadow: !loading && topic.trim() ? "0 0 20px rgba(207,164,47,0.25)" : undefined,
              transition:"all 0.2s", fontFamily:"inherit",
            }}>
            {loading ? "✨ Writing your script..." : "Generate Script →"}
          </button>

          {result && (
            <button onClick={() => { setResult(""); setTopic(""); setError(""); }}
              style={{ padding:"10px", borderRadius:8, border:"1px solid rgba(207,164,47,0.2)",
                background:"transparent", color:"#BBA8C8", fontSize:13, cursor:"pointer", fontFamily:"inherit" }}>
              Clear &amp; Start Over
            </button>
          )}
        </div>

        {/* RIGHT — OUTPUT */}
        <div style={{
          background: "rgba(75,30,130,0.65)", backdropFilter: "blur(16px)",
          borderRadius:16, border:"1px solid rgba(207,164,47,0.25)",
          minHeight:500, position:"relative", display:"flex", flexDirection:"column",
        }}>

          {/* OUTPUT HEADER */}
          <div style={{ padding:"1rem 1.5rem", borderBottom:"1px solid rgba(207,164,47,0.15)",
            display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <span style={{ fontSize:13, color:"#BBA8C8" }}>
              {result ? `Script ready — ${result.length} characters` : "Output"}
            </span>
            {result && (
              <button onClick={copy} style={{
                padding:"6px 16px", borderRadius:8,
                border: copied ? "1px solid rgba(207,164,47,0.6)" : "1px solid rgba(207,164,47,0.25)",
                background: copied ? "rgba(207,164,47,0.12)" : "transparent",
                color: copied ? "#F0C040" : "#BBA8C8",
                fontSize:12, cursor:"pointer", fontWeight:600,
                transition:"all 0.2s", fontFamily:"inherit",
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
                <div style={{ width:40, height:40, border:"3px solid rgba(207,164,47,0.15)",
                  borderTop:"3px solid #CFA42F", borderRadius:"50%",
                  animation:"spin 0.8s linear infinite" }} />
                <p style={{ color:"#BBA8C8", fontSize:14 }}>Writing your script...</p>
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
              </div>
            )}
            {!loading && !result && (
              <div style={{ display:"flex", flexDirection:"column", alignItems:"center",
                justifyContent:"center", height:"100%", gap:8, color:"#8A7D92" }}>
                <span style={{ fontSize:48 }}>✍️</span>
                <p style={{ fontSize:14, textAlign:"center", maxWidth:260, lineHeight:1.6 }}>
                  Fill in your topic, choose your platform and tone, then hit Generate.
                </p>
              </div>
            )}
            {result && !loading && (
              <pre style={{ whiteSpace:"pre-wrap", fontFamily:"inherit",
                fontSize:14, lineHeight:1.8, color:"#E8DEFF", margin:0 }}>
                {result}
              </pre>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
