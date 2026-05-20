"use client";
import React, { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import {
  Sparkles, Video, User, Mic, Image as ImageIcon, Music, Wand2,
  FileText, Zap, Hash, Volume2, Palette, ChevronRight,
  ArrowLeft, Search, Bell, Settings, Crown, Play,
  Check, Flame, TrendingUp, BookOpen, Scale, GraduationCap,
  Lightbulb, Camera, Film, Layers, X, Upload, Copy,
  LogOut, HelpCircle, Sliders, Smartphone, Brain,
  CreditCard, Lock, Shield, RefreshCw, Clapperboard, Mic2, Square,
  Building2, Calendar, Send, Clock, ChevronLeft, LayoutGrid, Share2
} from "lucide-react";

/* Strips non-ISO-8859-1 characters from a header value string */
function sanitizeHeader(v) { return String(v).replace(/[^ -ÿ]/g, '') }

/* ── AUTHENTICATED FETCH — attaches the Supabase session token ── */
async function authFetch(url, opts = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const rawHeaders = {
    'Content-Type': 'application/json',
    ...(session && { Authorization: `Bearer ${session.access_token}` }),
    ...opts.headers,
  }
  const headers = {}
  for (const [k, v] of Object.entries(rawHeaders)) {
    headers[k] = sanitizeHeader(v)
  }
  return fetch(url, { ...opts, headers })
}

/* ── TOKENS ── */
const C = { bg:"#070710", text:"#f5f3ff", sub:"rgba(245,243,255,0.55)", violet:"#8b5cf6", cyan:"#22d3ee", gold:"#fbbf24" };

/* ── DATA ── */
const STYLES = [
  { id:"realistic",  label:"Realistic",        emoji:"🌍" },
  { id:"cinematic",  label:"Cinematic",         emoji:"🎬" },
  { id:"anime",      label:"Anime",             emoji:"✨" },
  { id:"cartoon",    label:"Cartoon",           emoji:"🎨" },
  { id:"futuristic", label:"Futuristic/Fantasy",emoji:"🔮" },
  { id:"meme",       label:"Meme",              emoji:"😂" }
];

const PLATFORMS = [
  { id:"tiktok",   label:"TikTok",         emoji:"🎵" },
  { id:"shorts",   label:"YouTube Shorts", emoji:"▶️" },
  { id:"reels",    label:"Instagram Reel", emoji:"📸" },
  { id:"youtube",  label:"YouTube Video",  emoji:"🎥" },
  { id:"podcast",  label:"Podcast",        emoji:"🎙️" },
  { id:"ad",       label:"Ad",             emoji:"📣" },
  { id:"story",    label:"Storytelling",   emoji:"📖" },
  { id:"edu",      label:"Educational",    emoji:"🎓" }
];

const TONES = [
  { id:"emotional",    label:"Emotional",    emoji:"😢" },
  { id:"funny",        label:"Funny",        emoji:"😂" },
  { id:"dramatic",     label:"Dramatic",     emoji:"🎭" },
  { id:"inspirational",label:"Inspirational",emoji:"✨" },
  { id:"luxury",       label:"Luxury",       emoji:"💎" },
  { id:"cinematic",    label:"Cinematic",    emoji:"🎬" },
  { id:"meme",         label:"Meme",         emoji:"🐸" },
  { id:"educational",  label:"Educational",  emoji:"📚" }
];

const LENGTHS = [
  { id:"30s", label:"30 sec", desc:"Hook-only · Free" },
  { id:"1min",label:"1 min",  desc:"Creator tier" },
  { id:"3min",label:"3 min",  desc:"Pro tier" },
  { id:"5min",label:"5 min",  desc:"Studio tier" }
];

const VOICE_STYLES = [
  { id:"viral",     label:"Viral Narrator",emoji:"🔥", desc:"TikTok storytelling energy" },
  { id:"cinematic", label:"Cinematic",     emoji:"🎬", desc:"Movie trailer gravitas" },
  { id:"meme",      label:"Meme Voice",    emoji:"😂", desc:"Funny exaggerated delivery" },
  { id:"edu",       label:"Educational",   emoji:"🧒", desc:"Simple friendly explainer" },
  { id:"futuristic",label:"Futuristic",    emoji:"🤖", desc:"AI cyberpunk style" },
  { id:"emotional", label:"Emotional",     emoji:"😢", desc:"Soft dramatic storytelling" }
];

const AVATAR_CATEGORIES = [
  { id:"realistic",  label:"Realistic",  emoji:"📸" },
  { id:"cartoon",    label:"Cartoon",    emoji:"🎨" },
  { id:"anime",      label:"Anime",      emoji:"🌸" },
  { id:"futuristic", label:"Futuristic", emoji:"🤖" },
  { id:"meme",       label:"Meme",       emoji:"😂" },
  { id:"faceless",   label:"Faceless",   emoji:"🎭" },
  { id:"edu",        label:"Educational",emoji:"🧒" },
  { id:"twin",       label:"Digital Twin",emoji:"📷" }
];

const AVATARS = [
  // Realistic (11)
  { id:1, cat:"realistic", name:"Maya",    role:"Business Woman",      emoji:"👩‍💼", desc:"Professional · 30s · Diverse",      colors:["#7c3aed","#4c1d95"] },
  { id:2, cat:"realistic", name:"Jordan",  role:"Casual Creator",      emoji:"🧑‍🎤", desc:"Trendy · 20s · Authentic",          colors:["#0891b2","#164e63"] },
  { id:3, cat:"realistic", name:"Marcus",  role:"Motivational Speaker",emoji:"🧑‍💼", desc:"Energetic · 40s · Commanding",      colors:["#b45309","#78350f"] },
  { id:4, cat:"realistic", name:"Zara",    role:"Luxury Influencer",   emoji:"👸", desc:"Glamorous · 20s · Aspirational",    colors:["#be185d","#831843"] },
  { id:5, cat:"realistic", name:"Alex",    role:"Gamer",               emoji:"🎮", desc:"Casual · 20s · Relatable",          colors:["#15803d","#14532d"] },
  { id:6, cat:"realistic", name:"Diana",   role:"Fitness Coach",       emoji:"💪", desc:"Athletic · 30s · High Energy",      colors:["#dc2626","#7f1d1d"] },
  { id:7, cat:"realistic", name:"Samuel",  role:"News Anchor",         emoji:"📺", desc:"Authoritative · 50s · Trustworthy", colors:["#1e40af","#1e3a8a"] },
  { id:8, cat:"realistic", name:"Priya",   role:"Lifestyle Creator",   emoji:"🌟", desc:"Vibrant · 25 · South Asian",        colors:["#d97706","#92400e"] },
  { id:9, cat:"realistic", name:"Carlos",  role:"Business Man",        emoji:"👨‍💼", desc:"Sharp · 35 · Latin",                colors:["#0f766e","#134e4a"] },
  { id:10,cat:"realistic", name:"Emma",    role:"Young Creator",       emoji:"🎯", desc:"Authentic · 22 · Gen Z",            colors:["#7e22ce","#4c1d95"] },
  { id:11,cat:"realistic", name:"Aiko",    role:"Tech Presenter",      emoji:"💻", desc:"Smart · 28 · Japanese",             colors:["#0369a1","#0c4a6e"] },
  // Cartoon (5)
  { id:12,cat:"cartoon",   name:"Sparky",  role:"Fun Creator",         emoji:"⚡", desc:"Colorful · High Energy",            colors:["#ea580c","#7c2d12"] },
  { id:13,cat:"cartoon",   name:"Bolt",    role:"Animated Influencer", emoji:"🌈", desc:"Dynamic · TikTok Native",           colors:["#7c3aed","#4c1d95"] },
  { id:14,cat:"cartoon",   name:"Pixel",   role:"Comic Character",     emoji:"🎮", desc:"Quirky · Gaming Vibe",              colors:["#15803d","#14532d"] },
  { id:15,cat:"cartoon",   name:"Zap",     role:"Adventure Hero",      emoji:"🦸", desc:"Bold · Action Style",               colors:["#b91c1c","#7f1d1d"] },
  { id:16,cat:"cartoon",   name:"Mochi",   role:"Cute Mascot",         emoji:"🌸", desc:"Adorable · Kids Content",           colors:["#be185d","#831843"] },
  // Anime (5)
  { id:17,cat:"anime",     name:"Sakura",  role:"Anime Girl",          emoji:"🌸", desc:"Magical · Classic Style",           colors:["#be185d","#831843"] },
  { id:18,cat:"anime",     name:"Cyber-X", role:"Cyber Anime",         emoji:"⚡", desc:"Futuristic · Neon",                 colors:["#0891b2","#164e63"] },
  { id:19,cat:"anime",     name:"Luna",    role:"Fantasy Anime",       emoji:"🌙", desc:"Mystical · Dark Fantasy",           colors:["#6d28d9","#4c1d95"] },
  { id:20,cat:"anime",     name:"Ryuu",    role:"Anime Hero",          emoji:"⚔️", desc:"Powerful · Shonen Style",           colors:["#b45309","#78350f"] },
  { id:21,cat:"anime",     name:"Hoshi",   role:"Magical Girl",        emoji:"✨", desc:"Sparkly · Viral Aesthetic",         colors:["#7e22ce","#4c1d95"] },
  // Futuristic (4)
  { id:22,cat:"futuristic",name:"HOLO-7",  role:"Hologram Host",       emoji:"💫", desc:"Ethereal · Blue Light",             colors:["#0891b2","#164e63"] },
  { id:23,cat:"futuristic",name:"NEON-X",  role:"Neon AI Presenter",   emoji:"🔆", desc:"Glowing · Cyberpunk",               colors:["#7c3aed","#4c1d95"] },
  { id:24,cat:"futuristic",name:"UNIT-9",  role:"Robot Influencer",    emoji:"🤖", desc:"Mechanical · Tech Aesthetic",       colors:["#374151","#111827"] },
  { id:25,cat:"futuristic",name:"CYPHER",  role:"Cyberpunk Creator",   emoji:"⚡", desc:"Dark · Neon Trim",                  colors:["#065f46","#022c22"] },
  // Meme (4)
  { id:26,cat:"meme",      name:"Bro Guy", role:"Reaction King",       emoji:"😱", desc:"Exaggerated · Viral",               colors:["#b45309","#78350f"] },
  { id:27,cat:"meme",      name:"Goofy",   role:"Chaos Host",          emoji:"🤪", desc:"Wild Energy · TikTok",              colors:["#15803d","#14532d"] },
  { id:28,cat:"meme",      name:"NPC",     role:"Viral Character",     emoji:"🎮", desc:"Blank · Internet Native",           colors:["#374151","#111827"] },
  { id:29,cat:"meme",      name:"Doomer",  role:"Dark Meme Presenter", emoji:"😔", desc:"Self-aware · Niche Humour",         colors:["#1e3a8a","#172554"] },
  // Faceless (4)
  { id:30,cat:"faceless",  name:"Hoodie",  role:"Shadow Creator",      emoji:"🕶️", desc:"Mysterious · Huge Niche",           colors:["#111827","#030712"] },
  { id:31,cat:"faceless",  name:"Phantom", role:"Masked Presenter",    emoji:"🎭", desc:"Enigmatic · Dramatic",              colors:["#1e3a8a","#172554"] },
  { id:32,cat:"faceless",  name:"Shadow",  role:"Narrator",            emoji:"🌑", desc:"Dark · Cinematic",                  colors:["#111827","#030712"] },
  { id:33,cat:"faceless",  name:"Void",    role:"Aesthetic Creator",   emoji:"✦",  desc:"Minimal · Clean Aesthetic",         colors:["#4c1d95","#2e1065"] },
  // Educational (5)
  { id:34,cat:"edu",       name:"Prof. Chen",role:"Science Host",      emoji:"🔬", desc:"Precise · Academic",                colors:["#1e40af","#1e3a8a"] },
  { id:35,cat:"edu",       name:"Ms. Davis",role:"Teacher",            emoji:"📚", desc:"Warm · Approachable",               colors:["#15803d","#14532d"] },
  { id:36,cat:"edu",       name:"Dr. Walker",role:"Medical Expert",    emoji:"🩺", desc:"Trustworthy · Clinical",            colors:["#0891b2","#164e63"] },
  { id:37,cat:"edu",       name:"Coach Ray",role:"Explainer Host",     emoji:"🎯", desc:"Friendly · Sports Analogy",         colors:["#b45309","#78350f"] },
  { id:38,cat:"edu",       name:"Scholar",  role:"Academic Presenter", emoji:"🎓", desc:"Intellectual · Deep Dives",         colors:["#7e22ce","#4c1d95"] }
];

const MODES = [
  { id:"viral",      name:"Viral",       emoji:"🔥", desc:"FYP hooks & retention",     icon:Flame,         color:"#f43f5e" },
  { id:"strategist", name:"Strategist",  emoji:"📈", desc:"Plans, calendars, growth",  icon:TrendingUp,    color:"#22d3ee" },
  { id:"research",   name:"Research",    emoji:"📚", desc:"Markets, trends, analysis", icon:BookOpen,      color:"#8b5cf6" },
  { id:"creator",    name:"Creator",     emoji:"🎨", desc:"Your creative partner",     icon:Palette,       color:"#fbbf24" },
  { id:"truth",      name:"Truth",       emoji:"⚖️", desc:"Evidence-first answers",    icon:Scale,         color:"#a3e635" },
  { id:"edu",        name:"Educational", emoji:"🧒", desc:"Explain like I'm 10",       icon:GraduationCap, color:"#60a5fa" },
  { id:"genius",     name:"Genius",      emoji:"🧠", desc:"Expert deep-dive analysis", icon:Brain,         color:"#e879f9" }
];

const TOOLS = [
  { id:"video",    name:"AI Video",          desc:"Idea → finished video",              icon:Video,        hue:"violet", category:"Video"   },
  { id:"avatar",   name:"Presenter Studio",  desc:"40 AI avatars + Digital Twin",       icon:User,         hue:"cyan",   category:"Video"   },
  { id:"lipsync",  name:"Lip Sync Studio",   desc:"Sync any face to audio",             icon:Mic,          hue:"violet", category:"Video"   },
  { id:"twin",     name:"Digital Twin",      desc:"Your AI presenter from one selfie",  icon:Camera,       hue:"cyan",   category:"Video"   },
  { id:"motion",   name:"Motion Studio AI",  desc:"Image to video generator",           icon:Clapperboard, hue:"gold",   category:"Video"   },
  { id:"image",    name:"AI Image",          desc:"Anime, logos, portraits",            icon:ImageIcon,    hue:"violet", category:"Visual"  },
  { id:"voice",    name:"AI Voice",          desc:"Text-to-speech & music",             icon:Volume2,      hue:"violet", category:"Audio"   },
  { id:"clone",    name:"Voice Clone Studio",desc:"Record or upload · Clone instantly", icon:Music,        hue:"cyan",   category:"Audio"   },
  { id:"script",   name:"Omnyra Script Studio",desc:"5 directions · voice-ready scripts",icon:FileText,   hue:"violet", category:"Writing" },
  { id:"oneclick", name:"Creator Hub",       desc:"Your full AI content production system", icon:Zap,      hue:"gold",   category:"Writing" },
  { id:"caption",  name:"Captions & Tags",   desc:"5 captions + hashtags instantly",    icon:Hash,         hue:"cyan",   category:"Writing" },
  { id:"prompt",   name:"Research Studio",   desc:"Your AI study & research partner",   icon:BookOpen,     hue:"violet", category:"Writing" },
  { id:"settings", name:"Brand Memory",      desc:"Save your brand voice · auto-injects into all tools", icon:Building2, hue:"gold", category:"Writing" },
];

const PLANS = [
  { name:"Free",    price:0,   period:"forever",  tag:null,
    credits:50,
    features:["50 credits / month","30 sec video max","Watermark on all exports","Scripts & research FREE","Slowest render queue","All 7 thinking modes"] },
  { name:"Creator", price:29,  period:"/ mo AUD", tag:null,
    credits:200,
    features:["200 credits / month","1 min video max","No watermark · HD exports","Scripts & research FREE","Standard render queue","Commercial rights"] },
  { name:"Pro",     price:69,  period:"/ mo AUD", tag:"POPULAR",
    credits:500,
    features:["500 credits / month","3 min video max","4K HD exports","Scripts & research FREE","Fast render queue · Priority","Premium voices & models","Commercial rights"] },
  { name:"Studio",  price:99,  period:"/ mo AUD", tag:"BEST",
    credits:1500,
    features:["1,500 credits / month","5 min video max","Highest quality exports","Scripts & research FREE","Fastest queue · Top priority","Premium voices + advanced workflows","Batch generation · Full commercial license"] }
];

const ONBOARDING = [
  { title:"Everything you create,\nin one place.",  body:"Videos, images, voice, scripts — from a single canvas. No more juggling subscriptions.", art:"orb" },
  { title:"Twelve tools.\nOne fluid workflow.",     body:"Creator Hub, Script Studio, Motion Studio, Voice Clone — all native to Omnyra. Scripts and research are always free.", art:"grid" },
  { title:"Seven minds.\nOne creator OS.",          body:"Viral 🔥 · Research 📚 · Truth ⚖️ · Creator 🎨 · Strategist 📈 · Educational 🧒 · Genius 🧠 — switch thinking modes on any tool.", art:"modes" }
];

/* ── HELPERS ── */
/* ── WATERMARK OVERLAY — Free tier only ── */
function WatermarkOverlay({ opacity = 0.85, plan }) {
  if (plan !== undefined && plan !== 'free') return null;
  return (
    <div style={{
      position:"absolute", bottom:0, left:0, right:0,
      display:"flex", flexDirection:"column", alignItems:"center",
      padding:"12px 16px 14px",
      background:"linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 70%, transparent 100%)",
      zIndex:10
    }}>
      {/* Omnyra watermark logo text */}
      <div style={{
        display:"flex", alignItems:"center", gap:8,
        padding:"6px 14px", borderRadius:100,
        background:"rgba(0,0,0,0.6)", backdropFilter:"blur(10px)",
        border:"1px solid rgba(255,255,255,0.15)"
      }}>
        {/* Spiral icon */}
        <svg width="18" height="18" viewBox="0 0 40 40" fill="none">
          <path d="M20 4 C10 4, 4 10, 4 20 C4 30, 10 36, 20 36 C28 36, 34 31, 35 24 C36 18, 32 14, 27 14 C22 14, 19 17, 19 21 C19 24, 21 26, 24 26 C26 26, 28 25, 28 23" stroke="url(#wg)" strokeWidth="3.5" strokeLinecap="round" fill="none"/>
          <defs>
            <linearGradient id="wg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#7c3aed"/>
              <stop offset="100%" stopColor="#22d3ee"/>
            </linearGradient>
          </defs>
        </svg>
        <div style={{display:"flex", flexDirection:"column", lineHeight:1}}>
          <span style={{fontSize:11, fontWeight:700, color:"#fff", letterSpacing:"0.08em"}}>OMNYRA</span>
          <span style={{fontSize:8, color:"rgba(255,255,255,0.55)", letterSpacing:"0.12em", marginTop:1}}>AI GENERATED · FREE TIER</span>
        </div>
      </div>
    </div>
  );
}

function Toast({ message, visible }) {
  if (!visible) return null;
  return <div style={{ position:"fixed", bottom:100, left:"50%", transform:"translateX(-50%)", padding:"10px 20px", borderRadius:100, zIndex:9999, background:"linear-gradient(135deg,rgba(139,92,246,0.95),rgba(34,211,238,0.85))", backdropFilter:"blur(20px)", fontSize:13, fontWeight:500, color:"#fff", display:"flex", alignItems:"center", gap:8, whiteSpace:"nowrap", boxShadow:"0 8px 32px rgba(139,92,246,0.5)", animation:"slideUp 0.3s ease" }}><Check size={14} /> {message}</div>;
}

function PressBtn({ onClick, style:s, children, disabled }) {
  const [p, setP] = useState(false);
  return <button onPointerDown={()=>setP(true)} onPointerUp={()=>{setP(false);if(!disabled)onClick?.();}} onPointerLeave={()=>setP(false)} style={{ ...s, transform:p?"scale(0.95)":"scale(1)", filter:p?"brightness(1.2)":"none", transition:"transform 0.1s,filter 0.1s,background 0.2s,border 0.2s", cursor:disabled?"not-allowed":"pointer" }}>{children}</button>;
}

const labelStyle    = { fontSize:10, color:C.sub, letterSpacing:"0.1em", textTransform:"uppercase", fontWeight:500 };
const iconChipStyle = { width:38, height:38, borderRadius:12, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)", backdropFilter:"blur(20px)", display:"flex", alignItems:"center", justifyContent:"center", color:C.text, fontFamily:"inherit" };
const primaryBtn    = { padding:"10px 18px", borderRadius:100, background:"linear-gradient(135deg,#8b5cf6,#22d3ee)", color:"#fff", border:"none", fontSize:13, fontWeight:500, display:"inline-flex", alignItems:"center", gap:6, fontFamily:"inherit", boxShadow:"0 8px 24px -8px rgba(139,92,246,0.6)" };
const ghostBtn      = { padding:"8px 14px", borderRadius:100, background:"rgba(255,255,255,0.04)", color:C.text, border:"1px solid rgba(255,255,255,0.08)", fontSize:12, fontWeight:500, display:"inline-flex", alignItems:"center", gap:6, fontFamily:"inherit", backdropFilter:"blur(20px)" };

/* ── FORMATTED TEXT ── */
function FormattedText({ text }) {
  if (!text) return null;
  const HEADERS = ["HOOK","BODY","CAPTION","HASHTAGS","CTA","SCRIPT","SCENE PLAN","VOICE STYLE","AUDIO MOOD","RETENTION NOTES","THUMBNAIL IDEA","CALL TO ACTION","VIDEO SCRIPT","RESULT","OVERVIEW"];
  const LC = { HOOK:"#22d3ee",BODY:"#a78bfa",CAPTION:"#22d3ee",HASHTAGS:"#fbbf24","CALL TO ACTION":"#f43f5e",CTA:"#f43f5e",SCRIPT:"#a78bfa","SCENE PLAN":"#60a5fa","VOICE STYLE":"#fbbf24","AUDIO MOOD":"#a3e635","RETENTION NOTES":"#f43f5e","THUMBNAIL IDEA":"#60a5fa",RESULT:"#a78bfa" };
  return <div>{text.split('\n').map((line,i) => {
    if (!line.trim()) return <div key={i} style={{height:8}}/>;
    const h = HEADERS.find(h => line.trim().toUpperCase().startsWith(h));
    if (h) return <div key={i} style={{fontSize:10,fontWeight:700,letterSpacing:"0.12em",color:LC[h]||"#a78bfa",textTransform:"uppercase",marginTop:10,marginBottom:5}}>{line.trim().replace(/:$/,'')}</div>;
    if (line.trim().startsWith('#') && !line.trim().startsWith('# ')) return <div key={i} style={{fontSize:13,color:"#fbbf24",fontWeight:500,marginBottom:3}}>{line.trim()}</div>;
    if (/^\d+\./.test(line.trim())) return <div key={i} style={{fontSize:14,lineHeight:1.7,color:C.text,display:"flex",gap:8,marginBottom:4}}><span style={{color:C.cyan,fontWeight:600,minWidth:20}}>{line.trim().match(/^\d+/)[0]}.</span><span>{line.trim().replace(/^\d+\.\s*/,'').replace(/\*\*(.*?)\*\*/g,'$1')}</span></div>;
    if (line.trim().startsWith('- ')||line.trim().startsWith('• ')) return <div key={i} style={{fontSize:14,lineHeight:1.7,color:C.text,display:"flex",gap:8,marginBottom:4}}><span style={{color:C.violet,minWidth:12}}>•</span><span>{line.trim().replace(/^[-•]\s*/,'').replace(/\*\*(.*?)\*\*/g,'$1')}</span></div>;
    return <div key={i} style={{fontSize:14,lineHeight:1.75,color:C.text,marginBottom:4}}>{line.replace(/\*\*(.*?)\*\*/g,'$1').replace(/\*(.*?)\*/g,'$1').replace(/^#+\s/,'')}</div>;
  })}</div>;
}

/* ── MODE GRID ── */
function ModeGrid({ mode, setMode }) {
  const rows = [MODES.slice(0,3), MODES.slice(3,6)];
  const genius = MODES[6];
  const Chip = ({m}) => {
    const a = mode===m.id;
    return <PressBtn onClick={()=>setMode(m.id)} style={{ flex:1, padding:"10px 6px", borderRadius:14, background:a?`${m.color}20`:"rgba(255,255,255,0.04)", border:a?`1.5px solid ${m.color}70`:"1px solid rgba(255,255,255,0.08)", color:a?m.color:C.sub, display:"flex", flexDirection:"column", alignItems:"center", gap:4, fontFamily:"inherit" }}>
      <span style={{fontSize:18}}>{m.emoji}</span>
      <span style={{fontSize:10,fontWeight:a?600:400,textAlign:"center"}}>{m.name}</span>
    </PressBtn>;
  };
  return (
    <div style={{marginTop:14}}>
      <div style={{fontSize:10,color:C.sub,letterSpacing:"0.12em",textTransform:"uppercase",fontWeight:600,marginBottom:10}}>Omnyra Specialized AI Thinking Modes</div>
      {rows.map((row,ri)=><div key={ri} style={{display:"flex",gap:6,marginBottom:6}}>{row.map(m=><Chip key={m.id} m={m}/>)}</div>)}
      <PressBtn onClick={()=>setMode(genius.id)} style={{ width:"100%", padding:"12px 18px", borderRadius:14, background:mode===genius.id?"linear-gradient(135deg,rgba(232,121,249,0.2),rgba(139,92,246,0.15))":"rgba(232,121,249,0.06)", border:mode===genius.id?"1.5px solid rgba(232,121,249,0.6)":"1px solid rgba(232,121,249,0.2)", display:"flex", alignItems:"center", gap:12, color:mode===genius.id?"#e879f9":C.sub, fontFamily:"inherit" }}>
        <span style={{fontSize:22}}>🧠</span>
        <div style={{textAlign:"left"}}><div style={{fontSize:13,fontWeight:mode===genius.id?700:500,color:mode===genius.id?"#e879f9":C.text}}>Genius Mode</div><div style={{fontSize:11,marginTop:1}}>Expert deep-dive · Top 1% insights</div></div>
        {mode===genius.id&&<div style={{marginLeft:"auto"}}><Check size={16} color="#e879f9"/></div>}
      </PressBtn>
    </div>
  );
}

/* ── STYLE PICKER (3-col grid) ── */
function StylePicker({ style, setStyle }) {
  return (
    <div style={{marginTop:14}}>
      <label style={labelStyle}>Style</label>
      <div style={{marginTop:8,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
        {STYLES.map(s=>{
          const a=style===s.id;
          return <PressBtn key={s.id} onClick={()=>setStyle(s.id)} style={{padding:"10px 8px",borderRadius:14,background:a?"linear-gradient(135deg,rgba(139,92,246,0.3),rgba(34,211,238,0.2))":"rgba(255,255,255,0.04)",border:a?"1px solid rgba(139,92,246,0.5)":"1px solid rgba(255,255,255,0.08)",color:a?"#fff":C.sub,display:"flex",flexDirection:"column",alignItems:"center",gap:4,fontFamily:"inherit"}}>
            <span style={{fontSize:18}}>{s.emoji}</span>
            <span style={{fontSize:10,textAlign:"center"}}>{s.label}</span>
          </PressBtn>;
        })}
      </div>
    </div>
  );
}

/* ── REGEN BUTTON ── */
function RegenBtn({ label, onClick, loading }) {
  return <PressBtn onClick={onClick} style={{ padding:"4px 10px", borderRadius:100, background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.12)", color:C.sub, fontSize:10, fontFamily:"inherit", display:"inline-flex", alignItems:"center", gap:4, flexShrink:0 }}>
    {loading ? <div style={{width:10,height:10,borderRadius:"50%",border:"1.5px solid rgba(255,255,255,0.3)",borderTopColor:"#fff",animation:"spin 1s linear infinite"}}/> : <RefreshCw size={10}/>}
    Redo
  </PressBtn>;
}

/* ── RESULT SECTION ── */
function ResultSection({ label, value, color, onRegen, regenLoading }) {
  if (!value) return null;
  const display = Array.isArray(value) ? value : value;
  return (
    <div style={{marginBottom:16, padding:16, borderRadius:18, background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.07)"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.12em",color:color||"#a78bfa",textTransform:"uppercase"}}>{label}</div>
        {onRegen && <RegenBtn onClick={onRegen} loading={regenLoading}/>}
      </div>
      {Array.isArray(display) ? (
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {display.map((tag,i)=><span key={i} style={{fontSize:12,color:"#fbbf24",background:"rgba(251,191,36,0.1)",padding:"3px 10px",borderRadius:100,border:"1px solid rgba(251,191,36,0.2)"}}>{tag}</span>)}
        </div>
      ) : (
        <div style={{fontSize:14,lineHeight:1.7,color:C.text,whiteSpace:"pre-line"}}>{display}</div>
      )}
    </div>
  );
}

/* ── ROOT ── */
export default function OmnyraApp() {
  const [stage,setStage] = useState("splash");
  const [screen,setScreen]         = useState("home");
  const [subScreen,setSubScreen]   = useState(null);
  const [activeTool,setActiveTool] = useState(null);
  const [mode,setMode]             = useState("creator");
  const [searchOpen,setSearchOpen] = useState(false);
  const [notifOpen,setNotifOpen]   = useState(false);
  const [toast,setToast]           = useState({visible:false,message:""});

  // On mount: show splash, then resolve to the right stage based on session + localStorage
  useEffect(() => {
    const resolve = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        setStage("app");
      } else {
        setStage("login");
      }
    };
    const t = setTimeout(resolve, 1800);
    return () => clearTimeout(t);
  }, []);

  // React to auth changes (sign-in from inline form, token refresh, sign-out)
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        if (!localStorage.getItem("omnyra_onboarded")) setStage("onboard");
        else setStage("app");
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const showToast = msg => { setToast({visible:true,message:msg}); setTimeout(()=>setToast({visible:false,message:""}),2200); };

  return (
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:'"Instrument Sans","Inter",-apple-system,sans-serif',overflow:"hidden",position:"relative"}}>
      <GlobalStyles/><Atmosphere/>
      <Toast message={toast.message} visible={toast.visible}/>
      <div style={{maxWidth:440,margin:"0 auto",minHeight:"100vh",position:"relative",zIndex:1}}>
        {stage==="splash"  && <Splash/>}
        {stage==="onboard" && <Onboarding onDone={()=>setStage("paywall")}/>}
        {stage==="paywall" && <Paywall onDone={()=>{ localStorage.setItem("omnyra_onboarded","1"); setStage("app"); }} showToast={showToast}/>}
        {stage==="login"   && <LoginGate onDone={()=>setStage("app")}/>}
        {stage==="app" && (
          <>
            {searchOpen && <SearchOverlay onClose={()=>setSearchOpen(false)} onTool={t=>{setActiveTool(t);setSearchOpen(false);}}/>}
            {notifOpen  && <NotifOverlay  onClose={()=>setNotifOpen(false)} showToast={showToast}/>}
            {!searchOpen&&!notifOpen&&(
              <AppShell screen={screen} setScreen={setScreen} subScreen={subScreen} setSubScreen={setSubScreen} activeTool={activeTool} setActiveTool={setActiveTool} mode={mode} setMode={setMode} onSearch={()=>setSearchOpen(true)} onNotif={()=>setNotifOpen(true)} showToast={showToast}/>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Atmosphere() {
  return (
    <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:0,overflow:"hidden"}}>
      <div style={{position:"absolute",top:"-20%",left:"-10%",width:"70%",height:"60%",background:"radial-gradient(circle,rgba(139,92,246,0.35) 0%,transparent 60%)",filter:"blur(80px)",animation:"drift1 22s ease-in-out infinite"}}/>
      <div style={{position:"absolute",bottom:"-20%",right:"-10%",width:"70%",height:"60%",background:"radial-gradient(circle,rgba(34,211,238,0.28) 0%,transparent 60%)",filter:"blur(80px)",animation:"drift2 26s ease-in-out infinite"}}/>
      <div style={{position:"absolute",top:"30%",right:"20%",width:"30%",height:"30%",background:"radial-gradient(circle,rgba(251,191,36,0.12) 0%,transparent 70%)",filter:"blur(60px)",animation:"drift3 30s ease-in-out infinite"}}/>
    </div>
  );
}

function Splash() {
  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",animation:"fadeIn 0.6s ease"}}>
      <Orb size={140}/>
      <div style={{marginTop:36,fontSize:34,fontWeight:300,letterSpacing:"-0.04em",animation:"slideUp 0.8s 0.3s both"}}>
        Omnyra <span style={{background:"linear-gradient(135deg,#22d3ee,#8b5cf6)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",fontWeight:500}}>AI</span>
      </div>
      <div style={{marginTop:12,fontSize:13,color:C.sub,animation:"slideUp 0.8s 0.5s both"}}>The Creator OS</div>
    </div>
  );
}

function Onboarding({ onDone }) {
  const [i,setI]=useState(0);
  const slide=ONBOARDING[i];
  const next=()=>i<ONBOARDING.length-1?setI(i+1):onDone();
  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",padding:"60px 28px 40px"}}>
      <div style={{display:"flex",justifyContent:"flex-end"}}><PressBtn onClick={onDone} style={ghostBtn}>Skip</PressBtn></div>
      <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}>
        <div key={i} style={{animation:"fadeSlide 0.5s ease"}}>
          {slide.art==="orb"   && <Orb size={180}/>}
          {slide.art==="grid"  && <ToolGridArt/>}
          {slide.art==="modes" && <ModesArtComp/>}
        </div>
      </div>
      <div key={`t-${i}`} style={{animation:"slideUp 0.5s ease"}}>
        <h1 style={{fontSize:32,fontWeight:300,letterSpacing:"-0.035em",lineHeight:1.1,whiteSpace:"pre-line",margin:0}}>{slide.title}</h1>
        <p style={{marginTop:16,fontSize:15,color:C.sub,lineHeight:1.55}}>{slide.body}</p>
      </div>
      <div style={{marginTop:32,display:"flex",alignItems:"center",gap:14}}>
        <div style={{display:"flex",gap:6}}>{ONBOARDING.map((_,idx)=><div key={idx} style={{height:6,borderRadius:3,width:idx===i?24:6,background:idx===i?"linear-gradient(90deg,#8b5cf6,#22d3ee)":"rgba(255,255,255,0.15)",transition:"all 0.4s"}}/>)}</div>
        <div style={{flex:1}}/>
        <PressBtn onClick={next} style={primaryBtn}>{i===ONBOARDING.length-1?"Enter":"Next"} <ChevronRight size={18}/></PressBtn>
      </div>
    </div>
  );
}
function ToolGridArt() {
  const icons=[Video,ImageIcon,Mic,FileText,Wand2,Hash,Volume2,Camera,Music];
  return <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14,width:260}}>{icons.map((Ic,i)=><div key={i} style={{aspectRatio:"1",borderRadius:18,background:i===4?"linear-gradient(135deg,rgba(139,92,246,0.4),rgba(34,211,238,0.3))":"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",display:"flex",alignItems:"center",justifyContent:"center",animation:`pop 0.5s ${i*0.06}s both`}}><Ic size={22} color={i===4?"#fff":"rgba(255,255,255,0.5)"} strokeWidth={1.5}/></div>)}</div>;
}
function ModesArtComp() {
  return (
    <div style={{width:300}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
        {MODES.slice(0,6).map((m,i)=>(
          <div key={m.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:16,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",animation:`pop 0.5s ${i*0.06}s both`}}>
            <div style={{fontSize:18}}>{m.emoji}</div>
            <div style={{fontSize:12,fontWeight:500}}>{m.name}</div>
          </div>
        ))}
      </div>
      {/* Genius featured full width */}
      <div style={{display:"flex",alignItems:"center",gap:10,padding:"12px 16px",borderRadius:16,background:"linear-gradient(135deg,rgba(232,121,249,0.2),rgba(139,92,246,0.15))",border:"1px solid rgba(232,121,249,0.4)",animation:"pop 0.5s 0.4s both"}}>
        <div style={{fontSize:22}}>🧠</div>
        <div>
          <div style={{fontSize:13,fontWeight:600,color:"#e879f9"}}>Genius Mode</div>
          <div style={{fontSize:11,color:"rgba(232,121,249,0.7)"}}>Expert deep-dive · Top 1% insights</div>
        </div>
      </div>
    </div>
  );
}

function Paywall({ onDone, showToast }) {
  const [sel,setSel]=useState("Pro");
  const [loading,setLoading]=useState(false);

  const handleContinue = async () => {
    if (sel==="Free") { onDone(); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/stripe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({plan:sel})});
      const data = await res.json();
      if (data.url) { localStorage.setItem("omnyra_onboarded","1"); window.location.href=data.url; } else { showToast("Payment unavailable — try again"); setLoading(false); }
    } catch { showToast("Connection failed"); setLoading(false); }
  };

  return (
    <div style={{minHeight:"100vh",padding:"50px 24px 36px",display:"flex",flexDirection:"column"}}>
      <PressBtn onClick={onDone} style={{...ghostBtn,alignSelf:"flex-start",padding:8}}><X size={20}/></PressBtn>
      <div style={{marginTop:12}}>
        <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 12px",borderRadius:100,background:"linear-gradient(135deg,rgba(139,92,246,0.2),rgba(34,211,238,0.15))",border:"1px solid rgba(139,92,246,0.3)",fontSize:11,fontWeight:500,letterSpacing:"0.05em",textTransform:"uppercase"}}><Crown size={12} color={C.gold}/> Choose your plan</div>
        <h1 style={{marginTop:16,fontSize:30,fontWeight:300,letterSpacing:"-0.035em",lineHeight:1.1}}>Create without limits.</h1>
        <p style={{marginTop:10,fontSize:14,color:C.sub}}>Replace your entire creator stack. Cancel anytime.</p>
      </div>
      <div style={{marginTop:26,display:"flex",flexDirection:"column",gap:10,flex:1}}>
        {PLANS.map(p=>(
          <PressBtn key={p.name} onClick={()=>setSel(p.name)} style={{textAlign:"left",padding:18,borderRadius:22,background:sel===p.name?"linear-gradient(135deg,rgba(139,92,246,0.18),rgba(34,211,238,0.12))":"rgba(255,255,255,0.03)",border:sel===p.name?"1px solid rgba(139,92,246,0.5)":"1px solid rgba(255,255,255,0.06)",position:"relative",color:C.text,fontFamily:"inherit",width:"100%"}}>
            {p.tag&&<div style={{position:"absolute",top:14,right:14,padding:"3px 8px",borderRadius:8,fontSize:10,fontWeight:600,background:p.tag==="BEST"?"linear-gradient(135deg,#22d3ee,#8b5cf6)":"linear-gradient(135deg,#fbbf24,#f59e0b)",color:"#0a0a0a"}}>{p.tag}</div>}
            <div style={{display:"flex",alignItems:"baseline",gap:8}}><span style={{fontSize:18,fontWeight:500}}>{p.name}</span><span style={{fontSize:22,fontWeight:300}}>${p.price}</span><span style={{fontSize:12,color:C.sub}}>{p.period}</span></div>
            <div style={{marginTop:8,display:"inline-flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:100,background:"rgba(139,92,246,0.15)",border:"1px solid rgba(139,92,246,0.25)",fontSize:11,color:"#a78bfa"}}>⚡ {p.credits}  credits/month</div>
            <div style={{marginTop:8,fontSize:12,color:C.sub,lineHeight:1.7}}>{p.features.slice(0,3).join(" · ")}</div>
          </PressBtn>
        ))}
      </div>
      <PressBtn onClick={handleContinue} disabled={loading} style={{...primaryBtn,marginTop:18,justifyContent:"center",width:"100%",opacity:loading?0.7:1}}>
        {loading?<><div style={{width:16,height:16,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"#fff",animation:"spin 1s linear infinite"}}/>Redirecting…</>:<>Continue with {sel} <ChevronRight size={18}/></>}
      </PressBtn>
      <div style={{marginTop:12,padding:"12px 16px",borderRadius:14,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",fontSize:11,color:C.sub,textAlign:"center",lineHeight:1.6}}>
        ✍️ Scripts & Research always FREE · Cancel anytime · Prices in AUD
      </div>
    </div>
  );
}

function AppShell({ screen, setScreen, subScreen, setSubScreen, activeTool, setActiveTool, mode, setMode, onSearch, onNotif, showToast }) {
  const router = useRouter();
  const [credits, setCredits] = useState(null);
  const [plan, setPlan]       = useState('free');
  const [brand, setBrand] = useState(null);
  const [brandPanelOpen, setBrandPanelOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [canInstall, setCanInstall] = useState(false);

  const refreshCredits = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/credits', { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (res.ok) {
        const d = await res.json();
        setCredits(d.balance);
        if (d.plan) setPlan(d.plan);
      }
    } catch {}
  };

  const loadBrand = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch('/api/brand', { headers: { Authorization: `Bearer ${session.access_token}` } });
      if (res.ok) {
        const data = await res.json();
        if (data?.brand_name || data?.tone_of_voice || data?.niche) setBrand(data);
      }
    } catch {}
  };

  useEffect(() => {
    if (typeof window !== 'undefined' && !window.matchMedia('(display-mode: standalone)').matches) {
      const onPrompt = (e) => { e.preventDefault(); setInstallPrompt(e); setCanInstall(true); };
      window.addEventListener('beforeinstallprompt', onPrompt);
      window.addEventListener('appinstalled', () => setCanInstall(false));
      return () => window.removeEventListener('beforeinstallprompt', onPrompt);
    }
  }, []);

  useEffect(() => {
    refreshCredits();
    loadBrand();
    // Handle OAuth callback redirects
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const connected = params.get('social_connected');
      const socialError = params.get('social_error');
      if (connected) {
        showToast(`${connected.charAt(0).toUpperCase()+connected.slice(1)} connected! 🎉`);
        window.history.replaceState({}, '', window.location.pathname);
      }
      if (socialError) {
        showToast(`Connection failed: ${socialError}`);
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, []);

  const handleInstall = async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
    setCanInstall(false);
  };

  const saveToLibrary = async (type, pipelineState) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { showToast('Sign in to save'); return; }
      const res = await fetch('/api/library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ type, pipeline_state: pipelineState }),
      });
      if (res.ok) showToast('Saved to Library ✓');
      else showToast('Save failed — try again');
    } catch { showToast('Connection failed'); }
  };

  // Called after any generation; refreshes the displayed balance.
  // Deduction now happens server-side inside each generation route.
  const onGenerated = async (newBalance) => {
    if (typeof newBalance === 'number') { setCredits(newBalance); return; }
    await refreshCredits();
  };

  if (brandPanelOpen) return <BrandPanel onClose={(saved) => { if (saved) setBrand(saved); setBrandPanelOpen(false); }} showToast={showToast}/>;
  if (activeTool?.id==="oneclick") return <OneClickFlow mode={mode} setMode={setMode} onBack={()=>setActiveTool(null)} showToast={showToast} brand={brand} onSave={saveToLibrary}/>;
  if (activeTool?.id==="script")   { router.push('/dashboard/script'); return null; }
  if (activeTool?.id==="settings") { router.push('/dashboard/settings'); return null; }
  if (activeTool?.id==="avatar")   return <AvatarStudio  mode={mode} onBack={()=>setActiveTool(null)} showToast={showToast} plan={plan}/>;
  if (activeTool?.id==="video")    return <VideoTool    onBack={()=>setActiveTool(null)} showToast={showToast} onGenerated={onGenerated} plan={plan}/>;
  if (activeTool?.id==="lipsync")  return <LipSyncStudio    onBack={()=>setActiveTool(null)} showToast={showToast} onGenerated={onGenerated} plan={plan}/>;
  if (activeTool?.id==="twin")     return <DigitalTwinStudio onBack={()=>setActiveTool(null)} showToast={showToast} onGenerated={onGenerated}/>;
  if (activeTool?.id==="image")    return <ImageTool    onBack={()=>setActiveTool(null)} showToast={showToast} onGenerated={onGenerated} plan={plan}/>;
  if (activeTool?.id==="voice")    return <VoiceTool onBack={()=>setActiveTool(null)} showToast={showToast} onGenerated={onGenerated}/>;
  if (activeTool?.id==="clone")    return <VoiceCloneStudio mode={mode} setMode={setMode} onBack={()=>setActiveTool(null)} showToast={showToast}/>;
  if (activeTool?.id==="motion")   return <MotionStudio  mode={mode} setMode={setMode} onBack={()=>setActiveTool(null)} showToast={showToast} onGenerated={onGenerated} plan={plan}/>;
  if (activeTool?.id==="caption")  return <CaptionTool   mode={mode} setMode={setMode} onBack={()=>setActiveTool(null)} showToast={showToast} brand={brand}/>;
  if (activeTool)                  return <GenericTool   tool={activeTool} mode={mode} setMode={setMode} onBack={()=>setActiveTool(null)} showToast={showToast} brand={brand}/>;
  if (subScreen)                   return <SubScreen     name={subScreen} onBack={()=>setSubScreen(null)} showToast={showToast}/>;
  return (
    <div style={{minHeight:"100vh",paddingBottom:100}}>
      {screen==="home"    && <Home onTool={setActiveTool} mode={mode} setMode={setMode} onSearch={onSearch} onNotif={onNotif} credits={credits} brand={brand} onBrandPanel={()=>setBrandPanelOpen(true)} canInstall={canInstall} onInstall={handleInstall}/>}
      {screen==="studio"  && <Studio onTool={setActiveTool}/>}
      {screen==="library" && <Library showToast={showToast}/>}
      {screen==="profile" && <Profile onSub={setSubScreen} showToast={showToast} onBrandPanel={()=>setBrandPanelOpen(true)} brand={brand}/>}
      <TabBar screen={screen} setScreen={setScreen}/>
    </div>
  );
}

/* ── SEARCH ── */
function SearchOverlay({ onClose, onTool }) {
  const [q,setQ]=useState("");
  const f=q?TOOLS.filter(t=>t.name.toLowerCase().includes(q.toLowerCase())||t.desc.toLowerCase().includes(q.toLowerCase())):TOOLS;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(7,7,16,0.95)",backdropFilter:"blur(20px)",zIndex:100,padding:"60px 20px 20px",animation:"fadeIn 0.2s ease"}}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
        <div style={{flex:1,display:"flex",alignItems:"center",gap:10,padding:"12px 16px",borderRadius:16,background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)"}}>
          <Search size={16} color={C.sub}/>
          <input autoFocus value={q} onChange={e=>setQ(e.target.value)} placeholder="Search tools…" style={{flex:1,background:"transparent",border:"none",outline:"none",color:C.text,fontSize:15,fontFamily:"inherit"}}/>
        </div>
        <PressBtn onClick={onClose} style={ghostBtn}><X size={18}/></PressBtn>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,overflowY:"auto",maxHeight:"calc(100vh - 160px)"}}>
        {f.map(t=><ToolCard key={t.id} tool={t} onClick={()=>onTool(t)}/>)}
      </div>
    </div>
  );
}

function NotifOverlay({ onClose, showToast }) {
  const ns=[
    {icon:"✦",title:"Claude API connected",sub:"Generating real AI responses",time:"Just now",color:"#22d3ee"},
    {icon:"🧠",title:"Genius Mode active",sub:"Expert deep-dive unlocked",time:"1h ago",color:"#e879f9"},
    {icon:"🎬",title:"Script Studio ready",sub:"5 directions per topic",time:"Today",color:"#a78bfa"},
    {icon:"🎤",title:"Voice Clone Studio",sub:"Record 30s to clone your voice",time:"Today",color:"#fbbf24"}
  ];
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(7,7,16,0.95)",backdropFilter:"blur(20px)",zIndex:100,padding:"60px 20px 20px",animation:"fadeIn 0.2s ease",overflowY:"auto"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
        <h2 style={{margin:0,fontSize:22,fontWeight:300}}>Credits</h2>
        <PressBtn onClick={onClose} style={ghostBtn}><X size={18}/></PressBtn>
      </div>

      {/* Balance */}
      <div style={{padding:"18px 20px",borderRadius:22,background:"linear-gradient(135deg,rgba(139,92,246,0.2),rgba(34,211,238,0.15))",border:"1px solid rgba(139,92,246,0.35)",marginBottom:16,marginTop:12}}>
        <div style={{fontSize:11,color:C.sub,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:6}}>Current balance</div>
        <div style={{display:"flex",alignItems:"baseline",gap:8}}>
          <div style={{fontSize:42,fontWeight:300,color:"#fff"}}>142</div>
          <div style={{fontSize:14,color:C.sub}}>credits remaining</div>
        </div>
        <div style={{marginTop:8,fontSize:12,color:C.sub}}>Pro plan · Resets in 18 days · 300  credits/month</div>
        <div style={{marginTop:10,height:6,borderRadius:3,background:"rgba(255,255,255,0.1)",overflow:"hidden"}}>
          <div style={{height:"100%",width:"47%",background:"linear-gradient(90deg,#8b5cf6,#22d3ee)",borderRadius:3}}/>
        </div>
        <div style={{marginTop:5,fontSize:10,color:C.sub}}>158 used · 142 remaining</div>
      </div>

      {/* Action buttons */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
        <PressBtn onClick={()=>showToast("Upgrade — coming soon!")} style={{padding:"14px 16px",borderRadius:18,background:"linear-gradient(135deg,rgba(251,191,36,0.2),rgba(251,191,36,0.08))",border:"1px solid rgba(251,191,36,0.3)",color:C.gold,fontFamily:"inherit",display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
          <Crown size={20} color={C.gold}/>
          <div style={{fontSize:12,fontWeight:600}}>Upgrade Plan</div>
          <div style={{fontSize:10,color:C.sub}}>More  credits/month</div>
        </PressBtn>
        <PressBtn onClick={()=>showToast("Credit packs — coming soon!")} style={{padding:"14px 16px",borderRadius:18,background:"linear-gradient(135deg,rgba(139,92,246,0.2),rgba(34,211,238,0.1))",border:"1px solid rgba(139,92,246,0.3)",color:"#a78bfa",fontFamily:"inherit",display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
          <Zap size={20} color="#a78bfa"/>
          <div style={{fontSize:12,fontWeight:600}}>Buy Credits</div>
          <div style={{fontSize:10,color:C.sub}}>Top up anytime</div>
        </PressBtn>
      </div>

      {/* Credit packs preview */}
      <div style={{marginBottom:20}}>
        <div style={{fontSize:11,color:C.sub,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:600,marginBottom:10}}>Credit packs (AUD)</div>
        {[{credits:100,price:"$9",label:"Starter"},{credits:300,price:"$25",label:"Creator Pack"},{credits:800,price:"$49",label:"Pro Pack"},{credits:2000,price:"$99",label:"Studio Pack"}].map((pack,i)=>(
          <PressBtn key={i} onClick={()=>showToast(`${pack.label} — connect Stripe to purchase`)} style={{width:"100%",padding:"12px 16px",borderRadius:16,marginBottom:8,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",display:"flex",alignItems:"center",justifyContent:"space-between",color:C.text,fontFamily:"inherit"}}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div style={{fontSize:18}}>⚡</div>
              <div><div style={{fontSize:13,fontWeight:500}}>{pack.label} · {pack.credits} credits</div><div style={{fontSize:11,color:C.sub}}>Never expire · Best value</div></div>
            </div>
            <div style={{fontSize:16,fontWeight:600,color:"#22d3ee"}}>{pack.price} <span style={{fontSize:10,color:C.sub}}>AUD</span></div>
          </PressBtn>
        ))}
      </div>

      {/* Credit costs reference */}
      <div style={{marginBottom:20,padding:"14px 16px",borderRadius:18,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)"}}>
        <div style={{fontSize:11,color:C.sub,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:600,marginBottom:10}}>Credit costs per action</div>
        {[
          {action:"Script generation",cost:"FREE",color:"#a3e635"},
          {action:"Research Studio",cost:"FREE",color:"#a3e635"},
          {action:"Standard image",cost:"2 credits",color:"#22d3ee"},
          {action:"HD image",cost:"4 credits",color:"#22d3ee"},
          {action:"30 sec voice",cost:"2 credits",color:"#fbbf24"},
          {action:"1 min voice",cost:"4 credits",color:"#fbbf24"},
          {action:"30 sec video",cost:"20 credits",color:"#f43f5e"},
          {action:"60 sec video",cost:"40 credits",color:"#f43f5e"},
          {action:"Avatar video 30s",cost:"25 credits",color:"#e879f9"},
        ].map((item,i)=>(
          <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",paddingBottom:8,marginBottom:8,borderBottom:i<8?"1px solid rgba(255,255,255,0.05)":"none"}}>
            <div style={{fontSize:12,color:C.sub}}>{item.action}</div>
            <div style={{fontSize:12,fontWeight:600,color:item.color}}>{item.cost}</div>
          </div>
        ))}
      </div>

      {/* Usage history */}
      <div style={{fontSize:11,color:C.sub,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:600,marginBottom:10}}>Recent usage</div>
      {[
        {icon:"📝",action:"Script Studio",detail:"Morning routine hook · Viral mode",credits:-1, time:"2h ago",color:"#a78bfa"},
        {icon:"⚡",action:"Creator Hub Post",detail:"Lottery ticket story · Emotional",credits:-1,time:"3h ago",color:C.gold},
        {icon:"#️⃣",action:"Captions & Tags",detail:"ADHD awareness · 5 options",credits:-1,time:"Yesterday",color:"#22d3ee"},
        {icon:"📝",action:"Script Studio",detail:"Beach content · Creator mode",credits:-1,time:"Yesterday",color:"#a78bfa"},
        {icon:"🔄",action:"Monthly reset",detail:"Pro plan · 300 credits added",credits:300,time:"18 days ago",color:"#a3e635"},
      ].map((item,i)=>(
        <div key={i} style={{padding:"13px 16px",borderRadius:16,marginBottom:8,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",gap:12,animation:`slideUp 0.3s ${i*0.05}s both`}}>
          <div style={{width:36,height:36,borderRadius:12,background:`${item.color}18`,border:`1px solid ${item.color}33`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>{item.icon}</div>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:500}}>{item.action}</div>
            <div style={{fontSize:11,color:C.sub,marginTop:2}}>{item.detail}</div>
          </div>
          <div style={{textAlign:"right",flexShrink:0}}>
            <div style={{fontSize:13,fontWeight:600,color:item.credits>0?"#a3e635":"rgba(255,255,255,0.6)"}}>{item.credits>0?"+":""}{item.credits}</div>
            <div style={{fontSize:10,color:C.sub,marginTop:2}}>{item.time}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── HOME ── */
function Home({ onTool, mode, setMode, onSearch, onNotif, credits, brand, onBrandPanel, canInstall, onInstall }) {
  const cats=["Video","Visual","Audio","Writing"];
  const brandActive = !!(brand?.brand_name || brand?.niche);
  return (
    <div style={{padding:"56px 20px 0",animation:"fadeIn 0.4s ease"}}>
      <div style={{marginBottom:16}}>
        <img src="/logo-nav.png" alt="Omnyra AI" style={{height:64, width:'auto', objectFit:'contain', display:'block'}} />
      </div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:11,color:C.sub,letterSpacing:"0.1em",textTransform:"uppercase"}}>Welcome back</div>
          <div style={{marginTop:4,fontSize:22,fontWeight:400,letterSpacing:"-0.02em"}}>Let&apos;s make something.</div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <PressBtn onClick={onBrandPanel} style={{...iconChipStyle, background: brandActive ? "linear-gradient(135deg,rgba(139,92,246,0.25),rgba(34,211,238,0.15))" : "rgba(255,255,255,0.04)", border: brandActive ? "1px solid rgba(139,92,246,0.45)" : "1px solid rgba(255,255,255,0.08)", position:"relative"}}>
            <Building2 size={15} color={brandActive ? "#a78bfa" : C.sub}/>
            {brandActive && <span style={{position:"absolute",top:6,right:6,width:6,height:6,borderRadius:"50%",background:"#a78bfa",boxShadow:"0 0 6px #8b5cf6"}}/>}
          </PressBtn>
          <PressBtn onClick={onNotif} style={{...iconChipStyle,width:"auto",padding:"0 12px",gap:6,display:"flex",alignItems:"center",background:"linear-gradient(135deg,rgba(139,92,246,0.2),rgba(34,211,238,0.12))",border:"1px solid rgba(139,92,246,0.3)"}}>
            <Zap size={13} color="#a78bfa"/>
            <span style={{fontSize:12,fontWeight:600,color:"#a78bfa"}}>{credits ?? "—"}</span>
            <span style={{fontSize:10,color:C.sub}}>credits</span>
          </PressBtn>
          {canInstall && (
            <PressBtn onClick={onInstall} title="Install Omnyra app" style={{...iconChipStyle,background:"linear-gradient(135deg,rgba(139,92,246,0.2),rgba(34,211,238,0.12))",border:"1px solid rgba(139,92,246,0.3)"}}>
              <Smartphone size={15} color="#a78bfa"/>
            </PressBtn>
          )}
          <PressBtn onClick={onSearch} style={iconChipStyle}><Search size={16}/></PressBtn>
        </div>
      </div>
      {brandActive && (
        <div style={{marginTop:12,padding:"9px 14px",borderRadius:14,background:"linear-gradient(135deg,rgba(139,92,246,0.1),rgba(34,211,238,0.06))",border:"1px solid rgba(139,92,246,0.2)",display:"flex",alignItems:"center",gap:8}}>
          <Building2 size={12} color="#a78bfa"/>
          <span style={{fontSize:11,color:"#a78bfa",fontWeight:500}}>{brand.brand_name || brand.niche}</span>
          {brand.tagline && <span style={{fontSize:11,color:C.sub,fontStyle:"italic"}}>· "{brand.tagline}"</span>}
          {!brand.tagline && brand.tone_of_voice && <span style={{fontSize:11,color:C.sub}}>· {brand.tone_of_voice}</span>}
          <span style={{marginLeft:"auto",fontSize:10,color:"#a78bfa",opacity:0.7}}>Brand active</span>
        </div>
      )}
      <div style={{marginTop:16,padding:"14px 16px",borderRadius:20,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)"}}>
        <ModeGrid mode={mode} setMode={setMode}/>
      </div>
      <PressBtn onClick={()=>onTool(TOOLS.find(t=>t.id==="oneclick"))} style={{marginTop:14,width:"100%",padding:22,borderRadius:26,background:"linear-gradient(135deg,rgba(139,92,246,0.4),rgba(34,211,238,0.3))",border:"1px solid rgba(255,255,255,0.12)",position:"relative",overflow:"hidden",textAlign:"left",boxShadow:"0 20px 60px -20px rgba(139,92,246,0.5)",color:C.text,fontFamily:"inherit"}}>
        <div style={{position:"absolute",top:-40,right:-40,width:160,height:160,borderRadius:"50%",background:"radial-gradient(circle,rgba(251,191,36,0.4),transparent 70%)",filter:"blur(20px)"}}/>
        <div style={{position:"relative"}}>
          <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"4px 10px",borderRadius:100,background:"rgba(0,0,0,0.3)",fontSize:10,fontWeight:500,letterSpacing:"0.08em",textTransform:"uppercase"}}><Zap size={11} color={C.gold}/> Creator Hub</div>
          <div style={{marginTop:14,fontSize:22,fontWeight:400,letterSpacing:"-0.025em",lineHeight:1.15}}>AI Creative Director.<br/>5 directions. Full pack.</div>
          <div style={{marginTop:10,fontSize:12,color:"rgba(255,255,255,0.7)"}}>Claude · Kling · Sync Labs · ElevenLabs · D-ID</div>
          <div style={{marginTop:16,display:"inline-flex",alignItems:"center",gap:6,padding:"10px 16px",borderRadius:100,background:"#fff",color:"#0a0a0a",fontSize:13,fontWeight:500}}>Start creating <ChevronRight size={14}/></div>
        </div>
      </PressBtn>
      {cats.map((cat,ci)=>(
        <div key={cat} style={{marginTop:28,animation:`slideUp 0.5s ${0.1+ci*0.05}s both`}}>
          <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",marginBottom:12}}>
            <h2 style={{fontSize:11,fontWeight:500,letterSpacing:"0.15em",textTransform:"uppercase",color:C.sub,margin:0}}>{cat}</h2>
            <div style={{fontSize:11,color:C.sub}}>{TOOLS.filter(t=>t.category===cat).length} tools</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {TOOLS.filter(t=>t.category===cat).map(t=><ToolCard key={t.id} tool={t} onClick={()=>onTool(t)}/>)}
          </div>
        </div>
      ))}
    </div>
  );
}

function ToolCard({ tool, onClick }) {
  const hm={violet:"linear-gradient(135deg,rgba(139,92,246,0.25),rgba(139,92,246,0.05))",cyan:"linear-gradient(135deg,rgba(34,211,238,0.22),rgba(34,211,238,0.04))",gold:"linear-gradient(135deg,rgba(251,191,36,0.25),rgba(251,191,36,0.05))"};
  const bm={violet:"rgba(139,92,246,0.25)",cyan:"rgba(34,211,238,0.25)",gold:"rgba(251,191,36,0.3)"};
  const ic={violet:"#a78bfa",cyan:"#67e8f9",gold:"#fcd34d"};
  return <PressBtn onClick={onClick} style={{padding:16,borderRadius:22,textAlign:"left",background:"rgba(255,255,255,0.03)",border:`1px solid ${bm[tool.hue]}`,backdropFilter:"blur(20px)",color:C.text,position:"relative",overflow:"hidden",minHeight:130,fontFamily:"inherit",width:"100%"}}>
    <div style={{position:"absolute",top:0,right:0,width:70,height:70,background:hm[tool.hue],borderRadius:"0 22px 0 100%",filter:"blur(15px)",opacity:0.7}}/>
    <div style={{position:"relative"}}>
      <div style={{width:36,height:36,borderRadius:12,background:hm[tool.hue],border:`1px solid ${bm[tool.hue]}`,display:"flex",alignItems:"center",justifyContent:"center"}}><tool.icon size={17} color={ic[tool.hue]} strokeWidth={1.8}/></div>
      <div style={{marginTop:20,fontSize:13,fontWeight:500}}>{tool.name}</div>
      <div style={{marginTop:4,fontSize:11,color:C.sub,lineHeight:1.4}}>{tool.desc}</div>
    </div>
  </PressBtn>;
}

/* ─────────────────────────────────────────────
   OMNYRA SCRIPT STUDIO
──────────────────────────────────────────────*/
function ScriptStudio({ mode, setMode, onBack, showToast, brand, onSave }) {
  const [step,setStep]       = useState(1);
  const [platform,setPlatform] = useState(null);
  const [tone,setTone]       = useState(null);
  const [length,setLength]   = useState("1min");
  const [prompt,setPrompt]   = useState("");
  const [generating,setGen]  = useState(false);
  const [directions,setDirs] = useState(null);
  const [selected,setSel]    = useState(null);
  const [expanded,setExp]    = useState(null);
  const [regenKey,setRK]     = useState(null);
  const [error,setError]     = useState(null);
  const cm = MODES.find(m=>m.id===mode);

  const genDirections = async () => {
    if (!prompt.trim()) return;
    setGen(true); setError(null); setDirs(null);
    try {
      const res  = await authFetch("/api/generate",{method:"POST",body:JSON.stringify({tool:"script",phase:"directions",prompt,mode,tone:tone?.id,platform:platform?.label,length:LENGTHS.find(l=>l.id===length)?.label,brand})});
      const data = await res.json();
      if (data.error){setError(data.error);setGen(false);return;}
      if (data.parsed?.directions){setDirs(data.parsed.directions);setStep(4);}
      else setError("Couldn't generate directions. Try again.");
    } catch { setError("Connection failed."); }
    setGen(false);
  };

  const expand = async (dir) => {
    setSel(dir.id-1); setGen(true); setExp(null);
    try {
      const res  = await authFetch("/api/generate",{method:"POST",body:JSON.stringify({tool:"script",phase:"expand",prompt,mode,tone:tone?.id,platform:platform?.label,length:LENGTHS.find(l=>l.id===length)?.label,direction:dir,brand})});
      const data = await res.json();
      if (data.error){setError(data.error);setGen(false);return;}
      if (data.parsed){setExp(data.parsed);setStep(5);}
      else setError("Couldn't expand. Try again.");
    } catch { setError("Connection failed."); }
    setGen(false);
  };

  const regen = async (section) => {
    setRK(section);
    try {
      const res  = await authFetch("/api/generate",{method:"POST",body:JSON.stringify({tool:"script",phase:"regenerate",prompt,mode,tone:tone?.id,section,context:prompt,brand})});
      const data = await res.json();
      if (data.result&&expanded) { const k=section.toLowerCase().replace(/\s+/g,''); setExp(p=>({...p,[k]:data.result.trim()})); showToast(`${section} regenerated! ✓`); }
    } catch { showToast("Regen failed"); }
    setRK(null);
  };

  const SECTION_CONFIG = [
    {key:"hook",        label:"HOOK",           color:"#22d3ee",  regenLabel:"Hook"},
    {key:"script",      label:"FULL SCRIPT",     color:"#a78bfa",  regenLabel:"Script"},
    {key:"scenePlan",   label:"SCENE PLAN",      color:"#60a5fa",  regenLabel:"Scene Plan"},
    {key:"voiceStyle",  label:"VOICE STYLE",     color:"#fbbf24",  regenLabel:"Voice Style"},
    {key:"audioMood",   label:"AUDIO MOOD",      color:"#a3e635",  regenLabel:"Audio Mood"},
    {key:"retentionNotes",label:"RETENTION NOTES",color:"#f43f5e", regenLabel:"Retention Notes"},
    {key:"caption",     label:"CAPTION",         color:"#22d3ee",  regenLabel:"Caption"},
    {key:"hashtags",    label:"HASHTAGS",        color:"#fbbf24",  regenLabel:null},
    {key:"cta",         label:"CALL TO ACTION",  color:"#f43f5e",  regenLabel:"CTA"}
  ];

  return (
    <div style={{minHeight:"100vh",padding:"50px 20px 40px",animation:"fadeIn 0.3s ease"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
        <PressBtn onClick={step>1?()=>{setStep(s=>Math.max(1,s-1));if(step===4)setDirs(null);if(step===5)setExp(null);}:onBack} style={ghostBtn}><ArrowLeft size={18}/></PressBtn>
        <div style={{display:"flex",gap:6}}>{[1,2,3,4,5].map(s=><div key={s} style={{width:s<=step?20:6,height:6,borderRadius:3,background:s<=step?"linear-gradient(90deg,#8b5cf6,#22d3ee)":"rgba(255,255,255,0.15)",transition:"all 0.3s"}}/>)}</div>
        <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:100,background:"rgba(139,92,246,0.15)",border:"1px solid rgba(139,92,246,0.3)",fontSize:10,fontWeight:600,color:"#a78bfa"}}>📝 SCRIPT STUDIO</div>
      </div>

      {error&&<div style={{marginBottom:12,padding:"12px 16px",borderRadius:14,background:"rgba(244,63,94,0.1)",border:"1px solid rgba(244,63,94,0.3)",fontSize:13,color:"#f43f5e"}}>⚠ {error}</div>}

      {/* STEP 1 — Platform */}
      {step===1&&(
        <div style={{animation:"slideUp 0.3s ease"}}>
          <div style={{marginBottom:16}}><div style={{fontSize:18,fontWeight:500}}>📺 Choose platform</div><div style={{fontSize:13,color:C.sub,marginTop:4}}>This shapes the script format and pacing</div></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {PLATFORMS.map(p=>(
              <PressBtn key={p.id} onClick={()=>{setPlatform(p);setStep(2);}} style={{padding:"16px 14px",borderRadius:18,background:platform?.id===p.id?"linear-gradient(135deg,rgba(139,92,246,0.2),rgba(34,211,238,0.15))":"rgba(255,255,255,0.04)",border:platform?.id===p.id?"1.5px solid rgba(139,92,246,0.5)":"1px solid rgba(255,255,255,0.08)",display:"flex",alignItems:"center",gap:12,color:C.text,fontFamily:"inherit"}}>
                <span style={{fontSize:22}}>{p.emoji}</span><span style={{fontSize:13,fontWeight:500}}>{p.label}</span>
                {platform?.id===p.id&&<Check size={14} color="#22d3ee" style={{marginLeft:"auto"}}/>}
              </PressBtn>
            ))}
          </div>
        </div>
      )}

      {/* STEP 2 — Tone */}
      {step===2&&(
        <div style={{animation:"slideUp 0.3s ease"}}>
          <div style={{marginBottom:16}}><div style={{fontSize:18,fontWeight:500}}>🎭 Choose tone</div><div style={{fontSize:13,color:C.sub,marginTop:4}}>{platform?.emoji} {platform?.label} · pick the emotional energy</div></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {TONES.map(t=>(
              <PressBtn key={t.id} onClick={()=>{setTone(t);setStep(3);}} style={{padding:"14px 16px",borderRadius:18,background:tone?.id===t.id?"linear-gradient(135deg,rgba(139,92,246,0.2),rgba(34,211,238,0.15))":"rgba(255,255,255,0.04)",border:tone?.id===t.id?"1.5px solid rgba(139,92,246,0.5)":"1px solid rgba(255,255,255,0.08)",display:"flex",alignItems:"center",gap:12,color:C.text,fontFamily:"inherit"}}>
                <span style={{fontSize:22}}>{t.emoji}</span><span style={{fontSize:13,fontWeight:500}}>{t.label}</span>
                {tone?.id===t.id&&<Check size={14} color="#22d3ee" style={{marginLeft:"auto"}}/>}
              </PressBtn>
            ))}
          </div>
        </div>
      )}

      {/* STEP 3 — Mode + Length + Prompt */}
      {step===3&&(
        <div style={{animation:"slideUp 0.3s ease"}}>
          <div style={{padding:"12px 16px",borderRadius:18,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",marginBottom:14}}>
            <ModeGrid mode={mode} setMode={setMode}/>
          </div>

          {/* Length slider */}
          <div style={{marginBottom:14}}>
            <label style={labelStyle}>Script length</label>
            <div style={{marginTop:8,display:"flex",gap:8}}>
              {LENGTHS.map(l=>{
                const a=length===l.id;
                return <PressBtn key={l.id} onClick={()=>setLength(l.id)} style={{flex:1,padding:"10px 6px",borderRadius:14,background:a?"linear-gradient(135deg,rgba(139,92,246,0.3),rgba(34,211,238,0.2))":"rgba(255,255,255,0.04)",border:a?"1px solid rgba(139,92,246,0.5)":"1px solid rgba(255,255,255,0.08)",color:a?"#fff":C.sub,display:"flex",flexDirection:"column",alignItems:"center",gap:3,fontFamily:"inherit"}}>
                  <span style={{fontSize:12,fontWeight:600}}>{l.label}</span>
                  <span style={{fontSize:9,color:a?"rgba(255,255,255,0.7)":C.sub}}>{l.desc}</span>
                </PressBtn>;
              })}
            </div>
          </div>

          <label style={labelStyle}>Describe your idea (up to 2000 chars)</label>
          <div style={{marginTop:8,borderRadius:20,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",overflow:"hidden"}}>
            <textarea value={prompt} onChange={e=>setPrompt(e.target.value.slice(0,2000))} placeholder="A mechanic finds a winning lottery ticket / Why I quit my 9-5 / The truth about morning routines…" style={{width:"100%",minHeight:130,padding:16,background:"transparent",border:"none",outline:"none",color:C.text,fontSize:14,fontFamily:"inherit",resize:"none",lineHeight:1.5}}/>
            <div style={{padding:"8px 12px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:11,color:C.sub,fontStyle:"italic"}}>💡 Use Research Studio for best prompts</div>
              <div style={{fontSize:10,color:prompt.length>1800?"#f43f5e":C.sub}}>{prompt.length}/2000</div>
            </div>
          </div>

          {/* Smart suggestions */}
          <div style={{marginTop:12,display:"flex",flexWrap:"wrap",gap:8}}>
            {["Make it emotional 😢","Add a plot twist 🔄","Optimise for retention 📈","Make it cinematic 🎬","Make it funny 😂"].map(s=>(
              <PressBtn key={s} onClick={()=>setPrompt(p=>p+(p?" ":"")+s.replace(/\s[^\s]+$/,""))} style={{padding:"6px 12px",borderRadius:100,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",color:C.sub,fontSize:11,fontFamily:"inherit"}}>{s}</PressBtn>
            ))}
          </div>

          {generating?(
            <div style={{marginTop:16,padding:20,borderRadius:22,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:36,height:36,borderRadius:12,background:"linear-gradient(135deg,rgba(139,92,246,0.3),rgba(34,211,238,0.2))",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:16,height:16,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.2)",borderTopColor:cm?.color||"#a78bfa",animation:"spin 1s linear infinite"}}/></div>
              <div><div style={{fontSize:14,fontWeight:500}}>Generating 5 script directions…</div><div style={{fontSize:11,color:C.sub}}>{cm?.emoji} {cm?.name} · {tone?.emoji} {tone?.label}</div></div>
            </div>
          ):(
            <PressBtn onClick={genDirections} disabled={!prompt.trim()} style={{...primaryBtn,marginTop:16,width:"100%",justifyContent:"center",padding:"15px 20px",fontSize:15,opacity:prompt.trim()?1:0.5}}>
              ✦ Generate 5 Script Directions
            </PressBtn>
          )}
        </div>
      )}

      {/* STEP 4 — 5 Directions */}
      {step===4&&directions&&(
        <div style={{animation:"slideUp 0.3s ease"}}>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:18,fontWeight:500}}>🎬 Choose your direction</div>
            <div style={{fontSize:13,color:C.sub,marginTop:4}}>Each takes your idea somewhere completely different</div>
            <div style={{marginTop:8,padding:"8px 14px",borderRadius:12,background:"rgba(139,92,246,0.08)",border:"1px solid rgba(139,92,246,0.2)",fontSize:12,color:"#a78bfa",display:"inline-flex",alignItems:"center",gap:6}}>
              👉 Tap the arrow on the right to expand into a full script
            </div>
          </div>
          {directions.map((dir,i)=>{
            const isLoading = generating && selected===dir.id-1;
            return (
              <PressBtn key={dir.id} onClick={()=>!generating&&expand(dir)} style={{width:"100%",marginBottom:10,padding:"18px 20px",borderRadius:22,background:isLoading?"linear-gradient(135deg,rgba(139,92,246,0.15),rgba(34,211,238,0.1))":"rgba(255,255,255,0.04)",border:isLoading?"1.5px solid rgba(139,92,246,0.5)":"1px solid rgba(255,255,255,0.08)",textAlign:"left",color:C.text,fontFamily:"inherit",animation:`slideUp 0.3s ${i*0.07}s both`,opacity:generating&&!isLoading?0.5:1,transition:"all 0.2s"}}>
                <div style={{display:"flex",alignItems:"center",gap:14}}>
                  <div style={{fontSize:28,flexShrink:0}}>{dir.icon}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:15,fontWeight:600,marginBottom:4}}>{dir.angle}</div>
                    <div style={{fontSize:12,color:C.sub,lineHeight:1.5,fontStyle:"italic"}}>"{dir.hook}"</div>
                    <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",marginTop:4}}>{dir.tone} · {dir.premise}</div>
                    {isLoading&&<div style={{marginTop:8,fontSize:11,color:"#a78bfa",display:"flex",alignItems:"center",gap:6}}><div style={{width:10,height:10,borderRadius:"50%",border:"1.5px solid rgba(139,92,246,0.3)",borderTopColor:"#a78bfa",animation:"spin 1s linear infinite"}}/> Building your script…</div>}
                  </div>
                  <div style={{width:32,height:32,borderRadius:"50%",background:isLoading?"linear-gradient(135deg,#8b5cf6,#22d3ee)":"rgba(255,255,255,0.06)",border:isLoading?"none":"1px solid rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:isLoading?"0 0 16px rgba(139,92,246,0.6)":"none",transition:"all 0.3s"}}>
                    {isLoading?<div style={{width:12,height:12,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"#fff",animation:"spin 1s linear infinite"}}/>:<ChevronRight size={16} color={C.sub}/>}
                  </div>
                </div>
              </PressBtn>
            );
          })}
        </div>
      )}

      {/* STEP 5 — Full voice-ready script with per-section Redo buttons */}
      {step===5&&expanded&&directions&&(
        <div style={{animation:"slideUp 0.3s ease"}}>
          <div style={{padding:"14px 18px",borderRadius:20,background:"rgba(139,92,246,0.1)",border:"1px solid rgba(139,92,246,0.3)",marginBottom:20,display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:24}}>{directions[selected||0]?.icon}</span>
            <div>
              <div style={{fontSize:14,fontWeight:600}}>{directions[selected||0]?.angle}</div>
              <div style={{fontSize:11,color:C.sub}}>{platform?.emoji} {platform?.label} · {tone?.emoji} {tone?.label} · {cm?.emoji} {cm?.name} · {LENGTHS.find(l=>l.id===length)?.label}</div>
            </div>
          </div>

          {/* Voice-ready notice */}
          <div style={{padding:"12px 16px",borderRadius:16,background:"rgba(34,211,238,0.06)",border:"1px solid rgba(34,211,238,0.2)",marginBottom:16,fontSize:12,color:"#22d3ee"}}>
            🎤 Voice-ready format — [PAUSE] markers and CAPS emphasis for ElevenLabs lip-sync
          </div>

          {SECTION_CONFIG.map(sc=>{
            const val = expanded[sc.key];
            if (!val) return null;
            return <ResultSection key={sc.key} label={sc.label} value={val} color={sc.color} onRegen={sc.regenLabel?()=>regen(sc.regenLabel):null} regenLoading={regenKey===sc.regenLabel}/>;
          })}

          <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:10}}>
            <PressBtn onClick={()=>{const all=SECTION_CONFIG.map(sc=>{const v=expanded[sc.key];if(!v)return"";return `${sc.label}\n${Array.isArray(v)?v.join(' '):v}`;}).filter(Boolean).join('\n\n');navigator.clipboard.writeText(all);showToast("Full script copied! ✓");}} style={{...primaryBtn,width:"100%",justifyContent:"center"}}><Copy size={15}/> Copy voice-ready script</PressBtn>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <PressBtn onClick={()=>showToast("Voice Over AI Hub — connect ElevenLabs in Connected Apps")} style={{...ghostBtn,justifyContent:"center",fontSize:11}}>🎤 Voice Over AI Hub</PressBtn>
              <PressBtn onClick={()=>showToast("Video Generator — connect Kling · Sync Labs in Connected Apps")} style={{...ghostBtn,justifyContent:"center",fontSize:11}}>🎬 Video Generator</PressBtn>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <PressBtn onClick={()=>onSave?.('script',{title:prompt,platform:platform?.label,tone:tone?.id,mode,expanded})} style={{...ghostBtn,justifyContent:"center",fontSize:11}}>💾 Save Script</PressBtn>
              <PressBtn onClick={()=>{setStep(4);setExp(null);}} style={{...ghostBtn,justifyContent:"center",fontSize:11}}>← Try another</PressBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Creator Hub POST — Full orchestration flow
──────────────────────────────────────────────*/
function OneClickFlow({ mode, setMode, onBack, showToast, brand, onSave }) {
  const [step,setStep]       = useState(1);
  const [platform,setPlatform] = useState(null);
  const [style,setStyle]     = useState(null);
  const [tone,setTone]       = useState(null);
  const [prompt,setPrompt]   = useState("");
  const [generating,setGen]  = useState(false);
  const [directions,setDirs] = useState(null);
  const [selected,setSel]    = useState(null);
  const [expanded,setExp]    = useState(null);
  const [regenKey,setRK]     = useState(null);
  const [error,setError]     = useState(null);
  const cm = MODES.find(m=>m.id===mode);

  const genDirections = async () => {
    if (!prompt.trim()) return;
    setGen(true); setError(null); setDirs(null);
    try {
      const res  = await authFetch("/api/generate",{method:"POST",body:JSON.stringify({tool:"oneclick",phase:"directions",prompt,mode,tone:tone?.id,platform:platform?.label,style:style?.label,brand})});
      const data = await res.json();
      if (data.error){setError(data.error);setGen(false);return;}
      if (data.parsed?.directions){setDirs(data.parsed.directions);setStep(5);}
      else setError("Couldn't generate directions. Try again.");
    } catch { setError("Connection failed."); }
    setGen(false);
  };

  const expand = async (dir) => {
    setSel(dir.id-1); setGen(true); setExp(null);
    try {
      const res  = await authFetch("/api/generate",{method:"POST",body:JSON.stringify({tool:"oneclick",phase:"expand",prompt,mode,tone:tone?.id,platform:platform?.label,style:style?.label,direction:dir,brand})});
      const data = await res.json();
      if (data.error){setError(data.error);setGen(false);return;}
      if (data.parsed){setExp(data.parsed);setStep(6);}
      else setError("Couldn't expand. Try again.");
    } catch { setError("Connection failed."); }
    setGen(false);
  };

  const regen = async (section) => {
    setRK(section);
    try {
      const res  = await authFetch("/api/generate",{method:"POST",body:JSON.stringify({tool:"oneclick",phase:"regenerate",prompt,mode,tone:tone?.id,platform:platform?.label,style:style?.label,section,context:prompt,brand})});
      const data = await res.json();
      if (data.result&&expanded){ const k=section.toLowerCase().replace(/\s+/g,''); setExp(p=>({...p,[k]:data.result.trim()})); showToast(`${section} regenerated! ✓`); }
    } catch { showToast("Regen failed"); }
    setRK(null);
  };

  const SECTION_CONFIG = [
    {key:"hook",         label:"HOOK",            color:"#22d3ee", regenLabel:"Hook"},
    {key:"script",       label:"SCRIPT",          color:"#a78bfa", regenLabel:"Script"},
    {key:"scenePlan",    label:"SCENE PLAN",      color:"#60a5fa", regenLabel:"Scene Plan"},
    {key:"voiceStyle",   label:"VOICE STYLE",     color:"#fbbf24", regenLabel:"Voice Style"},
    {key:"avatarStyle",  label:"AVATAR STYLE",    color:"#e879f9", regenLabel:"Avatar Style"},
    {key:"audioMood",    label:"AUDIO MOOD",      color:"#a3e635", regenLabel:"Audio Mood"},
    {key:"caption",      label:"CAPTION",         color:"#22d3ee", regenLabel:"Caption"},
    {key:"hashtags",     label:"HASHTAGS",        color:"#fbbf24", regenLabel:null},
    {key:"thumbnailIdea",label:"THUMBNAIL IDEA",  color:"#60a5fa", regenLabel:"Thumbnail"},
    {key:"cta",          label:"CALL TO ACTION",  color:"#f43f5e", regenLabel:"CTA"}
  ];

  const selectedDir = directions?.[selected||0];

  return (
    <div style={{minHeight:"100vh",padding:"50px 20px 40px",animation:"fadeIn 0.3s ease"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
        <PressBtn onClick={step>1?()=>{setStep(s=>Math.max(1,s-1));if(step===5)setDirs(null);if(step===6)setExp(null);}:onBack} style={ghostBtn}><ArrowLeft size={18}/></PressBtn>
        <div style={{display:"flex",gap:5}}>{[1,2,3,4,5,6].map(s=><div key={s} style={{width:s<=step?16:5,height:5,borderRadius:3,background:s<=step?"linear-gradient(90deg,#8b5cf6,#22d3ee)":"rgba(255,255,255,0.15)",transition:"all 0.3s"}}/>)}</div>
        <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:100,background:"rgba(251,191,36,0.15)",border:"1px solid rgba(251,191,36,0.3)",fontSize:10,fontWeight:600,color:C.gold}}><Zap size={11}/> Creator Hub</div>
      </div>

      {/* Orchestration badge */}
      <div style={{padding:"8px 14px",borderRadius:14,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",marginBottom:16,fontSize:11,color:C.sub,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <span style={{color:C.cyan}}>Claude</span> writes ·
        <span style={{color:"#a3e635"}}>Kling · Sync Labs</span> animates ·
        <span style={{color:"#fbbf24"}}>ElevenLabs</span> voices ·
        <span style={{color:"#e879f9"}}>D-ID</span> avatars
      </div>

      {error&&<div style={{marginBottom:12,padding:"12px 16px",borderRadius:14,background:"rgba(244,63,94,0.1)",border:"1px solid rgba(244,63,94,0.3)",fontSize:13,color:"#f43f5e"}}>⚠ {error}</div>}

      {/* STEP 1 — Platform */}
      {step===1&&(
        <div style={{animation:"slideUp 0.3s ease"}}>
          <div style={{marginBottom:16}}><div style={{fontSize:18,fontWeight:500}}>📺 Choose platform</div></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {PLATFORMS.map(p=>(
              <PressBtn key={p.id} onClick={()=>{setPlatform(p);setStep(2);}} style={{padding:"16px 14px",borderRadius:18,background:platform?.id===p.id?"linear-gradient(135deg,rgba(139,92,246,0.2),rgba(34,211,238,0.15))":"rgba(255,255,255,0.04)",border:platform?.id===p.id?"1.5px solid rgba(139,92,246,0.5)":"1px solid rgba(255,255,255,0.08)",display:"flex",alignItems:"center",gap:12,color:C.text,fontFamily:"inherit"}}>
                <span style={{fontSize:22}}>{p.emoji}</span><span style={{fontSize:13,fontWeight:500}}>{p.label}</span>
                {platform?.id===p.id&&<Check size={14} color="#22d3ee" style={{marginLeft:"auto"}}/>}
              </PressBtn>
            ))}
          </div>
        </div>
      )}

      {/* STEP 2 — Style */}
      {step===2&&(
        <div style={{animation:"slideUp 0.3s ease"}}>
          <div style={{marginBottom:16}}><div style={{fontSize:18,fontWeight:500}}>🎨 Visual style</div><div style={{fontSize:13,color:C.sub,marginTop:4}}>{platform?.emoji} {platform?.label}</div></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            {STYLES.map(s=>(
              <PressBtn key={s.id} onClick={()=>{setStyle(s);setStep(3);}} style={{padding:"14px 8px",borderRadius:18,background:style?.id===s.id?"linear-gradient(135deg,rgba(139,92,246,0.2),rgba(34,211,238,0.15))":"rgba(255,255,255,0.04)",border:style?.id===s.id?"1.5px solid rgba(139,92,246,0.5)":"1px solid rgba(255,255,255,0.08)",display:"flex",flexDirection:"column",alignItems:"center",gap:6,color:C.text,fontFamily:"inherit"}}>
                <span style={{fontSize:24}}>{s.emoji}</span><span style={{fontSize:11,fontWeight:500,textAlign:"center"}}>{s.label}</span>
                {style?.id===s.id&&<Check size={12} color="#22d3ee"/>}
              </PressBtn>
            ))}
          </div>
        </div>
      )}

      {/* STEP 3 — Tone */}
      {step===3&&(
        <div style={{animation:"slideUp 0.3s ease"}}>
          <div style={{marginBottom:16}}><div style={{fontSize:18,fontWeight:500}}>🎭 Tone</div><div style={{fontSize:13,color:C.sub,marginTop:4}}>{platform?.emoji} {platform?.label} · {style?.emoji} {style?.label}</div></div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            {TONES.map(t=>(
              <PressBtn key={t.id} onClick={()=>{setTone(t);setStep(4);}} style={{padding:"14px 16px",borderRadius:18,background:tone?.id===t.id?"linear-gradient(135deg,rgba(139,92,246,0.2),rgba(34,211,238,0.15))":"rgba(255,255,255,0.04)",border:tone?.id===t.id?"1.5px solid rgba(139,92,246,0.5)":"1px solid rgba(255,255,255,0.08)",display:"flex",alignItems:"center",gap:12,color:C.text,fontFamily:"inherit"}}>
                <span style={{fontSize:22}}>{t.emoji}</span><span style={{fontSize:13,fontWeight:500}}>{t.label}</span>
                {tone?.id===t.id&&<Check size={14} color="#22d3ee" style={{marginLeft:"auto"}}/>}
              </PressBtn>
            ))}
          </div>
        </div>
      )}

      {/* STEP 4 — Mode + Prompt */}
      {step===4&&(
        <div style={{animation:"slideUp 0.3s ease"}}>
          <div style={{padding:"12px 16px",borderRadius:18,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",marginBottom:14}}>
            <ModeGrid mode={mode} setMode={setMode}/>
          </div>
          <label style={labelStyle}>Your idea (up to 2000 chars)</label>
          <div style={{marginTop:8,borderRadius:20,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",overflow:"hidden"}}>
            <textarea value={prompt} onChange={e=>setPrompt(e.target.value.slice(0,2000))} placeholder="A mechanic returns a winning lottery ticket / I quit my 9-5 at 28…" style={{width:"100%",minHeight:130,padding:16,background:"transparent",border:"none",outline:"none",color:C.text,fontSize:14,fontFamily:"inherit",resize:"none",lineHeight:1.5}}/>
            <div style={{padding:"8px 12px 12px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div style={{fontSize:11,color:C.sub,fontStyle:"italic"}}>💡 Use Research Studio for best prompts</div>
              <div style={{fontSize:10,color:prompt.length>1800?"#f43f5e":C.sub}}>{prompt.length}/2000</div>
            </div>
          </div>
          <div style={{marginTop:10,display:"flex",flexWrap:"wrap",gap:8}}>
            {["Make it emotional 😢","Add a plot twist 🔄","Optimise for retention 📈","Make it funny 😂","More cinematic 🎬"].map(s=>(
              <PressBtn key={s} onClick={()=>setPrompt(p=>p+(p?" ":"")+s.replace(/\s[^\s]+$/,""))} style={{padding:"6px 12px",borderRadius:100,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",color:C.sub,fontSize:11,fontFamily:"inherit"}}>{s}</PressBtn>
            ))}
          </div>
          {generating?(
            <div style={{marginTop:16,padding:20,borderRadius:22,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:36,height:36,borderRadius:12,background:"linear-gradient(135deg,rgba(139,92,246,0.3),rgba(34,211,238,0.2))",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:16,height:16,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.2)",borderTopColor:cm?.color||"#a78bfa",animation:"spin 1s linear infinite"}}/></div>
              <div><div style={{fontSize:14,fontWeight:500}}>Generating 5 creative directions…</div><div style={{fontSize:11,color:C.sub}}>AI Creative Director at work</div></div>
            </div>
          ):(
            <PressBtn onClick={genDirections} disabled={!prompt.trim()} style={{...primaryBtn,marginTop:16,width:"100%",justifyContent:"center",padding:"15px 20px",fontSize:15,opacity:prompt.trim()?1:0.5}}>
              ✦ Generate 5 Creative Directions
            </PressBtn>
          )}
        </div>
      )}

      {/* STEP 5 — Directions */}
      {step===5&&directions&&(
        <div style={{animation:"slideUp 0.3s ease"}}>
          <div style={{marginBottom:16}}>
            <div style={{fontSize:18,fontWeight:500}}>🎬 Choose a direction</div>
            <div style={{fontSize:13,color:C.sub,marginTop:4}}>Each builds a completely different content angle</div>
            <div style={{marginTop:8,padding:"8px 14px",borderRadius:12,background:"rgba(251,191,36,0.08)",border:"1px solid rgba(251,191,36,0.2)",fontSize:12,color:C.gold,display:"inline-flex",alignItems:"center",gap:6}}>
              👉 Tap the arrow on the right to build your full content pack
            </div>
          </div>
          {directions.map((dir,i)=>{
            const isLoading = generating && selected===dir.id-1;
            return (
              <PressBtn key={dir.id} onClick={()=>!generating&&expand(dir)} style={{width:"100%",marginBottom:10,padding:"18px 20px",borderRadius:22,background:isLoading?"linear-gradient(135deg,rgba(139,92,246,0.15),rgba(34,211,238,0.1))":"rgba(255,255,255,0.04)",border:isLoading?"1.5px solid rgba(139,92,246,0.5)":"1px solid rgba(255,255,255,0.08)",textAlign:"left",color:C.text,fontFamily:"inherit",animation:`slideUp 0.3s ${i*0.07}s both`,opacity:generating&&!isLoading?0.5:1,transition:"all 0.2s"}}>
                <div style={{display:"flex",alignItems:"center",gap:14}}>
                  <div style={{fontSize:28,flexShrink:0}}>{dir.icon}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:15,fontWeight:600,marginBottom:4}}>{dir.angle}</div>
                    <div style={{fontSize:12,color:C.sub,lineHeight:1.5}}>{dir.vibe}</div>
                    <div style={{fontSize:12,color:"#a78bfa",marginTop:6,fontStyle:"italic"}}>"{dir.hook}"</div>
                    {dir.apiPlan&&<div style={{fontSize:10,color:"rgba(255,255,255,0.3)",marginTop:4}}>🔌 {dir.apiPlan}</div>}
                    {isLoading&&<div style={{marginTop:8,fontSize:11,color:"#a78bfa",display:"flex",alignItems:"center",gap:6}}><div style={{width:10,height:10,borderRadius:"50%",border:"1.5px solid rgba(139,92,246,0.3)",borderTopColor:"#a78bfa",animation:"spin 1s linear infinite"}}/> Orchestrating your content pack…</div>}
                  </div>
                  <div style={{width:32,height:32,borderRadius:"50%",background:isLoading?"linear-gradient(135deg,#8b5cf6,#22d3ee)":"rgba(255,255,255,0.06)",border:isLoading?"none":"1px solid rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:isLoading?"0 0 16px rgba(139,92,246,0.6)":"none",transition:"all 0.3s"}}>
                    {isLoading?<div style={{width:12,height:12,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"#fff",animation:"spin 1s linear infinite"}}/>:<ChevronRight size={16} color={C.sub}/>}
                  </div>
                </div>
              </PressBtn>
            );
          })}
        </div>
      )}

      {/* STEP 6 — Full Package with per-section Redo buttons */}
      {step===6&&expanded&&selectedDir&&(
        <div style={{animation:"slideUp 0.3s ease"}}>
          <div style={{padding:"14px 18px",borderRadius:20,background:"rgba(139,92,246,0.1)",border:"1px solid rgba(139,92,246,0.3)",marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:24}}>{selectedDir.icon}</span>
            <div>
              <div style={{fontSize:14,fontWeight:600}}>{selectedDir.angle}</div>
              <div style={{fontSize:11,color:C.sub}}>{platform?.emoji} {platform?.label} · {style?.emoji} {style?.label} · {tone?.emoji} {tone?.label} · {cm?.emoji} {cm?.name}</div>
            </div>
          </div>
          <div style={{padding:"10px 14px",borderRadius:14,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",marginBottom:14,fontSize:11,color:C.sub,display:"flex",gap:10,flexWrap:"wrap"}}>
            <span>✦ <span style={{color:"#22d3ee"}}>Claude</span> wrote</span>
            <span>✦ <span style={{color:"#a3e635"}}>Kling · Sync Labs</span> will animate</span>
            <span>✦ <span style={{color:"#fbbf24"}}>ElevenLabs</span> will voice</span>
            <span>✦ <span style={{color:"#e879f9"}}>D-ID</span> will avatar</span>
          </div>

          {SECTION_CONFIG.map(sc=>{
            const val=expanded[sc.key];
            if(!val) return null;
            return <ResultSection key={sc.key} label={sc.label} value={val} color={sc.color} onRegen={sc.regenLabel?()=>regen(sc.regenLabel):null} regenLoading={regenKey===sc.regenLabel}/>;
          })}

          <div style={{marginTop:8,display:"flex",flexDirection:"column",gap:10}}>
            <PressBtn onClick={()=>{const all=SECTION_CONFIG.map(sc=>{const v=expanded[sc.key];if(!v)return"";return`${sc.label}\n${Array.isArray(v)?v.join(' '):v}`;}).filter(Boolean).join('\n\n');navigator.clipboard.writeText(all);showToast("Full package copied! ✓");}} style={{...primaryBtn,width:"100%",justifyContent:"center"}}><Copy size={15}/> Copy full package</PressBtn>
            <PressBtn onClick={()=>showToast("Create Video — connect Kling · Sync Labs + D-ID in Connected Apps")} style={{padding:"14px 20px",borderRadius:100,background:"linear-gradient(135deg,rgba(251,191,36,0.25),rgba(251,191,36,0.1))",border:"1px solid rgba(251,191,36,0.35)",color:C.gold,fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:8,fontSize:14,fontWeight:600}}>
              🎬 Create Video from this package
            </PressBtn>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
              <PressBtn onClick={()=>showToast("Export — connect video APIs")} style={{...ghostBtn,justifyContent:"center"}}>📤 Export Video</PressBtn>
              <PressBtn onClick={()=>onSave?.('oneclick',{title:prompt,platform:platform?.label,style:style?.label,tone:tone?.id,mode,expanded})} style={{...ghostBtn,justifyContent:"center"}}>💾 Save Project</PressBtn>
            </div>
            <PressBtn onClick={()=>{setStep(5);setExp(null);}} style={{...ghostBtn,width:"100%",justifyContent:"center"}}>← Try different direction</PressBtn>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   PRESENTER STUDIO (AI Avatars — 40 avatars)
──────────────────────────────────────────────*/
function AvatarGenerateForm({ script, onScript, voices, voicesLoading, voiceId, onVoice, duration, onDuration, generating, jobStatus, videoUrl, onGenerate, plan = 'free' }) {
  return (
    <>
      <div style={{ marginTop: 20 }}>
        <label style={labelStyle}>Script</label>
        <div style={{ marginTop: 8, borderRadius: 20, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
          <textarea
            value={script}
            onChange={e => onScript(e.target.value)}
            placeholder="Type what the presenter should say…"
            style={{ width: "100%", minHeight: 110, padding: 16, background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 14, fontFamily: "inherit", resize: "none", lineHeight: 1.5, boxSizing: "border-box" }}
          />
          <div style={{ padding: "8px 12px 12px", display: "flex", justifyContent: "flex-end" }}>
            <span style={{ fontSize: 10, color: C.sub }}>{script.length} chars</span>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <label style={labelStyle}>Voice (ElevenLabs)</label>
        <div style={{ marginTop: 8 }}>
          <VoicePicker voices={voices} selectedId={voiceId} onSelect={onVoice} loading={voicesLoading} />
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <label style={labelStyle}>Duration</label>
        <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
          {[{ v: 30, label: "30 sec", credits: "25 credits" }, { v: 60, label: "60 sec", credits: "45 credits" }].map(d => (
            <PressBtn key={d.v} onClick={() => onDuration(d.v)} style={{
              flex: 1, padding: "12px", borderRadius: 14,
              background: duration === d.v ? "linear-gradient(135deg,rgba(139,92,246,0.2),rgba(34,211,238,0.15))" : "rgba(255,255,255,0.04)",
              border: duration === d.v ? "1.5px solid rgba(139,92,246,0.5)" : "1px solid rgba(255,255,255,0.08)",
              color: C.text, fontFamily: "inherit", display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
            }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{d.label}</span>
              <span style={{ fontSize: 10, color: C.sub }}>{d.credits}</span>
            </PressBtn>
          ))}
        </div>
      </div>

      <PressBtn
        onClick={onGenerate}
        disabled={generating || !script.trim()}
        style={{ ...primaryBtn, width: "100%", justifyContent: "center", marginTop: 16, opacity: generating || !script.trim() ? 0.5 : 1 }}
      >
        {generating
          ? <><RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} /> {jobStatus === "processing" ? "Rendering…" : "Starting…"}</>
          : <><Clapperboard size={16} /> Generate Avatar Video</>
        }
      </PressBtn>

      {videoUrl && (
        <div style={{ marginTop: 20, borderRadius: 20, overflow: "hidden", border: "1px solid rgba(139,92,246,0.3)" }}>
          <div style={{ position: "relative" }}>
            <video controls style={{ width: "100%", display: "block", background: "#000" }}>
              <source src={videoUrl} type="video/mp4" />
            </video>
            <WatermarkOverlay plan={plan} />
          </div>
          <div style={{ padding: "12px 14px", background: "rgba(139,92,246,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, color: C.sub }}>Avatar video ready ✓</span>
            <a href={videoUrl} download style={{ fontSize: 12, color: "#a78bfa", textDecoration: "none" }}>Download</a>
          </div>
        </div>
      )}
    </>
  );
}

function AvatarStudio({ mode, onBack, showToast, plan = 'free' }) {
  const [view, setView]                     = useState("pick");
  const [presenters, setPresenters]         = useState([]);
  const [presLoading, setPresLoad]          = useState(true);
  const [avatarProvider, setAvatarProvider] = useState("did");
  const [selected, setSelected]             = useState(null);
  const [voices, setVoices]                 = useState([]);
  const [voicesLoading, setVLoading]        = useState(true);
  const [voiceId, setVoiceId]               = useState("");
  const [script, setScript]                 = useState("");
  const [duration, setDuration]             = useState(30);
  const [generating, setGenerating]         = useState(false);
  const [jobId, setJobId]                   = useState(null);
  const [provider, setProvider]             = useState(null);
  const [jobStatus, setJobStatus]           = useState(null);
  const [videoUrl, setVideoUrl]             = useState(null);
  const [selfie, setSelfie]                 = useState(null);  // local blob URL for preview
  const [selfieUrl, setSelfieUrl]           = useState(null);  // public Supabase URL for D-ID
  const fileRef = useRef();
  const pollRef = useRef();

  useEffect(() => {
    (async () => {
      try {
        if (plan === 'studio') {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            const res = await fetch('/api/heygen', { headers: { Authorization: `Bearer ${session.access_token}` } });
            if (res.ok) {
              const d = await res.json();
              const list = d.avatars || [];
              if (list.length) { setPresenters(list); setAvatarProvider('heygen'); return; }
            }
          }
        }
        const res = await fetch('/api/avatars');
        const d = await res.json();
        setPresenters(d.presenters || []);
        setAvatarProvider('did');
      } catch {} finally { setPresLoad(false); }
    })();

    authFetch("/api/voices")
      .then(r => r.json())
      .then(d => {
        const list = d.voices || [];
        setVoices(list);
        if (list.length) setVoiceId(list[0].voice_id);
      })
      .catch(() => {})
      .finally(() => setVLoading(false));
  }, []);

  useEffect(() => {
    if (!jobId || !provider) return;
    const poll = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(`/api/status?jobId=${jobId}&provider=${provider}`, {
          headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
        });
        const data = await res.json();
        setJobStatus(data.status);
        if (data.status === "complete") {
          setVideoUrl(data.url);
          setGenerating(false);
          clearInterval(pollRef.current);
          showToast("Avatar video ready! 🎭");
        } else if (data.status === "failed") {
          setGenerating(false);
          clearInterval(pollRef.current);
          showToast("Generation failed — try again");
        }
      } catch {}
    };
    pollRef.current = setInterval(poll, 5000);
    poll();
    return () => clearInterval(pollRef.current);
  }, [jobId, provider]);

  const generate = async () => {
    if (!script.trim()) { showToast("Add a script first"); return; }
    const useHeyGen = avatarProvider === 'heygen' && view === 'pick';
    if (useHeyGen && !selected?.id) { showToast("Select a presenter first"); return; }
    if (!useHeyGen && view === 'twin' && !selfieUrl) { showToast(selfie ? 'Selfie still uploading…' : 'Upload your selfie first'); return; }
    if (!useHeyGen && view !== 'twin' && !selected?.thumbnail_url) { showToast("Select a presenter first"); return; }
    setGenerating(true); setVideoUrl(null); setJobStatus(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const body = useHeyGen
        ? { avatarId: selected.id, scriptText: script, voiceId, duration }
        : { imageUrl: view === 'twin' ? selfieUrl : selected.thumbnail_url, scriptText: script, voiceId, duration };
      const res = await fetch("/api/avatar", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session && { Authorization: `Bearer ${session.access_token}` }) },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) { showToast(data.error); setGenerating(false); return; }
      setJobId(data.jobId);
      setProvider(data.provider);
    } catch {
      showToast("Generation failed");
      setGenerating(false);
    }
  };

  const resetJob = () => { setVideoUrl(null); setJobId(null); setJobStatus(null); };

  return (
    <div style={{ minHeight: "100vh", padding: "50px 20px 100px", animation: "fadeIn 0.3s ease" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <PressBtn onClick={onBack} style={ghostBtn}><ArrowLeft size={18} /></PressBtn>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 100, background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.3)", fontSize: 10, fontWeight: 600, color: "#a78bfa" }}>🎭 PRESENTER STUDIO</div>
      </div>

      <h1 style={{ fontSize: 26, fontWeight: 300, letterSpacing: "-0.03em", margin: "0 0 4px" }}>Presenter Studio</h1>
      <div style={{ margin: "0 0 18px", display: "flex", alignItems: "center", gap: 8 }}>
        <p style={{ margin: 0, fontSize: 13, color: C.sub }}>
          {avatarProvider === 'heygen' ? 'HeyGen Studio avatars · ElevenLabs voice' : 'D-ID avatars · ElevenLabs voice · instant video'}
        </p>
        {avatarProvider === 'heygen' && (
          <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 100, background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.3)", color: C.gold, fontWeight: 600 }}>STUDIO</span>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 18 }}>
        {[{ id: "pick", label: "Presenters", emoji: "🎭" }, { id: "twin", label: "Digital Twin", emoji: "📷" }].map(t => {
          const a = view === t.id;
          return (
            <PressBtn key={t.id} onClick={() => { setView(t.id); setSelected(null); resetJob(); }} style={{
              padding: "8px 16px", borderRadius: 100, fontSize: 12, fontWeight: a ? 600 : 400,
              background: a ? "linear-gradient(135deg,rgba(139,92,246,0.3),rgba(34,211,238,0.2))" : "rgba(255,255,255,0.04)",
              border: a ? "1px solid rgba(139,92,246,0.5)" : "1px solid rgba(255,255,255,0.08)",
              color: a ? "#fff" : C.sub, fontFamily: "inherit",
            }}>
              {t.emoji} {t.label}
            </PressBtn>
          );
        })}
      </div>

      {/* DIGITAL TWIN */}
      {view === "twin" && (
        <div>
          <div style={{ padding: "20px 18px", borderRadius: 22, background: "linear-gradient(135deg,rgba(139,92,246,0.15),rgba(34,211,238,0.1))", border: "1px solid rgba(139,92,246,0.3)", marginBottom: 18 }}>
            <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>📷 Your AI Digital Twin</div>
            <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.6 }}>Upload one selfie. D-ID turns you into a talking AI presenter.</div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={async e => {
            const file = e.target.files[0]; if (!file) return;
            setSelfie(URL.createObjectURL(file)); setSelfieUrl(null);
            try {
              const { data: { session } } = await supabase.auth.getSession();
              const ext = file.name.split('.').pop() || 'jpg';
              const path = `${session.user.id}/twin-${Date.now()}.${ext}`;
              const { data, error: upErr } = await supabase.storage
                .from('lipsync-media').upload(path, file, { upsert: true, contentType: file.type });
              if (upErr) throw upErr;
              const { data: pub } = supabase.storage.from('lipsync-media').getPublicUrl(data.path);
              setSelfieUrl(pub.publicUrl);
              showToast("Selfie ready ✓");
            } catch { showToast("Upload failed — check lipsync-media bucket"); setSelfie(null); }
          }} />
          <PressBtn onClick={() => fileRef.current?.click()} style={{ width: "100%", padding: 24, borderRadius: 22, background: selfie ? "rgba(139,92,246,0.1)" : "rgba(255,255,255,0.03)", border: selfie ? "1px solid rgba(139,92,246,0.4)" : "1px dashed rgba(255,255,255,0.15)", textAlign: "center", color: C.text, fontFamily: "inherit" }}>
            {selfie ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <img src={selfie} alt="" style={{ width: 100, height: 100, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(139,92,246,0.5)" }} />
                <div style={{ fontSize: 14, fontWeight: 500, color: selfieUrl ? "#a78bfa" : C.sub }}>{selfieUrl ? "✓ Selfie ready" : "Uploading…"}</div>
              </div>
            ) : (
              <>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📷</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>Upload your selfie</div>
                <div style={{ fontSize: 12, color: C.sub, marginTop: 6 }}>One photo · AI talking presenter clone</div>
              </>
            )}
          </PressBtn>
          {selfie && (
            <AvatarGenerateForm
              script={script} onScript={setScript}
              voices={voices} voicesLoading={voicesLoading} voiceId={voiceId} onVoice={setVoiceId}
              duration={duration} onDuration={setDuration}
              generating={generating} jobStatus={jobStatus} videoUrl={videoUrl}
              onGenerate={generate} plan={plan}
            />
          )}
        </div>
      )}

      {/* PRESENTER PICKER */}
      {view === "pick" && (
        <>
          {presLoading ? (
            <div style={{ padding: "40px", textAlign: "center", color: C.sub, fontSize: 13 }}>Loading presenters…</div>
          ) : presenters.length === 0 ? (
            <div style={{ padding: "30px 20px", textAlign: "center", borderRadius: 20, border: "1px solid rgba(255,255,255,0.08)", color: C.sub }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>🔌</div>
              <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>No presenters found</div>
              <div style={{ fontSize: 12, marginTop: 6 }}>
                {avatarProvider === 'heygen' ? 'Check HEYGEN_API_KEY in your environment' : 'Check DID_API_KEY in your environment'}
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {presenters.map(p => {
                const isSel = selected?.id === p.id;
                return (
                  <PressBtn key={p.id} onClick={() => { setSelected(isSel ? null : p); resetJob(); }} style={{
                    padding: 0, borderRadius: 18, overflow: "hidden", position: "relative",
                    border: isSel ? "2px solid rgba(139,92,246,0.8)" : "1.5px solid rgba(255,255,255,0.08)",
                    background: "rgba(255,255,255,0.03)", fontFamily: "inherit", aspectRatio: "3/4",
                  }}>
                    {p.thumbnail_url
                      ? <img src={p.thumbnail_url} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                      : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 40 }}>🎭</div>
                    }
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "24px 10px 10px", background: "linear-gradient(to top,rgba(0,0,0,0.85) 0%,transparent 100%)" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{p.name}</div>
                      {p.gender && <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", textTransform: "capitalize", marginTop: 2 }}>{p.gender}</div>}
                    </div>
                    {isSel && (
                      <div style={{ position: "absolute", top: 8, right: 8, width: 24, height: 24, borderRadius: "50%", background: "#8b5cf6", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 8px rgba(139,92,246,0.5)" }}>
                        <Check size={13} color="#fff" />
                      </div>
                    )}
                  </PressBtn>
                );
              })}
            </div>
          )}

          {selected && (
            <>
              <div style={{ marginTop: 16, padding: "14px 16px", borderRadius: 18, background: "linear-gradient(135deg,rgba(139,92,246,0.12),rgba(34,211,238,0.08))", border: "1px solid rgba(139,92,246,0.25)", display: "flex", alignItems: "center", gap: 12 }}>
                {selected.thumbnail_url && <img src={selected.thumbnail_url} alt={selected.name} style={{ width: 44, height: 44, borderRadius: 12, objectFit: "cover", flexShrink: 0 }} />}
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{selected.name}</div>
                  {selected.gender && <div style={{ fontSize: 11, color: C.sub, textTransform: "capitalize" }}>{selected.gender} presenter</div>}
                </div>
              </div>
              <AvatarGenerateForm
                script={script} onScript={setScript}
                voices={voices} voicesLoading={voicesLoading} voiceId={voiceId} onVoice={setVoiceId}
                duration={duration} onDuration={setDuration}
                generating={generating} jobStatus={jobStatus} videoUrl={videoUrl}
                onGenerate={generate} plan={plan}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   AI VIDEO TOOL
──────────────────────────────────────────────*/
const VIDEO_PROVIDER_LABEL = {
  free:    'Pika 2.2 · Fal AI',
  creator: 'Pika 2.2 · Fal AI',
  pro:     'Kling AI · Runway ML',
  studio:  'Kling AI Pro',
}

const IMG2VIDEO_LABEL = {
  free:    'Pika 2.2 · Fal AI',
  creator: 'Pika 2.2 · Fal AI',
  pro:     'Runway ML',
  studio:  'Kling AI Pro',
}

function VideoTool({ onBack, showToast, onGenerated, plan = 'free' }) {
  const [prompt, setPrompt]     = useState("")
  const [loading, setLoading]   = useState(false)
  const [videoUrl, setVideoUrl] = useState(null)
  const [jobStatus, setJobStatus] = useState(null)
  const [error, setError]       = useState(null)
  const [jobId, setJobId]       = useState(null)
  const [provider, setProvider] = useState(null)
  const [subtype, setSubtype]   = useState(null)
  const pollRef = useRef()

  useEffect(() => {
    if (!jobId || !provider) return
    const poll = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const qs = new URLSearchParams({ jobId, provider, ...(subtype && { subtype }) })
        const res = await fetch(`/api/status?${qs}`, {
          headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
        })
        const d = await res.json()
        setJobStatus(d.status)
        if (d.status === 'complete') {
          setVideoUrl(d.url); setLoading(false); clearInterval(pollRef.current); onGenerated?.()
        } else if (d.status === 'failed') {
          setError('Video generation failed.'); setLoading(false); clearInterval(pollRef.current)
        }
      } catch {}
    }
    pollRef.current = setInterval(poll, 4000)
    poll()
    return () => clearInterval(pollRef.current)
  }, [jobId, provider, subtype])

  const generate = async () => {
    if (!prompt.trim()) { showToast("Add a prompt first"); return }
    clearInterval(pollRef.current)
    setLoading(true); setVideoUrl(null); setError(null)
    setJobId(null); setProvider(null); setSubtype(null); setJobStatus(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session && { Authorization: `Bearer ${session.access_token}` }) },
        body: JSON.stringify({ prompt, duration: 5 }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); setLoading(false); return }
      onGenerated?.(data.balance)
      if (data.status === 'complete' && data.url) {
        // Pika via Fal AI returns synchronously
        setVideoUrl(data.url); setLoading(false)
      } else {
        // Kling / Runway — poll until done
        setJobId(data.jobId); setProvider(data.provider); setSubtype(data.subtype ?? null); setJobStatus('processing')
      }
    } catch { setError("Connection failed."); setLoading(false) }
  }

  return (
    <div style={{ minHeight: "100vh", padding: "50px 20px 40px", animation: "fadeIn 0.3s ease" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <PressBtn onClick={onBack} style={ghostBtn}><ArrowLeft size={18} /></PressBtn>
      </div>

      <div style={{ marginTop: 18, marginBottom: 24 }}>
        <div style={{ width: 50, height: 50, borderRadius: 16, background: "linear-gradient(135deg,rgba(139,92,246,0.3),rgba(34,211,238,0.2))", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Video size={22} color="#fff" strokeWidth={1.6} />
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 300, margin: "12px 0 4px" }}>AI Video</h1>
        <p style={{ margin: 0, fontSize: 13, color: C.sub }}>{VIDEO_PROVIDER_LABEL[plan] ?? 'Pika 2.2 · Fal AI'}</p>
      </div>

      <label style={labelStyle}>Describe your video</label>
      <div style={{ marginTop: 8, borderRadius: 20, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="A cinematic aerial shot of a neon-lit city at night…"
          style={{ width: "100%", minHeight: 110, padding: 16, background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 14, fontFamily: "inherit", resize: "none", lineHeight: 1.5 }}
        />
        <div style={{ padding: "8px 12px 12px", display: "flex", justifyContent: "flex-end" }}>
          <div style={{ fontSize: 10, color: C.sub }}>{prompt.length} chars</div>
        </div>
      </div>

      <PressBtn
        onClick={generate}
        disabled={loading || !prompt.trim()}
        style={{ ...primaryBtn, width: "100%", justifyContent: "center", marginTop: 16, opacity: loading || !prompt.trim() ? 0.5 : 1 }}
      >
        {loading
          ? <><div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 1s linear infinite" }} /> Generating…</>
          : <><Video size={16} /> {videoUrl ? "Regenerate" : "Generate Video"}</>}
      </PressBtn>

      {error && (
        <div style={{ marginTop: 12, padding: "12px 16px", borderRadius: 14, background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", fontSize: 13, color: "#f43f5e" }}>⚠ {error}</div>
      )}

      {loading && !videoUrl && (
        <div style={{ marginTop: 20, padding: 24, borderRadius: 20, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", border: "3px solid rgba(139,92,246,0.2)", borderTopColor: "#8b5cf6", animation: "spin 1s linear infinite" }} />
          <div style={{ fontSize: 13, color: C.sub }}>{jobStatus === 'processing' ? 'Rendering your video…' : 'Starting generation…'}</div>
          {jobStatus === 'processing' && provider !== 'pika' && (
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)" }}>This can take 1–3 minutes</div>
          )}
        </div>
      )}

      {videoUrl && (
        <div style={{ marginTop: 20, borderRadius: 20, overflow: "hidden", border: "1px solid rgba(139,92,246,0.3)", animation: "slideUp 0.4s ease" }}>
          <div style={{ position: "relative" }}>
            <video controls autoPlay muted style={{ width: "100%", display: "block", background: "#000" }}>
              <source src={videoUrl} type="video/mp4" />
            </video>
            <WatermarkOverlay plan={plan} />
          </div>
          <div style={{ padding: "12px 16px", background: "rgba(139,92,246,0.08)", display: "flex", gap: 10 }}>
            <a href={videoUrl} download="omnyra-video.mp4" target="_blank" rel="noreferrer"
              style={{ ...primaryBtn, flex: 1, justifyContent: "center", textDecoration: "none" }}>
              <Copy size={14} /> Download
            </a>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────
   DIGITAL TWIN STUDIO
──────────────────────────────────────────────*/
function DigitalTwinStudio({ onBack, showToast, onGenerated }) {
  const [selfieBlob, setSelfieBlob]   = useState(null)   // local preview
  const [selfieUrl, setSelfieUrl]     = useState(null)   // public URL for D-ID
  const [uploading, setUploading]     = useState(false)
  const [voices, setVoices]           = useState([])
  const [voicesLoading, setVLoading]  = useState(true)
  const [voiceId, setVoiceId]         = useState('')
  const [script, setScript]           = useState('')
  const [duration, setDuration]       = useState(30)
  const [generating, setGenerating]   = useState(false)
  const [jobId, setJobId]             = useState(null)
  const [jobStatus, setJobStatus]     = useState(null)
  const [videoUrl, setVideoUrl]       = useState(null)
  const [error, setError]             = useState(null)
  const pollRef = useRef()
  const fileRef = useRef()

  useEffect(() => {
    authFetch('/api/voices').then(r => r.json()).then(d => {
      const list = d.voices || []
      setVoices(list)
      if (list.length) setVoiceId(list[0].voice_id)
    }).catch(() => {}).finally(() => setVLoading(false))
  }, [])

  const handleSelfie = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    setSelfieBlob(URL.createObjectURL(file)); setSelfieUrl(null); setUploading(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const ext  = file.name.split('.').pop() || 'jpg'
      const path = `${session.user.id}/twin-${Date.now()}.${ext}`
      const { data, error: upErr } = await supabase.storage
        .from('lipsync-media').upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) throw upErr
      const { data: pub } = supabase.storage.from('lipsync-media').getPublicUrl(data.path)
      setSelfieUrl(pub.publicUrl)
    } catch { showToast('Upload failed — check lipsync-media Supabase bucket'); setSelfieBlob(null) }
    finally { setUploading(false) }
  }

  useEffect(() => {
    if (!jobId) return
    const poll = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(`/api/status?jobId=${jobId}&provider=did`, {
          headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
        })
        const d = await res.json()
        setJobStatus(d.status)
        if (d.status === 'complete') {
          setVideoUrl(d.url); setGenerating(false); clearInterval(pollRef.current); onGenerated?.()
        } else if (d.status === 'failed') {
          setError('Generation failed — try again'); setGenerating(false); clearInterval(pollRef.current)
        }
      } catch {}
    }
    pollRef.current = setInterval(poll, 3000)
    poll()
    return () => clearInterval(pollRef.current)
  }, [jobId])

  const generate = async () => {
    if (!selfieUrl) { showToast(uploading ? 'Photo still uploading…' : 'Upload your selfie first'); return }
    if (!script.trim()) { showToast('Add a script first'); return }
    clearInterval(pollRef.current)
    setGenerating(true); setVideoUrl(null); setError(null); setJobId(null); setJobStatus(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session && { Authorization: `Bearer ${session.access_token}` }) },
        body: JSON.stringify({ imageUrl: selfieUrl, scriptText: script, voiceId, duration }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); setGenerating(false); return }
      onGenerated?.(data.balance)
      setJobId(data.jobId); setJobStatus(data.status)
    } catch { setError('Connection failed'); setGenerating(false) }
  }

  return (
    <div style={{ minHeight: '100vh', padding: '50px 20px 40px', animation: 'fadeIn 0.3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <PressBtn onClick={onBack} style={ghostBtn}><ArrowLeft size={18} /></PressBtn>
      </div>

      <div style={{ marginTop: 18, marginBottom: 24 }}>
        <div style={{ width: 50, height: 50, borderRadius: 16, background: 'linear-gradient(135deg,rgba(34,211,238,0.3),rgba(139,92,246,0.2))', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Camera size={22} color="#fff" strokeWidth={1.6} />
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 300, margin: '12px 0 4px' }}>Digital Twin</h1>
        <p style={{ margin: 0, fontSize: 13, color: C.sub }}>One selfie · D-ID turns you into a talking AI presenter</p>
      </div>

      {/* Selfie upload */}
      <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleSelfie} />
      <PressBtn onClick={() => fileRef.current?.click()} style={{ width: '100%', padding: 28, borderRadius: 24, background: selfieBlob ? 'rgba(34,211,238,0.06)' : 'rgba(255,255,255,0.03)', border: selfieBlob ? '1px solid rgba(34,211,238,0.3)' : '1px dashed rgba(255,255,255,0.15)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: C.text, fontFamily: 'inherit' }}>
        {selfieBlob ? (
          <>
            <img src={selfieBlob} alt="" style={{ width: 96, height: 96, borderRadius: '50%', objectFit: 'cover', border: `3px solid ${selfieUrl ? 'rgba(34,211,238,0.6)' : 'rgba(255,255,255,0.2)'}` }} />
            <div style={{ fontSize: 13, fontWeight: 500, color: uploading ? C.sub : selfieUrl ? '#22d3ee' : '#f43f5e' }}>
              {uploading ? 'Uploading…' : selfieUrl ? '✓ Selfie ready — tap to change' : 'Upload failed'}
            </div>
          </>
        ) : (
          <>
            <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg,rgba(34,211,238,0.15),rgba(139,92,246,0.1))', border: '1px dashed rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Camera size={30} color="rgba(255,255,255,0.4)" strokeWidth={1.5} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 500 }}>Upload your selfie</div>
              <div style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>One clear face photo · front-facing works best</div>
            </div>
          </>
        )}
      </PressBtn>

      {/* Script + voice + duration + generate (revealed once selfie selected) */}
      {selfieBlob && (
        <AvatarGenerateForm
          script={script}          onScript={setScript}
          voices={voices}          voicesLoading={voicesLoading}
          voiceId={voiceId}        onVoice={setVoiceId}
          duration={duration}      onDuration={setDuration}
          generating={generating}  jobStatus={jobStatus}
          videoUrl={videoUrl}      onGenerate={generate}
        />
      )}

      {error && (
        <div style={{ marginTop: 12, padding: '12px 16px', borderRadius: 14, background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', fontSize: 13, color: '#f43f5e' }}>⚠ {error}</div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────
   LIP SYNC STUDIO
──────────────────────────────────────────────*/
function LipSyncStudio({ onBack, showToast, onGenerated, plan = 'free' }) {
  const [videoMode, setVideoMode]         = useState('upload')  // 'upload' | 'avatar'
  const [videoBlobUrl, setVideoBlobUrl]   = useState(null)
  const [videoPublicUrl, setVideoPublicUrl] = useState(null)
  const [videoUploading, setVideoUploading] = useState(false)
  const [avatars, setAvatars]             = useState([])
  const [avatarsLoaded, setAvatarsLoaded] = useState(false)
  const [avatarsLoading, setAvatarsLoading] = useState(false)
  const [selectedAvatar, setSelectedAvatar] = useState(null)

  const [audioMode, setAudioMode]         = useState('upload')  // 'upload' | 'voice'
  const [audioBlobUrl, setAudioBlobUrl]   = useState(null)
  const [audioPublicUrl, setAudioPublicUrl] = useState(null)
  const [audioUploading, setAudioUploading] = useState(false)
  const [voices, setVoices]               = useState([])
  const [voicesLoading, setVLoading]      = useState(true)
  const [voiceId, setVoiceId]             = useState('')
  const [ttsText, setTtsText]             = useState('')
  const [ttsLoading, setTtsLoading]       = useState(false)

  const [syncing, setSyncing]     = useState(false)
  const [jobId, setJobId]         = useState(null)
  const [jobStatus, setJobStatus] = useState(null)
  const [resultUrl, setResultUrl] = useState(null)
  const [error, setError]         = useState(null)
  const pollRef    = useRef()
  const vidFileRef = useRef()
  const audFileRef = useRef()

  // Load voices
  useEffect(() => {
    authFetch('/api/voices').then(r => r.json()).then(d => {
      const list = d.voices || []
      setVoices(list)
      if (list.length) setVoiceId(list[0].voice_id)
    }).catch(() => {}).finally(() => setVLoading(false))
  }, [])

  // Load avatars when avatar tab is opened
  useEffect(() => {
    if (videoMode !== 'avatar' || avatarsLoaded) return
    setAvatarsLoading(true)
    ;(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (plan === 'studio' && session) {
          const r = await fetch('/api/heygen', { headers: { Authorization: `Bearer ${session.access_token}` } })
          if (r.ok) { const d = await r.json(); if (d.avatars?.length) { setAvatars(d.avatars); setAvatarsLoaded(true); return } }
        }
        const r = await fetch('/api/avatars')
        const d = await r.json()
        setAvatars(d.presenters || [])
        setAvatarsLoaded(true)
      } catch {} finally { setAvatarsLoading(false) }
    })()
  }, [videoMode, avatarsLoaded, plan])

  // Upload file to Supabase Storage (public bucket: lipsync-media)
  const uploadFile = async (file, prefix) => {
    const { data: { session } } = await supabase.auth.getSession()
    const ext  = file.name.split('.').pop() || 'bin'
    const path = `${session.user.id}/${prefix}-${Date.now()}.${ext}`
    const { data, error: uploadErr } = await supabase.storage
      .from('lipsync-media').upload(path, file, { upsert: true, contentType: file.type })
    if (uploadErr) throw new Error(uploadErr.message)
    const { data: pub } = supabase.storage.from('lipsync-media').getPublicUrl(data.path)
    return pub.publicUrl
  }

  const handleVideoFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    setVideoBlobUrl(URL.createObjectURL(file)); setVideoPublicUrl(null); setVideoUploading(true)
    try { setVideoPublicUrl(await uploadFile(file, 'vid')) }
    catch { showToast('Upload failed — create public bucket "lipsync-media" in Supabase') }
    finally { setVideoUploading(false) }
  }

  const handleAudioFile = async (e) => {
    const file = e.target.files?.[0]; if (!file) return
    setAudioBlobUrl(URL.createObjectURL(file)); setAudioPublicUrl(null); setAudioUploading(true)
    try { setAudioPublicUrl(await uploadFile(file, 'aud')) }
    catch { showToast('Upload failed — create public bucket "lipsync-media" in Supabase') }
    finally { setAudioUploading(false) }
  }

  const generateVoice = async () => {
    if (!ttsText.trim()) { showToast('Add script text first'); return }
    setTtsLoading(true); setAudioBlobUrl(null); setAudioPublicUrl(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session && { Authorization: `Bearer ${session.access_token}` }) },
        body: JSON.stringify({ text: ttsText, voiceId }),
      })
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      setAudioBlobUrl(URL.createObjectURL(blob))
      const file = new File([blob], `tts-${Date.now()}.mp3`, { type: 'audio/mpeg' })
      setAudioPublicUrl(await uploadFile(file, 'tts'))
    } catch { showToast('Voice generation failed') } finally { setTtsLoading(false) }
  }

  const finalVideoUrl = videoMode === 'avatar'
    ? (selectedAvatar?.preview_url ?? null)
    : videoPublicUrl

  const hasVideoSrc = videoMode === 'avatar' ? !!selectedAvatar : !!videoBlobUrl
  const readyToSync = !!finalVideoUrl && !!audioPublicUrl && !syncing

  const syncLips = async () => {
    if (!finalVideoUrl) { showToast(videoMode === 'avatar' ? 'Selected avatar has no video preview URL' : 'Video still uploading…'); return }
    if (!audioPublicUrl) { showToast('Audio still uploading…'); return }
    setSyncing(true); setError(null); setResultUrl(null)
    clearInterval(pollRef.current); setJobId(null); setJobStatus(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/lipsync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session && { Authorization: `Bearer ${session.access_token}` }) },
        body: JSON.stringify({ videoUrl: finalVideoUrl, audioUrl: audioPublicUrl }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); setSyncing(false); return }
      onGenerated?.(data.balance)
      setJobId(data.jobId); setJobStatus('processing')
    } catch { setError('Connection failed'); setSyncing(false) }
  }

  useEffect(() => {
    if (!jobId) return
    const poll = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        const res = await fetch(`/api/status?jobId=${jobId}&provider=synclabs`, {
          headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
        })
        const d = await res.json()
        setJobStatus(d.status)
        if (d.status === 'complete') {
          setResultUrl(d.url); setSyncing(false); clearInterval(pollRef.current); onGenerated?.()
        } else if (d.status === 'failed') {
          setError('Lip sync failed. Try again.'); setSyncing(false); clearInterval(pollRef.current)
        }
      } catch {}
    }
    pollRef.current = setInterval(poll, 4000)
    poll()
    return () => clearInterval(pollRef.current)
  }, [jobId])

  const tab = (active) => ({
    flex: 1, padding: '8px 12px', borderRadius: 100, fontSize: 12, fontWeight: 500,
    background: active ? 'rgba(139,92,246,0.2)' : 'transparent',
    border: active ? '1px solid rgba(139,92,246,0.4)' : '1px solid transparent',
    color: active ? '#a78bfa' : C.sub, fontFamily: 'inherit', textAlign: 'center',
  })

  return (
    <div style={{ minHeight: '100vh', padding: '50px 20px 40px', animation: 'fadeIn 0.3s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <PressBtn onClick={onBack} style={ghostBtn}><ArrowLeft size={18} /></PressBtn>
      </div>

      {/* Header */}
      <div style={{ marginTop: 18, marginBottom: 24 }}>
        <div style={{ width: 50, height: 50, borderRadius: 16, background: 'linear-gradient(135deg,rgba(139,92,246,0.3),rgba(34,211,238,0.2))', border: '1px solid rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Mic size={22} color="#fff" strokeWidth={1.6} />
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 300, margin: '12px 0 4px' }}>Lip Sync Studio</h1>
        <p style={{ margin: 0, fontSize: 13, color: C.sub }}>Sync Labs · upload a video or pick an avatar, add audio</p>
      </div>

      {/* ── STEP 1: VIDEO ── */}
      <label style={labelStyle}>1 · Video source</label>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, marginBottom: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 100, padding: 4 }}>
        <PressBtn style={tab(videoMode === 'upload')} onClick={() => setVideoMode('upload')}>Upload Video</PressBtn>
        <PressBtn style={tab(videoMode === 'avatar')} onClick={() => setVideoMode('avatar')}>Pick Avatar</PressBtn>
      </div>

      {videoMode === 'upload' && (
        <>
          <input ref={vidFileRef} type="file" accept="video/*" style={{ display: 'none' }} onChange={handleVideoFile} />
          <PressBtn onClick={() => vidFileRef.current?.click()} style={{ width: '100%', padding: 20, borderRadius: 20, background: videoBlobUrl ? 'rgba(139,92,246,0.08)' : 'rgba(255,255,255,0.03)', border: videoBlobUrl ? '1px solid rgba(139,92,246,0.3)' : '1px dashed rgba(255,255,255,0.15)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: C.text, fontFamily: 'inherit' }}>
            {videoBlobUrl
              ? <><Film size={22} color="#a78bfa" /><span style={{ fontSize: 13, fontWeight: 500, color: '#a78bfa' }}>{videoUploading ? 'Uploading…' : videoPublicUrl ? '✓ Video ready' : 'Upload failed'}</span></>
              : <><Upload size={22} color="rgba(255,255,255,0.4)" strokeWidth={1.5} /><span style={{ fontSize: 14, fontWeight: 500 }}>Upload video</span><span style={{ fontSize: 11, color: C.sub }}>MP4, MOV, WebM</span></>}
          </PressBtn>
          {videoBlobUrl && (
            <div style={{ marginTop: 10, borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)' }}>
              <video src={videoBlobUrl} style={{ width: '100%', maxHeight: 200, display: 'block', background: '#000' }} muted playsInline loop autoPlay />
            </div>
          )}
        </>
      )}

      {videoMode === 'avatar' && (
        avatarsLoading
          ? <div style={{ padding: 24, textAlign: 'center', color: C.sub, fontSize: 13 }}>Loading avatars…</div>
          : !avatars.length
            ? <div style={{ padding: 24, textAlign: 'center', color: C.sub, fontSize: 13, borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)' }}>No avatars — check D-ID or HeyGen API keys</div>
            : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxHeight: 280, overflowY: 'auto' }}>
                {avatars.map(a => {
                  const sel = selectedAvatar?.id === a.id
                  return (
                    <PressBtn key={a.id} onClick={() => setSelectedAvatar(a)} style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', border: `2px solid ${sel ? '#8b5cf6' : 'rgba(255,255,255,0.08)'}`, padding: 0, background: 'transparent', aspectRatio: '3/4', display: 'block' }}>
                      {a.thumbnail_url
                        ? <img src={a.thumbnail_url} alt={a.name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                        : <div style={{ width: '100%', height: '100%', background: 'rgba(139,92,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>🎭</div>}
                      {sel && <div style={{ position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: '50%', background: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={11} color="#fff" /></div>}
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '18px 8px 6px', background: 'linear-gradient(transparent,rgba(0,0,0,0.75))', fontSize: 11, color: '#fff', fontWeight: 500, textAlign: 'left' }}>{a.name}</div>
                    </PressBtn>
                  )
                })}
              </div>
            )
      )}
      {videoMode === 'avatar' && selectedAvatar && !selectedAvatar.preview_url && (
        <div style={{ marginTop: 8, padding: '8px 12px', borderRadius: 10, background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', fontSize: 11, color: C.gold }}>
          ⚠ This avatar has no video preview URL — lip sync may fail
        </div>
      )}

      {/* ── STEP 2: AUDIO ── */}
      <label style={{ ...labelStyle, marginTop: 24, display: 'block' }}>2 · Audio source</label>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, marginBottom: 12, background: 'rgba(255,255,255,0.03)', borderRadius: 100, padding: 4 }}>
        <PressBtn style={tab(audioMode === 'upload')} onClick={() => setAudioMode('upload')}>Upload Audio</PressBtn>
        <PressBtn style={tab(audioMode === 'voice')} onClick={() => setAudioMode('voice')}>Generate Voice</PressBtn>
      </div>

      {audioMode === 'upload' && (
        <>
          <input ref={audFileRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={handleAudioFile} />
          <PressBtn onClick={() => audFileRef.current?.click()} style={{ width: '100%', padding: 20, borderRadius: 20, background: audioBlobUrl ? 'rgba(34,211,238,0.06)' : 'rgba(255,255,255,0.03)', border: audioBlobUrl ? '1px solid rgba(34,211,238,0.3)' : '1px dashed rgba(255,255,255,0.15)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: C.text, fontFamily: 'inherit' }}>
            {audioBlobUrl
              ? <><Volume2 size={22} color="#22d3ee" /><span style={{ fontSize: 13, fontWeight: 500, color: '#22d3ee' }}>{audioUploading ? 'Uploading…' : audioPublicUrl ? '✓ Audio ready' : 'Upload failed'}</span></>
              : <><Upload size={22} color="rgba(255,255,255,0.4)" strokeWidth={1.5} /><span style={{ fontSize: 14, fontWeight: 500 }}>Upload audio</span><span style={{ fontSize: 11, color: C.sub }}>MP3, WAV, M4A</span></>}
          </PressBtn>
          {audioBlobUrl && <audio controls src={audioBlobUrl} style={{ width: '100%', marginTop: 10 }} />}
        </>
      )}

      {audioMode === 'voice' && (
        <div>
          <VoicePicker voices={voices} selectedId={voiceId} onSelect={setVoiceId} loading={voicesLoading} />
          <label style={{ ...labelStyle, marginTop: 16, display: 'block' }}>Script</label>
          <div style={{ marginTop: 8, borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
            <textarea value={ttsText} onChange={e => setTtsText(e.target.value)} placeholder="Type what the presenter should say…"
              style={{ width: '100%', minHeight: 90, padding: 14, background: 'transparent', border: 'none', outline: 'none', color: C.text, fontSize: 14, fontFamily: 'inherit', resize: 'none', lineHeight: 1.5 }} />
          </div>
          <PressBtn onClick={generateVoice} disabled={ttsLoading || !ttsText.trim()}
            style={{ ...ghostBtn, marginTop: 10, opacity: ttsLoading || !ttsText.trim() ? 0.5 : 1 }}>
            {ttsLoading
              ? <><div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 1s linear infinite' }} />Generating voice…</>
              : <><Volume2 size={14} />Generate Voice</>}
          </PressBtn>
          {audioBlobUrl && <audio controls src={audioBlobUrl} style={{ width: '100%', marginTop: 10 }} />}
          {audioBlobUrl && audioPublicUrl && <div style={{ marginTop: 4, fontSize: 11, color: '#22d3ee' }}>✓ Voice ready</div>}
        </div>
      )}

      {/* ── PREVIEW (both sources ready) ── */}
      {hasVideoSrc && audioBlobUrl && !resultUrl && (
        <div style={{ marginTop: 24, borderRadius: 20, background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)', padding: 16 }}>
          <div style={{ fontSize: 11, color: '#a78bfa', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>Preview · review before syncing</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            {/* Video thumbnail */}
            <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: '#000', aspectRatio: '9/16', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {videoMode === 'avatar' && selectedAvatar?.thumbnail_url
                ? <img src={selectedAvatar.thumbnail_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : videoBlobUrl
                  ? <video src={videoBlobUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline loop autoPlay />
                  : <Film size={24} color={C.sub} />}
              <div style={{ position: 'absolute', bottom: 6, left: 0, right: 0, textAlign: 'center', fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
                {videoPublicUrl || selectedAvatar?.preview_url ? '✓ Ready' : videoUploading ? 'Uploading…' : ''}
              </div>
            </div>
            {/* Audio panel */}
            <div style={{ borderRadius: 12, border: '1px solid rgba(34,211,238,0.2)', background: 'rgba(34,211,238,0.04)', aspectRatio: '9/16', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 10 }}>
              <Volume2 size={28} color="#22d3ee" />
              <div style={{ fontSize: 12, color: '#22d3ee', fontWeight: 500, textAlign: 'center' }}>
                {audioPublicUrl ? 'Audio ready' : 'Uploading…'}
              </div>
              {audioBlobUrl && <audio controls src={audioBlobUrl} style={{ width: '100%' }} />}
            </div>
          </div>
          <PressBtn onClick={syncLips} disabled={!readyToSync}
            style={{ ...primaryBtn, width: '100%', justifyContent: 'center', opacity: readyToSync ? 1 : 0.5 }}>
            <Mic size={16} /> Sync Lips
          </PressBtn>
          {!readyToSync && (videoUploading || audioUploading) && (
            <div style={{ marginTop: 8, textAlign: 'center', fontSize: 11, color: C.sub }}>Waiting for uploads to finish…</div>
          )}
        </div>
      )}

      {/* Syncing */}
      {syncing && (
        <div style={{ marginTop: 20, padding: 28, borderRadius: 20, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: '50%', border: '3px solid rgba(139,92,246,0.2)', borderTopColor: '#8b5cf6', animation: 'spin 1s linear infinite' }} />
          <div style={{ fontSize: 13, color: C.sub }}>Syncing lips…</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>Sync Labs is processing · usually 1–3 min</div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div style={{ marginTop: 12, padding: '12px 16px', borderRadius: 14, background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', fontSize: 13, color: '#f43f5e' }}>⚠ {error}</div>
      )}

      {/* Result */}
      {resultUrl && (
        <div style={{ marginTop: 20, borderRadius: 20, overflow: 'hidden', border: '1px solid rgba(139,92,246,0.3)', animation: 'slideUp 0.4s ease' }}>
          <div style={{ position: 'relative' }}>
            <video controls autoPlay style={{ width: '100%', display: 'block', background: '#000' }}>
              <source src={resultUrl} type="video/mp4" />
            </video>
            <WatermarkOverlay plan={plan} />
          </div>
          <div style={{ padding: '12px 16px', background: 'rgba(139,92,246,0.08)', display: 'flex', gap: 10 }}>
            <a href={resultUrl} download="omnyra-lipsync.mp4" target="_blank" rel="noreferrer"
              style={{ ...primaryBtn, flex: 1, justifyContent: 'center', textDecoration: 'none' }}>
              <Copy size={14} /> Download
            </a>
            <PressBtn onClick={() => { setResultUrl(null); setSyncing(false); setJobId(null); setJobStatus(null) }}
              style={{ ...ghostBtn, flex: 1, justifyContent: 'center' }}>
              New Sync
            </PressBtn>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────
   AI IMAGE TOOL
──────────────────────────────────────────────*/
const FLUX_LABEL = { free: 'FLUX Schnell', creator: 'FLUX Schnell', pro: 'FLUX Dev', studio: 'FLUX Pro' };

function ImageTool({ onBack, showToast, onGenerated, plan = 'free' }) {
  const [prompt, setPrompt]   = useState("");
  const [style, setStyle]     = useState("realistic");
  const [loading, setLoading] = useState(false);
  const [imageUrl, setImageUrl] = useState(null);
  const [error, setError]     = useState(null);

  const generate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setImageUrl(null);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session && { Authorization: `Bearer ${session.access_token}` }),
        },
        body: JSON.stringify({ prompt, style }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); return; }
      setImageUrl(data.url);
      onGenerated?.(data.balance);
    } catch {
      setError("Connection failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", padding: "50px 20px 40px", animation: "fadeIn 0.3s ease" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <PressBtn onClick={onBack} style={ghostBtn}><ArrowLeft size={18} /></PressBtn>
      </div>

      <div style={{ marginTop: 18, marginBottom: 24 }}>
        <div style={{ width: 50, height: 50, borderRadius: 16, background: "linear-gradient(135deg,rgba(139,92,246,0.3),rgba(34,211,238,0.2))", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ImageIcon size={22} color="#fff" strokeWidth={1.6} />
        </div>
        <h1 style={{ marginTop: 12, fontSize: 26, fontWeight: 300, margin: "12px 0 4px" }}>AI Image</h1>
        <p style={{ margin: 0, fontSize: 13, color: C.sub }}>Generate images with {FLUX_LABEL[plan] ?? 'FLUX'}</p>
      </div>

      <label style={labelStyle}>Describe your image</label>
      <div style={{ marginTop: 8, borderRadius: 20, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="A cinematic portrait of an astronaut on Mars at golden hour…"
          style={{ width: "100%", minHeight: 110, padding: 16, background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 14, fontFamily: "inherit", resize: "none", lineHeight: 1.5 }}
        />
        <div style={{ padding: "8px 12px 12px", display: "flex", justifyContent: "flex-end" }}>
          <div style={{ fontSize: 10, color: C.sub }}>{prompt.length} chars</div>
        </div>
      </div>

      <StylePicker style={style} setStyle={setStyle} />

      <PressBtn
        onClick={generate}
        disabled={loading || !prompt.trim()}
        style={{ ...primaryBtn, width: "100%", justifyContent: "center", marginTop: 16, opacity: loading || !prompt.trim() ? 0.5 : 1 }}
      >
        {loading
          ? <><div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", animation: "spin 1s linear infinite" }} /> Generating…</>
          : <><Sparkles size={16} /> {imageUrl ? "Regenerate" : "Generate Image"}</>}
      </PressBtn>

      {error && (
        <div style={{ marginTop: 12, padding: "12px 16px", borderRadius: 14, background: "rgba(244,63,94,0.1)", border: "1px solid rgba(244,63,94,0.3)", fontSize: 13, color: "#f43f5e" }}>⚠ {error}</div>
      )}

      {loading && !imageUrl && (
        <div style={{ marginTop: 20, padding: 24, borderRadius: 20, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: "50%", border: "3px solid rgba(139,92,246,0.2)", borderTopColor: "#8b5cf6", animation: "spin 1s linear infinite" }} />
          <div style={{ fontSize: 13, color: C.sub }}>FLUX is painting your image…</div>
        </div>
      )}

      {imageUrl && (
        <div style={{ marginTop: 20, borderRadius: 20, overflow: "hidden", border: "1px solid rgba(139,92,246,0.3)", animation: "slideUp 0.4s ease" }}>
          <div style={{ position: "relative" }}>
            <img src={imageUrl} alt={prompt} style={{ width: "100%", display: "block" }} />
            <WatermarkOverlay plan={plan} />
          </div>
          <div style={{ padding: "12px 16px", background: "rgba(139,92,246,0.08)", display: "flex", gap: 10 }}>
            <a
              href={imageUrl}
              download="omnyra-image.jpg"
              target="_blank"
              rel="noreferrer"
              style={{ ...primaryBtn, flex: 1, justifyContent: "center", textDecoration: "none" }}
            >
              <Copy size={14} /> Download
            </a>
            <PressBtn onClick={() => { navigator.clipboard.writeText(imageUrl); showToast("URL copied! ✓"); }} style={{ ...ghostBtn, flex: 1, justifyContent: "center" }}>
              <Copy size={14} /> Copy URL
            </PressBtn>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   VOICE PICKER (shared)
──────────────────────────────────────────────*/
function VoicePicker({ voices, selectedId, onSelect, loading }) {
  const [playing, setPlaying] = useState(null);
  const audioRef = useRef(null);

  const togglePreview = (voice, e) => {
    e.stopPropagation();
    if (playing === voice.voice_id) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    audioRef.current?.pause();
    if (!voice.preview_url) return;
    const audio = new Audio(voice.preview_url);
    audioRef.current = audio;
    setPlaying(voice.voice_id);
    audio.play().catch(() => {});
    audio.onended = () => setPlaying(null);
    audio.onerror = () => setPlaying(null);
  };

  useEffect(() => () => { audioRef.current?.pause(); }, []);

  if (loading) return (
    <div style={{ padding: "16px", textAlign: "center", color: C.sub, fontSize: 13, borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)" }}>
      Loading voices…
    </div>
  );

  return (
    <div style={{ maxHeight: 260, overflowY: "auto", borderRadius: 16, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}>
      {voices.map((v, i) => {
        const sel = v.voice_id === selectedId;
        const isPlaying = playing === v.voice_id;
        const cat = v.category || "premade";
        const catLabel = cat.charAt(0).toUpperCase() + cat.slice(1);
        const isCyan = cat === "cloned" || cat === "generated";
        return (
          <div
            key={v.voice_id}
            onClick={() => onSelect(v.voice_id)}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "11px 14px",
              background: sel ? "linear-gradient(135deg,rgba(139,92,246,0.15),rgba(34,211,238,0.08))" : "transparent",
              borderBottom: i < voices.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
              cursor: "pointer",
            }}
          >
            <PressBtn
              onClick={e => togglePreview(v, e)}
              style={{
                width: 32, height: 32, borderRadius: "50%", flexShrink: 0,
                background: isPlaying ? "rgba(139,92,246,0.25)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${isPlaying ? "rgba(139,92,246,0.5)" : "rgba(255,255,255,0.1)"}`,
                display: "flex", alignItems: "center", justifyContent: "center", padding: 0,
              }}
            >
              {isPlaying
                ? <Square size={10} color="#a78bfa" fill="#a78bfa" />
                : <Play size={11} color="rgba(255,255,255,0.5)" fill="rgba(255,255,255,0.5)" />
              }
            </PressBtn>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: sel ? 600 : 400, color: sel ? "#fff" : C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {v.name}
              </div>
              <div style={{ marginTop: 2, display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{
                  fontSize: 10, padding: "1px 7px", borderRadius: 100,
                  background: isCyan ? "rgba(34,211,238,0.1)" : "rgba(139,92,246,0.1)",
                  color: isCyan ? "#22d3ee" : "#a78bfa",
                  border: `1px solid ${isCyan ? "rgba(34,211,238,0.2)" : "rgba(139,92,246,0.2)"}`,
                }}>
                  {catLabel}
                </span>
                {v.labels?.gender && <span style={{ fontSize: 10, color: C.sub }}>{v.labels.gender}</span>}
                {v.labels?.accent && <span style={{ fontSize: 10, color: C.sub }}>· {v.labels.accent}</span>}
              </div>
            </div>
            {sel && <Check size={14} color="#8b5cf6" style={{ flexShrink: 0 }} />}
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────
   AI VOICE TOOL
──────────────────────────────────────────────*/
function VoiceTool({ onBack, showToast, onGenerated }) {
  const [voices, setVoices]          = useState([]);
  const [voicesLoading, setVLoading] = useState(true);
  const [voiceId, setVoiceId]        = useState("");
  const [text, setText]              = useState("");
  const [loading, setLoading]        = useState(false);
  const [audioUrl, setAudioUrl]      = useState(null);
  const audioRef                     = useRef();

  useEffect(() => {
    authFetch("/api/voices")
      .then(r => r.json())
      .then(d => {
        const list = d.voices || [];
        setVoices(list);
        if (list.length) setVoiceId(list[0].voice_id);
      })
      .catch(() => showToast("Failed to load voices"))
      .finally(() => setVLoading(false));
  }, []);

  useEffect(() => {
    if (audioUrl && audioRef.current) {
      audioRef.current.load();
      audioRef.current.play().catch(() => {});
    }
  }, [audioUrl]);

  const generate = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setAudioUrl(null);
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
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      setAudioUrl(URL.createObjectURL(blob));
      const remaining = res.headers.get("X-Credits-Remaining");
      onGenerated?.(remaining !== null ? Number(remaining) : undefined);
    } catch {
      showToast("Voice generation failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", padding: "50px 20px 40px", animation: "fadeIn 0.3s ease" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <PressBtn onClick={onBack} style={ghostBtn}><ArrowLeft size={18} /></PressBtn>
      </div>

      <div style={{ marginTop: 18, marginBottom: 24 }}>
        <div style={{ width: 50, height: 50, borderRadius: 16, background: "linear-gradient(135deg,rgba(139,92,246,0.3),rgba(34,211,238,0.2))", border: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Volume2 size={22} color="#fff" strokeWidth={1.6} />
        </div>
        <h1 style={{ marginTop: 12, fontSize: 26, fontWeight: 300, margin: "12px 0 4px" }}>AI Voice</h1>
        <p style={{ margin: 0, fontSize: 13, color: C.sub }}>Text-to-speech powered by ElevenLabs</p>
      </div>

      <label style={labelStyle}>Voice</label>
      <div style={{ marginTop: 8 }}>
        <VoicePicker voices={voices} selectedId={voiceId} onSelect={setVoiceId} loading={voicesLoading} />
      </div>

      <label style={{ ...labelStyle, marginTop: 20, display: "block" }}>What should it say?</label>
      <div style={{ marginTop: 8, borderRadius: 20, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden" }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Type the text you want spoken…"
          style={{ width: "100%", minHeight: 120, padding: 16, background: "transparent", border: "none", outline: "none", color: C.text, fontSize: 14, fontFamily: "inherit", resize: "none", lineHeight: 1.5 }}
        />
        <div style={{ padding: "8px 12px 12px", display: "flex", justifyContent: "flex-end" }}>
          <div style={{ fontSize: 10, color: C.sub }}>{text.length} chars</div>
        </div>
      </div>

      <PressBtn
        onClick={generate}
        disabled={loading || !text.trim() || !voiceId}
        style={{ ...primaryBtn, width: "100%", justifyContent: "center", marginTop: 16, opacity: loading || !text.trim() ? 0.5 : 1 }}
      >
        {loading ? <><RefreshCw size={16} style={{ animation: "spin 1s linear infinite" }} /> Generating…</> : <><Volume2 size={16} /> Generate Voice</>}
      </PressBtn>

      {audioUrl && (
        <div style={{ marginTop: 20, padding: 20, borderRadius: 20, background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.25)" }}>
          <div style={{ fontSize: 12, color: C.sub, marginBottom: 12, letterSpacing: "0.08em", textTransform: "uppercase", fontWeight: 500 }}>Playback</div>
          <audio ref={audioRef} controls style={{ width: "100%", accentColor: "#8b5cf6" }}>
            <source src={audioUrl} type="audio/mpeg" />
          </audio>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   VOICE CLONE STUDIO
──────────────────────────────────────────────*/
function VoiceCloneStudio({ mode, setMode, onBack, showToast }) {
  const [method,setMethod]           = useState(null); // "record" | "upload" | "describe"
  const [recording,setRec]           = useState(false);
  const [recTime,setRecTime]         = useState(0);
  const [recBlob,setRecBlob]         = useState(null);
  const [uploadFile,setUpload]       = useState(null);
  const [description,setDescription] = useState("");
  const [voiceId,setVoiceId]         = useState("");
  const [voices,setVoices]           = useState([]);
  const [voicesLoading,setVLoading]  = useState(true);
  const [consent,setConsent]         = useState(false);
  const [generating,setGen]          = useState(false);
  const [voiceName,setVoiceName]     = useState("My Cloned Voice");
  const [clonedVoice,setClonedVoice] = useState(null);
  const [cloneError,setCloneError]   = useState(null);
  const mediaRec                     = useRef(null);
  const timerRef                     = useRef(null);
  const chunks                       = useRef([]);
  const fileRef                      = useRef();

  useEffect(() => {
    authFetch("/api/voices")
      .then(r => r.json())
      .then(d => {
        const list = d.voices || [];
        setVoices(list);
        if (list.length) setVoiceId(list[0].voice_id);
      })
      .catch(() => {})
      .finally(() => setVLoading(false));
  }, []);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio:true});
      chunks.current = [];
      mediaRec.current = new MediaRecorder(stream);
      mediaRec.current.ondataavailable = e => chunks.current.push(e.data);
      mediaRec.current.onstop = () => {
        const blob = new Blob(chunks.current,{type:"audio/webm"});
        setRecBlob(blob);
        stream.getTracks().forEach(t=>t.stop());
        showToast("Recording saved! ✓");
      };
      mediaRec.current.start();
      setRec(true); setRecTime(0);
      timerRef.current = setInterval(()=>setRecTime(t=>{if(t>=30){stopRecording();return 30;}return t+1;}),1000);
    } catch { showToast("Microphone permission needed"); }
  };

  const stopRecording = () => {
    if (mediaRec.current?.state==="recording") mediaRec.current.stop();
    setRec(false); clearInterval(timerRef.current);
  };

  useEffect(()=>()=>{clearInterval(timerRef.current);},[]);

  const generate = async () => {
    if (!consent){showToast("Please confirm voice consent first");return;}
    const audioFile = recBlob || uploadFile;
    if (!audioFile){showToast("Voice cloning requires audio — record or upload a sample first");return;}
    setGen(true); setCloneError(null); setClonedVoice(null);
    try {
      const { data:{session} } = await supabase.auth.getSession();
      const fd = new FormData();
      fd.append("audio", audioFile instanceof Blob && !(audioFile instanceof File)
        ? new File([audioFile],"recording.webm",{type:"audio/webm"})
        : audioFile);
      fd.append("name", voiceName || "My Cloned Voice");
      const res = await fetch("/api/clone",{
        method:"POST",
        headers: session ? {Authorization:`Bearer ${session.access_token}`} : {},
        body: fd,
      });
      const data = await res.json();
      if (!res.ok||data.error){setCloneError(data.error||"Clone failed");showToast("Clone failed");return;}
      setClonedVoice(data);
      showToast("Voice cloned! 🎤");
    } catch { setCloneError("Network error. Please try again."); }
    finally { setGen(false); }
  };

  return (
    <div style={{minHeight:"100vh",padding:"50px 20px 40px",animation:"fadeIn 0.3s ease"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
        <PressBtn onClick={onBack} style={ghostBtn}><ArrowLeft size={18}/></PressBtn>
        <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:100,background:"rgba(34,211,238,0.1)",border:"1px solid rgba(34,211,238,0.25)",fontSize:10,fontWeight:600,color:"#22d3ee"}}>🎤 VOICE CLONE</div>
      </div>

      <div style={{marginBottom:18}}>
        <div style={{width:50,height:50,borderRadius:16,background:"linear-gradient(135deg,rgba(34,211,238,0.3),rgba(139,92,246,0.2))",border:"1px solid rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center"}}><Mic2 size={22} color="#67e8f9" strokeWidth={1.6}/></div>
        <h1 style={{marginTop:12,fontSize:26,fontWeight:300,letterSpacing:"-0.03em",margin:"12px 0 4px"}}>Voice Clone Studio</h1>
        <p style={{margin:0,fontSize:13,color:C.sub}}>Record · Upload · Clone instantly · Powered by ElevenLabs</p>
      </div>

      {/* Method selector */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:18}}>
        {[{id:"record",label:"Record",emoji:"🎙️"},{id:"upload",label:"Upload",emoji:"📁"},{id:"describe",label:"Describe",emoji:"✍️"}].map(m=>{
          const a=method===m.id;
          return <PressBtn key={m.id} onClick={()=>setMethod(m.id)} style={{padding:"14px 8px",borderRadius:16,background:a?"linear-gradient(135deg,rgba(34,211,238,0.2),rgba(139,92,246,0.15))":"rgba(255,255,255,0.04)",border:a?"1.5px solid rgba(34,211,238,0.5)":"1px solid rgba(255,255,255,0.08)",color:a?"#fff":C.sub,display:"flex",flexDirection:"column",alignItems:"center",gap:6,fontFamily:"inherit"}}>
            <span style={{fontSize:22}}>{m.emoji}</span>
            <span style={{fontSize:12,fontWeight:a?600:400}}>{m.label}</span>
          </PressBtn>;
        })}
      </div>

      {/* RECORD */}
      {method==="record"&&(
        <div style={{marginBottom:16}}>
          <div style={{padding:"20px 18px",borderRadius:22,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",textAlign:"center"}}>
            {!recording&&!recBlob&&(
              <>
                <div style={{fontSize:13,color:C.sub,marginBottom:16}}>Press and talk for 30 seconds. More audio = better quality.</div>
                <PressBtn onClick={startRecording} style={{width:80,height:80,borderRadius:"50%",background:"linear-gradient(135deg,#f43f5e,#dc2626)",border:"none",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto",boxShadow:"0 8px 32px rgba(244,63,94,0.5)"}}>
                  <Mic2 size={32} color="#fff" strokeWidth={1.5}/>
                </PressBtn>
                <div style={{marginTop:14,fontSize:12,color:C.sub}}>Tap to start recording</div>
              </>
            )}
            {recording&&(
              <>
                <div style={{fontSize:24,fontWeight:300,marginBottom:12,color:"#f43f5e"}}>{recTime}s / 30s</div>
                <div style={{width:"100%",height:6,borderRadius:3,background:"rgba(255,255,255,0.1)",marginBottom:16,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${(recTime/30)*100}%`,background:"linear-gradient(90deg,#f43f5e,#fbbf24)",transition:"width 1s",borderRadius:3}}/>
                </div>
                <PressBtn onClick={stopRecording} style={{width:80,height:80,borderRadius:"50%",background:"rgba(244,63,94,0.2)",border:"2px solid #f43f5e",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto",animation:"pulse 1s ease-in-out infinite"}}>
                  <Square size={28} color="#f43f5e"/>
                </PressBtn>
                <div style={{marginTop:14,fontSize:12,color:"#f43f5e",fontWeight:500}}>🔴 Recording… tap to stop</div>
              </>
            )}
            {recBlob&&!recording&&(
              <div>
                <div style={{fontSize:36,marginBottom:8}}>✅</div>
                <div style={{fontSize:14,fontWeight:500,marginBottom:4}}>Recording saved ({recTime}s)</div>
                <div style={{fontSize:12,color:C.sub,marginBottom:14}}>Ready to clone with ElevenLabs</div>
                <PressBtn onClick={()=>{setRecBlob(null);setRecTime(0);}} style={{...ghostBtn,justifyContent:"center",width:"100%"}}>Record again</PressBtn>
              </div>
            )}
          </div>
        </div>
      )}

      {/* UPLOAD */}
      {method==="upload"&&(
        <div style={{marginBottom:16}}>
          <input ref={fileRef} type="file" accept="audio/*" style={{display:"none"}} onChange={e=>{if(e.target.files[0]){setUpload(e.target.files[0]);showToast("Audio uploaded! ✓");}}}/>
          <PressBtn onClick={()=>fileRef.current?.click()} style={{width:"100%",padding:20,borderRadius:20,background:uploadFile?"rgba(34,211,238,0.1)":"rgba(255,255,255,0.03)",border:uploadFile?"1px solid rgba(34,211,238,0.4)":"1px dashed rgba(255,255,255,0.15)",textAlign:"center",color:C.text,fontFamily:"inherit"}}>
            {uploadFile?(
              <div style={{display:"flex",alignItems:"center",gap:10,justifyContent:"center"}}><Check size={18} color="#22d3ee"/><div style={{fontSize:13,fontWeight:500}}>{uploadFile.name}</div></div>
            ):(
              <><div style={{fontSize:36,marginBottom:8}}>📁</div><div style={{fontSize:14,fontWeight:500}}>Upload voice sample</div><div style={{fontSize:12,color:C.sub,marginTop:4}}>MP3, WAV · 30 seconds minimum · 1–5 min for best quality</div></>
            )}
          </PressBtn>
        </div>
      )}

      {/* DESCRIBE */}
      {method==="describe"&&(
        <div style={{marginBottom:16}}>
          <label style={labelStyle}>Describe the voice you want</label>
          <div style={{marginTop:8,borderRadius:20,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",overflow:"hidden"}}>
            <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Deep cinematic narrator voice / Energetic anime girl voice / Calm educational explainer…" style={{width:"100%",minHeight:80,padding:16,background:"transparent",border:"none",outline:"none",color:C.text,fontSize:14,fontFamily:"inherit",resize:"none",lineHeight:1.5}}/>
          </div>
        </div>
      )}

      {/* Voice Style */}
      {method&&(
        <>
          <label style={labelStyle}>Clone name</label>
          <div style={{marginTop:8,marginBottom:16,borderRadius:14,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",overflow:"hidden"}}>
            <input value={voiceName} onChange={e=>setVoiceName(e.target.value)} placeholder="My Cloned Voice" style={{width:"100%",padding:"12px 16px",background:"transparent",border:"none",outline:"none",color:C.text,fontSize:14,fontFamily:"inherit",boxSizing:"border-box"}}/>
          </div>

          {/* Consent checkbox — REQUIRED */}
          <div onClick={()=>setConsent(c=>!c)} style={{padding:"14px 16px",borderRadius:16,background:consent?"rgba(34,211,238,0.08)":"rgba(244,63,94,0.05)",border:consent?"1px solid rgba(34,211,238,0.3)":"1px solid rgba(244,63,94,0.2)",display:"flex",alignItems:"flex-start",gap:12,cursor:"pointer",marginBottom:16}}>
            <div style={{width:22,height:22,borderRadius:6,background:consent?"linear-gradient(135deg,#22d3ee,#8b5cf6)":"rgba(255,255,255,0.06)",border:consent?"none":"1px solid rgba(255,255,255,0.2)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,marginTop:1}}>
              {consent&&<Check size={13} color="#fff"/>}
            </div>
            <div style={{fontSize:12,color:C.sub,lineHeight:1.6}}>
              <span style={{color:consent?"#22d3ee":"#f43f5e",fontWeight:600}}>Required: </span>
              I confirm I own or have permission to use this voice, and I accept responsibility for how this clone is used.
            </div>
          </div>

          {generating?(
            <div style={{padding:20,borderRadius:22,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",display:"flex",alignItems:"center",gap:14}}>
              <div style={{width:36,height:36,borderRadius:12,background:"linear-gradient(135deg,rgba(34,211,238,0.3),rgba(139,92,246,0.2))",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:16,height:16,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.2)",borderTopColor:"#22d3ee",animation:"spin 1s linear infinite"}}/></div>
              <div><div style={{fontSize:14,fontWeight:500}}>Cloning voice…</div><div style={{fontSize:11,color:C.sub}}>Sending audio to ElevenLabs</div></div>
            </div>
          ):(
            <PressBtn onClick={generate} style={{...primaryBtn,width:"100%",justifyContent:"center",padding:"15px 20px",fontSize:15,opacity:consent?1:0.5}}>
              🎤 Clone Voice
            </PressBtn>
          )}

          {clonedVoice&&(
            <div style={{marginTop:14,padding:"16px 18px",borderRadius:18,background:"rgba(34,211,238,0.08)",border:"1px solid rgba(34,211,238,0.3)"}}>
              <div style={{fontSize:13,fontWeight:600,color:"#22d3ee",marginBottom:4}}>✅ Voice cloned successfully!</div>
              <div style={{fontSize:12,color:C.sub}}>Name: <span style={{color:C.text}}>{clonedVoice.name}</span></div>
              <div style={{fontSize:11,color:C.sub,marginTop:2,wordBreak:"break-all"}}>Voice ID: <span style={{color:"#a78bfa"}}>{clonedVoice.voiceId}</span></div>
              <div style={{fontSize:11,color:C.sub,marginTop:6}}>Your cloned voice is now available in AI Voice &amp; Presenter Studio.</div>
            </div>
          )}
          {cloneError&&(
            <div style={{marginTop:14,padding:"12px 16px",borderRadius:14,background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.3)",fontSize:12,color:"#f87171"}}>
              {cloneError}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   MOTION STUDIO
──────────────────────────────────────────────*/
function MotionStudio({ mode, setMode, onBack, showToast, onGenerated, plan = 'free' }) {
  const [images, setImages]         = useState([null, null, null]);
  const [publicUrls, setPublicUrls] = useState([null, null, null]);
  const [action, setAction]         = useState("");
  const [style, setStyle]           = useState("cinematic");
  const [generating, setGenerating] = useState(false);
  const [jobId, setJobId]           = useState(null);
  const [provider, setProvider]     = useState(null);
  const [subtype, setSubtype]       = useState(null);
  const [jobStatus, setJobStatus]   = useState(null);
  const [videoUrl, setVideoUrl]     = useState(null);
  const [error, setError]           = useState(null);
  const fileRefs                    = [useRef(), useRef(), useRef()];
  const pollRef                     = useRef();
  const examples = ["Make them hug 🤗","Make the cat dance 🐱","Turn into cinematic trailer 🎬","Change outfit when she claps 👗","Anime fight ⚔️","Make this photo sing 🎵","Walk together 🚶","Pixar scene 🎨"];

  useEffect(() => {
    if (!jobId || !provider) return;
    const poll = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const qs = new URLSearchParams({ jobId, provider, ...(subtype && { subtype }) });
        const res = await fetch(`/api/status?${qs}`, {
          headers: session ? { Authorization: `Bearer ${session.access_token}` } : {},
        });
        const d = await res.json();
        setJobStatus(d.status);
        if (d.status === 'complete') {
          setVideoUrl(d.url); setGenerating(false); clearInterval(pollRef.current); onGenerated?.();
        } else if (d.status === 'failed') {
          setError('Video generation failed.'); setGenerating(false); clearInterval(pollRef.current);
        }
      } catch {}
    };
    pollRef.current = setInterval(poll, 4000);
    poll();
    return () => clearInterval(pollRef.current);
  }, [jobId, provider, subtype]);

  const handleUpload = async (idx, file) => {
    if (!file) return;
    const preview = URL.createObjectURL(file);
    const n = [...images]; n[idx] = { file, preview }; setImages(n);
    showToast(`Image ${idx+1} uploaded! ✅`);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `${session.user.id}/motion-${idx}-${Date.now()}.${ext}`;
      const { data, error: upErr } = await supabase.storage
        .from('lipsync-media').upload(path, file, { upsert: true, contentType: file.type });
      if (!upErr) {
        const { data: pub } = supabase.storage.from('lipsync-media').getPublicUrl(data.path);
        const u = [...publicUrls]; u[idx] = pub.publicUrl; setPublicUrls(u);
      }
    } catch {}
  };

  const removeImage = (idx) => {
    const n = [...images]; n[idx] = null; setImages(n);
    const u = [...publicUrls]; u[idx] = null; setPublicUrls(u);
  };

  const generate = async () => {
    const firstUrl = publicUrls.find(u => u);
    if (!firstUrl) { showToast("Upload at least one image first"); return; }
    if (!action.trim()) { showToast("Describe the action first"); return; }
    clearInterval(pollRef.current);
    setGenerating(true); setVideoUrl(null); setError(null);
    setJobId(null); setProvider(null); setSubtype(null); setJobStatus(null);
    const prompt = `${style} style: ${action}`;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(session && { Authorization: `Bearer ${session.access_token}` }) },
        body: JSON.stringify({ prompt, imageUrl: firstUrl, duration: 5 }),
      });
      const data = await res.json();
      if (data.error) { setError(data.error); setGenerating(false); return; }
      onGenerated?.(data.balance);
      if (data.status === 'complete' && data.url) {
        setVideoUrl(data.url); setGenerating(false);
      } else {
        setJobId(data.jobId); setProvider(data.provider); setSubtype(data.subtype ?? null); setJobStatus('processing');
      }
    } catch { setError("Connection failed."); setGenerating(false); }
  };

  const hasImage = publicUrls.some(u => u);

  return (
    <div style={{minHeight:"100vh",padding:"50px 20px 40px",animation:"fadeIn 0.3s ease"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18}}>
        <PressBtn onClick={onBack} style={ghostBtn}><ArrowLeft size={18}/></PressBtn>
        <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:100,background:"rgba(251,191,36,0.15)",border:"1px solid rgba(251,191,36,0.3)",fontSize:10,fontWeight:600,color:C.gold}}>🎬 MOTION STUDIO</div>
      </div>
      <div style={{marginBottom:18}}>
        <div style={{width:50,height:50,borderRadius:16,background:"linear-gradient(135deg,rgba(251,191,36,0.3),rgba(139,92,246,0.2))",border:"1px solid rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center"}}><Clapperboard size={22} color="#fbbf24" strokeWidth={1.6}/></div>
        <h1 style={{marginTop:12,fontSize:26,fontWeight:300,margin:"12px 0 2px"}}>Motion Studio AI</h1>
        <p style={{margin:"0 0 4px",fontSize:13,color:C.sub}}>{IMG2VIDEO_LABEL[plan] ?? 'Pika 2.2 · Fal AI'} · Image to video</p>
        <p style={{margin:0,fontSize:11,color:"rgba(251,191,36,0.7)"}}>Upload 1–3 images · describe action · generates cinematic motion</p>
      </div>
      <div style={{marginTop:16,padding:"14px 16px",borderRadius:20,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)"}}>
        <ModeGrid mode={mode} setMode={setMode}/>
      </div>
      <div style={{marginTop:16}}>
        <label style={labelStyle}>Upload images (up to 3)</label>
        <div style={{marginTop:8,display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
          {[0,1,2].map(idx=>(
            <div key={idx}>
              <input ref={fileRefs[idx]} type="file" accept="image/*" style={{display:"none"}} onChange={e=>handleUpload(idx,e.target.files[0])}/>
              <PressBtn onClick={()=>fileRefs[idx].current?.click()} style={{width:"100%",aspectRatio:"1",borderRadius:16,background:images[idx]?"transparent":"rgba(255,255,255,0.03)",border:images[idx]?`1px solid rgba(139,92,246,${publicUrls[idx]?0.6:0.25})`:"1px dashed rgba(255,255,255,0.15)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,overflow:"hidden",fontFamily:"inherit",padding:0}}>
                {images[idx]
                  ? <img src={images[idx].preview} alt="" style={{width:"100%",height:"100%",objectFit:"cover",borderRadius:16}}/>
                  : <><Upload size={20} color="rgba(255,255,255,0.4)" strokeWidth={1.5}/><span style={{fontSize:10,color:C.sub}}>Image {idx+1}</span></>}
              </PressBtn>
              {images[idx] && (
                <PressBtn onClick={()=>removeImage(idx)} style={{width:"100%",marginTop:4,padding:"4px 8px",borderRadius:8,background:"rgba(244,63,94,0.1)",border:"1px solid rgba(244,63,94,0.2)",color:"#f43f5e",fontSize:10,fontFamily:"inherit",justifyContent:"center",display:"flex"}}>
                  {publicUrls[idx] ? "Remove" : "Uploading…"}
                </PressBtn>
              )}
            </div>
          ))}
        </div>
      </div>
      <div style={{marginTop:16}}>
        <label style={labelStyle}>Describe the action</label>
        <div style={{marginTop:8,borderRadius:20,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",overflow:"hidden"}}>
          <textarea value={action} onChange={e=>setAction(e.target.value.slice(0,2000))} placeholder="Make the cat dance / Make them hug / Turn into anime fight…" style={{width:"100%",minHeight:80,padding:16,background:"transparent",border:"none",outline:"none",color:C.text,fontSize:14,fontFamily:"inherit",resize:"none",lineHeight:1.5}}/>
          <div style={{padding:"8px 12px 12px",fontSize:10,color:C.sub,textAlign:"right"}}>{action.length}/2000</div>
        </div>
      </div>
      <div style={{marginTop:12}}>
        <label style={labelStyle}>Quick examples</label>
        <div style={{marginTop:8,display:"flex",flexWrap:"wrap",gap:8}}>
          {examples.map(ex=><PressBtn key={ex} onClick={()=>setAction(ex.replace(/\s[^\s]+$/,""))} style={{padding:"6px 12px",borderRadius:100,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",color:C.sub,fontSize:11,fontFamily:"inherit"}}>{ex}</PressBtn>)}
        </div>
      </div>
      <StylePicker style={style} setStyle={setStyle}/>

      <PressBtn
        onClick={generate}
        disabled={generating || !hasImage || !action.trim()}
        style={{...primaryBtn, marginTop:14, width:"100%", justifyContent:"center", padding:"15px 20px", fontSize:15, opacity: generating || !hasImage || !action.trim() ? 0.5 : 1}}
      >
        {generating
          ? <><div style={{width:16,height:16,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"#fff",animation:"spin 1s linear infinite"}}/> Generating…</>
          : <><Clapperboard size={16}/> {videoUrl ? "Regenerate" : "Generate Motion Video"}</>}
      </PressBtn>

      {error && (
        <div style={{marginTop:12,padding:"12px 16px",borderRadius:14,background:"rgba(244,63,94,0.1)",border:"1px solid rgba(244,63,94,0.3)",fontSize:13,color:"#f43f5e"}}>⚠ {error}</div>
      )}

      {generating && !videoUrl && (
        <div style={{marginTop:20,padding:24,borderRadius:20,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
          <div style={{width:44,height:44,borderRadius:"50%",border:"3px solid rgba(251,191,36,0.2)",borderTopColor:"#fbbf24",animation:"spin 1s linear infinite"}}/>
          <div style={{fontSize:13,color:C.sub}}>{jobStatus==='processing'?'Animating your image…':'Starting generation…'}</div>
          {jobStatus==='processing' && <div style={{fontSize:11,color:"rgba(255,255,255,0.25)"}}>This can take 1–3 minutes</div>}
        </div>
      )}

      {videoUrl && (
        <div style={{marginTop:20,borderRadius:20,overflow:"hidden",border:"1px solid rgba(251,191,36,0.3)",animation:"slideUp 0.4s ease"}}>
          <div style={{position:"relative"}}>
            <video controls autoPlay muted style={{width:"100%",display:"block",background:"#000"}}>
              <source src={videoUrl} type="video/mp4"/>
            </video>
            <WatermarkOverlay plan={plan} />
          </div>
          <div style={{padding:"12px 16px",background:"rgba(251,191,36,0.06)",display:"flex",gap:10}}>
            <a href={videoUrl} download="omnyra-motion.mp4" target="_blank" rel="noreferrer"
              style={{...primaryBtn,flex:1,justifyContent:"center",textDecoration:"none"}}>
              <Copy size={14}/> Download
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── CAPTION TOOL ── */
function CaptionTool({ mode, setMode, onBack, showToast, brand }) {
  const [prompt,setPrompt]   = useState("");
  const [generating,setGen]  = useState(false);
  const [options,setOptions] = useState(null);
  const [error,setError]     = useState(null);
  const cm = MODES.find(m=>m.id===mode);

  const generate = async () => {
    if (!prompt.trim()) return;
    setGen(true); setOptions(null); setError(null);
    try {
      const res=await authFetch("/api/generate",{method:"POST",body:JSON.stringify({tool:"caption",prompt,mode,brand})});
      const data=await res.json();
      if (data.error){setError(data.error);setGen(false);return;}
      if (data.parsed?.options) setOptions(data.parsed.options);
      else { try{const p=JSON.parse(data.result.replace(/```json|```/g,'').trim());setOptions(p.options||[]);}catch{setError("Couldn't parse options. Try again.");} }
    } catch { setError("Connection failed."); }
    setGen(false);
  };

  return (
    <div style={{minHeight:"100vh",padding:"50px 20px 40px",animation:"fadeIn 0.3s ease"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <PressBtn onClick={onBack} style={ghostBtn}><ArrowLeft size={18}/></PressBtn>
        <div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:100,background:"rgba(34,211,238,0.1)",border:"1px solid rgba(34,211,238,0.25)",fontSize:10,fontWeight:600,color:"#22d3ee"}}>✦ CLAUDE AI</div>
      </div>
      <div style={{marginTop:18,marginBottom:18}}>
        <div style={{width:50,height:50,borderRadius:16,background:"linear-gradient(135deg,rgba(34,211,238,0.3),rgba(139,92,246,0.2))",border:"1px solid rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center"}}><Hash size={22} color="#67e8f9" strokeWidth={1.6}/></div>
        <h1 style={{marginTop:12,fontSize:26,fontWeight:300,margin:"12px 0 4px"}}>Captions & Tags</h1>
        <p style={{margin:0,fontSize:13,color:C.sub}}>5 caption options · 160 chars · 5 hashtags each</p>
      </div>
      <div style={{padding:"14px 16px",borderRadius:20,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",marginBottom:14}}>
        <ModeGrid mode={mode} setMode={setMode}/>
      </div>
      <label style={labelStyle}>Describe your post or topic</label>
      <div style={{marginTop:8,borderRadius:20,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",overflow:"hidden"}}>
        <textarea value={prompt} onChange={e=>setPrompt(e.target.value.slice(0,2000))} placeholder="ADHD is a nightmare / girl dancing on beach / my morning routine hack…" style={{width:"100%",minHeight:90,padding:16,background:"transparent",border:"none",outline:"none",color:C.text,fontSize:14,fontFamily:"inherit",resize:"none",lineHeight:1.5}}/>
        <div style={{padding:"8px 12px 12px",display:"flex",justifyContent:"space-between"}}>
          <PressBtn onClick={()=>setPrompt("ADHD is a nightmare but here's what helps")} style={ghostBtn}>✦ Example</PressBtn>
          <div style={{fontSize:10,color:C.sub}}>{prompt.length}/2000</div>
        </div>
      </div>
      {error&&<div style={{marginTop:12,padding:"12px 16px",borderRadius:14,background:"rgba(244,63,94,0.1)",border:"1px solid rgba(244,63,94,0.3)",fontSize:13,color:"#f43f5e"}}>⚠ {error}</div>}
      {generating&&<div style={{marginTop:16,padding:20,borderRadius:22,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",display:"flex",alignItems:"center",gap:14}}><div style={{width:36,height:36,borderRadius:12,background:"linear-gradient(135deg,rgba(34,211,238,0.3),rgba(139,92,246,0.2))",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:16,height:16,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.2)",borderTopColor:"#22d3ee",animation:"spin 1s linear infinite"}}/></div><div><div style={{fontSize:14,fontWeight:500}}>Generating 5 captions…</div><div style={{fontSize:11,color:C.sub}}>{cm?.emoji} {cm?.name} mode</div></div></div>}
      {options&&options.length>0&&(
        <div style={{marginTop:16}}>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
            <div style={{fontSize:11,color:C.sub,textTransform:"uppercase",letterSpacing:"0.08em"}}>5 options in</div>
            <div style={{padding:"3px 10px",borderRadius:100,fontSize:11,fontWeight:600,background:`${cm?.color}22`,border:`1px solid ${cm?.color}44`,color:cm?.color}}>{cm?.emoji} {cm?.name}</div>
          </div>
          {options.map((opt,i)=>(
            <div key={i} style={{marginBottom:12,padding:16,borderRadius:20,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",animation:`slideUp 0.3s ${i*0.06}s both`}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.12em",color:"#22d3ee",textTransform:"uppercase"}}>Option {i+1}</div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <div style={{fontSize:10,color:opt.caption?.length>140?"#f43f5e":C.sub}}>{opt.caption?.length||0}/160</div>
                  <RegenBtn onClick={()=>showToast("Regenerating option — coming soon")} loading={false}/>
                </div>
              </div>
              <div style={{fontSize:14,lineHeight:1.65,color:C.text,marginBottom:12}}>{opt.caption}</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
                {(opt.hashtags||[]).map((tag,ti)=><span key={ti} style={{fontSize:12,color:"#fbbf24",background:"rgba(251,191,36,0.1)",padding:"3px 10px",borderRadius:100,border:"1px solid rgba(251,191,36,0.2)"}}>{tag}</span>)}
              </div>
              <PressBtn onClick={()=>{navigator.clipboard.writeText(`${opt.caption}\n\n${(opt.hashtags||[]).join(' ')}`);showToast(`Option ${i+1} copied! ✓`);}} style={{...ghostBtn,width:"100%",justifyContent:"center",fontSize:12}}>
                <Copy size={13}/> Copy option {i+1}
              </PressBtn>
            </div>
          ))}
          <PressBtn onClick={()=>{navigator.clipboard.writeText(options.map((o,i)=>`--- Option ${i+1} ---\n${o.caption}\n${(o.hashtags||[]).join(' ')}`).join('\n\n'));showToast("All 5 copied! ✓");}} style={{...primaryBtn,width:"100%",justifyContent:"center",marginTop:4}}>
            <Copy size={15}/> Copy all 5 options
          </PressBtn>
        </div>
      )}
      {!generating&&<PressBtn onClick={generate} style={{...primaryBtn,marginTop:14,width:"100%",justifyContent:"center",padding:"15px 20px",fontSize:15}}>✦ {options?"Regenerate 5 options":"Generate 5 captions"}</PressBtn>}
    </div>
  );
}

/* ── GENERIC TOOL SCREEN ── */
function GenericTool({ tool, mode, setMode, onBack, showToast, brand }) {
  const [prompt,setPrompt]   = useState("");
  const [generating,setGen]  = useState(false);
  const [done,setDone]       = useState(false);
  const [style,setStyle]     = useState("cinematic");
  const [result,setResult]   = useState(null);
  const [error,setError]     = useState(null);
  const [files,setFiles]     = useState([]);
  const fileRef              = useRef();
  const isText = ["prompt"].includes(tool.id);
  const cm = MODES.find(m=>m.id===mode);

  const generate = async () => {
    if (!prompt.trim()&&isText) return;
    setGen(true); setDone(false); setResult(null); setError(null);
    if (isText) {
      try {
        const res=await authFetch("/api/generate",{method:"POST",body:JSON.stringify({tool:tool.id,prompt,mode,brand})});
        const data=await res.json();
        if (data.error){setError(data.error);setGen(false);return;}
        setResult(data.result);
      } catch { setError("Connection failed."); }
    } else { await new Promise(r=>setTimeout(r,2000)); }
    setGen(false); setDone(true);
  };

  return (
    <div style={{minHeight:"100vh",padding:"50px 20px 40px",animation:"fadeIn 0.3s ease"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <PressBtn onClick={onBack} style={ghostBtn}><ArrowLeft size={18}/></PressBtn>
        {isText&&<div style={{display:"inline-flex",alignItems:"center",gap:6,padding:"5px 12px",borderRadius:100,background:"rgba(34,211,238,0.1)",border:"1px solid rgba(34,211,238,0.25)",fontSize:10,fontWeight:600,color:"#22d3ee"}}>✦ CLAUDE AI</div>}
      </div>
      <div style={{marginTop:18,marginBottom:16}}>
        <div style={{width:50,height:50,borderRadius:16,background:"linear-gradient(135deg,rgba(139,92,246,0.3),rgba(34,211,238,0.2))",border:"1px solid rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center"}}><tool.icon size={22} color="#fff" strokeWidth={1.6}/></div>
        <h1 style={{marginTop:12,fontSize:26,fontWeight:300,margin:"12px 0 4px"}}>{tool.name}</h1>
        <p style={{margin:0,fontSize:13,color:C.sub}}>{tool.desc}</p>
      </div>
      <div style={{padding:"14px 16px",borderRadius:20,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",marginBottom:14}}>
        <ModeGrid mode={mode} setMode={setMode}/>
      </div>
      {["image","video","avatar","lipsync","twin","voice"].includes(tool.id)&&(
        <div style={{marginBottom:14}}>
          <input ref={fileRef} type="file" accept="image/*,audio/*,video/*" style={{display:"none"}} onChange={e=>{if(e.target.files[0]){setFiles([e.target.files[0]]);showToast("Uploaded! ✅");}}}/>
          <PressBtn onClick={()=>fileRef.current?.click()} style={{width:"100%",padding:18,borderRadius:20,background:files.length?"rgba(139,92,246,0.1)":"rgba(255,255,255,0.03)",border:files.length?"1px solid rgba(139,92,246,0.4)":"1px dashed rgba(255,255,255,0.15)",textAlign:"center",color:C.text,fontFamily:"inherit"}}>
            {files.length?<div style={{display:"flex",alignItems:"center",gap:10,justifyContent:"center"}}><Check size={18} color="#a78bfa"/><div style={{fontSize:13,fontWeight:500}}>{files[0].name}</div></div>:<><div style={{width:44,height:44,borderRadius:"50%",margin:"0 auto",background:"linear-gradient(135deg,rgba(139,92,246,0.2),rgba(34,211,238,0.15))",border:"1px solid rgba(255,255,255,0.1)",display:"flex",alignItems:"center",justifyContent:"center"}}><Upload size={20} color="rgba(255,255,255,0.6)" strokeWidth={1.5}/></div><div style={{marginTop:12,fontSize:14,fontWeight:500}}>Upload file</div></>}
          </PressBtn>
        </div>
      )}
      <label style={labelStyle}>{tool.id==="prompt"?"What do you want to research?":"Prompt"}</label>
      <div style={{marginTop:8,borderRadius:20,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",overflow:"hidden"}}>
        <textarea value={prompt} onChange={e=>setPrompt(e.target.value)} placeholder={tool.id==="prompt"?"Ask anything — explain quantum physics, summarise a market, help me study…":"Describe what you want to create…"} style={{width:"100%",minHeight:tool.id==="prompt"?160:90,padding:16,background:"transparent",border:"none",outline:"none",color:C.text,fontSize:14,fontFamily:"inherit",resize:"none",lineHeight:1.5}}/>
        <div style={{padding:"8px 12px 12px",display:"flex",justifyContent:"space-between"}}>
          <div style={{fontSize:11,color:C.sub,fontStyle:"italic"}}>{tool.id==="prompt"?"No character limit":"Up to 2000 chars"}</div>
          <div style={{fontSize:10,color:C.sub}}>{prompt.length} chars</div>
        </div>
      </div>
      {["image","video"].includes(tool.id)&&<StylePicker style={style} setStyle={setStyle}/>}
      {/* Research Studio gets its own generate button right under textarea */}
      {tool.id==="prompt"&&!generating&&(
        <PressBtn onClick={generate} style={{...primaryBtn,marginTop:12,width:"100%",justifyContent:"center",padding:"13px 20px",fontSize:14}}>
          ✦ {done?"Ask another question":"Generate with Claude"}
        </PressBtn>
      )}
      {error&&<div style={{marginTop:12,padding:"12px 16px",borderRadius:14,background:"rgba(244,63,94,0.1)",border:"1px solid rgba(244,63,94,0.3)",fontSize:13,color:"#f43f5e"}}>⚠ {error}</div>}
      {(generating||done)&&(
        <div style={{marginTop:16,borderRadius:22,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",overflow:"hidden",animation:"slideUp 0.4s ease"}}>
          {generating?(
            <div style={{display:"flex",alignItems:"center",gap:14,padding:20}}>
              <div style={{width:36,height:36,borderRadius:12,background:"linear-gradient(135deg,rgba(139,92,246,0.3),rgba(34,211,238,0.2))",display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{width:16,height:16,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.2)",borderTopColor:cm?.color||"#a78bfa",animation:"spin 1s linear infinite"}}/></div>
              <div><div style={{fontSize:14,fontWeight:500}}>{isText?"Claude is writing…":"Generating…"}</div><div style={{fontSize:11,color:C.sub}}>{cm?.emoji} {cm?.name} mode</div></div>
            </div>
          ):isText&&result?(
            <div style={{padding:20}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
                <div style={{fontSize:11,color:C.sub,textTransform:"uppercase",letterSpacing:"0.08em"}}>Generated in</div>
                <div style={{padding:"3px 10px",borderRadius:100,fontSize:11,fontWeight:600,background:`${cm?.color}22`,border:`1px solid ${cm?.color}44`,color:cm?.color}}>{cm?.emoji} {cm?.name}</div>
              </div>
              <FormattedText text={result}/>
              {/* Free tier watermark notice on text outputs */}
              <div style={{marginTop:14,padding:"10px 14px",borderRadius:14,background:"rgba(0,0,0,0.3)",border:"1px solid rgba(255,255,255,0.08)",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                <svg width="14" height="14" viewBox="0 0 40 40" fill="none"><path d="M20 4 C10 4, 4 10, 4 20 C4 30, 10 36, 20 36 C28 36, 34 31, 35 24 C36 18, 32 14, 27 14 C22 14, 19 17, 19 21 C19 24, 21 26, 24 26 C26 26, 28 25, 28 23" stroke="url(#wg2)" strokeWidth="3.5" strokeLinecap="round" fill="none"/><defs><linearGradient id="wg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#7c3aed"/><stop offset="100%" stopColor="#22d3ee"/></linearGradient></defs></svg>
                <span style={{fontSize:10,color:"rgba(255,255,255,0.4)",letterSpacing:"0.1em"}}>OMNYRA AI · FREE TIER · Upgrade to remove watermark</span>
              </div>
              <PressBtn onClick={()=>{navigator.clipboard.writeText(result);showToast("Copied! ✓");}} style={{...primaryBtn,width:"100%",justifyContent:"center",marginTop:10}}><Copy size={15}/> Copy</PressBtn>
            </div>
          ):(
            <div style={{padding:18}}>
              <div style={{aspectRatio:"9/16",maxHeight:280,borderRadius:16,overflow:"hidden",position:"relative",background:"linear-gradient(135deg,#1a0e2e,#0a1929)",border:"1px solid rgba(255,255,255,0.06)"}}>
                <div style={{position:"absolute",inset:0,background:"radial-gradient(circle at 30% 30%,rgba(139,92,246,0.4),transparent 60%),radial-gradient(circle at 70% 70%,rgba(34,211,238,0.3),transparent 60%)"}}/>
                <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:8,padding:20,textAlign:"center"}}>
                  <div style={{fontSize:28}}>🔌</div>
                  <div style={{fontSize:13,fontWeight:500}}>API Required</div>
                  <div style={{fontSize:11,color:"rgba(255,255,255,0.5)"}}>Connect {tool.id==="voice"||tool.id==="clone"?"ElevenLabs":tool.id==="avatar"||tool.id==="twin"?"D-ID":"Kling · Sync Labs"} in Profile → Connected Apps</div>
                </div>
                {/* FREE TIER WATERMARK — centre bottom */}
                <WatermarkOverlay/>
              </div>
            </div>
          )}
        </div>
      )}
      {!generating&&<PressBtn onClick={generate} style={{...primaryBtn,marginTop:16,width:"100%",justifyContent:"center",padding:"15px 20px",fontSize:15}}>✦ {done?"Regenerate":`Generate${isText?" with Claude":""}`}</PressBtn>}
    </div>
  );
}

/* ── STUDIO / LIBRARY / PROFILE ── */
function Studio({ onTool }) {
  const [q,setQ]=useState("");
  const f=TOOLS.filter(t=>t.name.toLowerCase().includes(q.toLowerCase())||t.desc.toLowerCase().includes(q.toLowerCase()));
  return (
    <div style={{padding:"56px 20px 0",animation:"fadeIn 0.4s ease"}}>
      <h1 style={{fontSize:28,fontWeight:300,letterSpacing:"-0.03em",margin:0}}>Studio</h1>
      <p style={{fontSize:13,color:C.sub,marginTop:4}}>Every tool, one canvas.</p>
      <div style={{marginTop:18,padding:"12px 16px",borderRadius:16,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",backdropFilter:"blur(20px)",display:"flex",alignItems:"center",gap:10}}>
        <Search size={16} color={C.sub}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search tools…" style={{flex:1,background:"transparent",border:"none",outline:"none",color:C.text,fontSize:14,fontFamily:"inherit"}}/>
      </div>
      <div style={{marginTop:22,display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        {f.map(t=><ToolCard key={t.id} tool={t} onClick={()=>onTool(t)}/>)}
      </div>
    </div>
  );
}

const TYPE_COLOR = {oneclick:"gold",script:"violet",caption:"cyan",image:"violet",video:"gold",voice:"cyan",avatar:"violet",motion:"gold",clone:"cyan"};
const TYPE_LABEL = {oneclick:"Creator Hub",script:"Script",caption:"Caption",image:"Image",video:"Video",voice:"Voice Over",avatar:"Avatar",motion:"Motion",clone:"Voice Clone"};
const BG = {violet:"rgba(139,92,246,0.35)",cyan:"rgba(34,211,238,0.3)",gold:"rgba(251,191,36,0.3)"};
const SOCIAL_PLATFORMS = [
  {id:"tiktok",label:"TikTok",emoji:"🎵",color:"#ff2d55"},
  {id:"instagram",label:"Instagram",emoji:"📸",color:"#e1306c"},
  {id:"youtube",label:"YouTube",emoji:"▶️",color:"#ff0000"},
  {id:"twitter",label:"Twitter / X",emoji:"𝕏",color:"#1d9bf0"},
];

function timeAgo(ts) {
  const s=(Date.now()-new Date(ts))/1000;
  if(s<60)return"Just now";if(s<3600)return`${Math.floor(s/60)}m ago`;
  if(s<86400)return`${Math.floor(s/3600)}h ago`;return`${Math.floor(s/86400)}d ago`;
}

function Library({ showToast }) {
  const [session,setSession]   = useState(null);
  const [items,setItems]       = useState([]);
  const [posts,setPosts]       = useState([]);
  const [connections,setConns] = useState([]);
  const [loading,setLoading]   = useState(true);
  const [view,setView]         = useState('grid');
  const [tab,setTab]           = useState('all');
  const [selected,setSel]      = useState(null);
  const [publishTarget,setPub] = useState(null);
  const [calMonth,setCalMonth] = useState(new Date());
  const [calDay,setCalDay]     = useState(null);

  useEffect(()=>{
    const init=async()=>{
      const {data:{session:s}}=await supabase.auth.getSession();
      setSession(s);
      if(s){
        await Promise.all([
          fetch('/api/library',{headers:{Authorization:`Bearer ${s.access_token}`}}).then(r=>r.ok?r.json():[]).then(setItems),
          fetch('/api/social/posts',{headers:{Authorization:`Bearer ${s.access_token}`}}).then(r=>r.ok?r.json():[]).then(setPosts),
          fetch('/api/social/connections',{headers:{Authorization:`Bearer ${s.access_token}`}}).then(r=>r.ok?r.json():[]).then(d=>setConns(d.map(c=>c.platform))),
        ]);
      }
      setLoading(false);
    };
    init();
  },[]);

  const deleteItem=async(id)=>{
    if(!session)return;
    await fetch(`/api/library?id=${id}`,{method:'DELETE',headers:{Authorization:`Bearer ${session.access_token}`}});
    setItems(p=>p.filter(i=>i.id!==id));
    setSel(null);
    showToast('Deleted');
  };

  const deletePost=async(id)=>{
    if(!session)return;
    await fetch(`/api/social/posts?id=${id}`,{method:'DELETE',headers:{Authorization:`Bearer ${session.access_token}`}});
    setPosts(p=>p.filter(i=>i.id!==id));
  };

  // Calendar helpers
  const calYear=calMonth.getFullYear(), calMon=calMonth.getMonth();
  const firstDow=new Date(calYear,calMon,1).getDay();
  const daysInMonth=new Date(calYear,calMon+1,0).getDate();
  const postsByDay={};
  posts.forEach(p=>{
    if(!p.scheduled_for)return;
    const key=new Date(p.scheduled_for).toDateString();
    (postsByDay[key]||(postsByDay[key]=[])).push(p);
  });
  const calDayKey=calDay?new Date(calYear,calMon,calDay).toDateString():null;
  const calDayPosts=calDayKey?postsByDay[calDayKey]??[]:[];
  const MONTH_NAMES=["January","February","March","April","May","June","July","August","September","October","November","December"];

  const filteredItems = tab==='all' ? items : [];
  const filteredPosts = tab==='scheduled' ? posts.filter(p=>p.status==='scheduled'||p.status==='publishing')
                      : tab==='published' ? posts.filter(p=>p.status==='published'||p.status==='failed') : [];

  // ── Detail view ──
  if(selected){
    const it=selected;
    const color=TYPE_COLOR[it.type]||'violet';
    const ps=it.pipeline_state||{};
    const linkedPost=posts.find(p=>p.generation_id===it.id);
    return(
      <div style={{padding:"56px 20px 120px",animation:"fadeIn 0.3s ease"}}>
        <PressBtn onClick={()=>setSel(null)} style={ghostBtn}><ArrowLeft size={18}/></PressBtn>
        <div style={{marginTop:16,padding:20,borderRadius:22,background:`linear-gradient(135deg,${BG[color]},rgba(10,10,30,0.9))`,border:"1px solid rgba(255,255,255,0.1)"}}>
          <div style={{fontSize:10,color:C.sub,textTransform:"uppercase",letterSpacing:"0.1em"}}>{TYPE_LABEL[it.type]||it.type}</div>
          <div style={{fontSize:22,fontWeight:400,marginTop:6,letterSpacing:"-0.02em"}}>{ps.title||ps.prompt||it.type}</div>
          <div style={{fontSize:12,color:C.sub,marginTop:4}}>{timeAgo(it.created_at)}</div>
        </div>
        {(ps.platform||ps.tone||ps.mode)&&(
          <div style={{marginTop:12,padding:"14px 16px",borderRadius:16,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)"}}>
            <div style={{fontSize:11,color:C.sub,letterSpacing:"0.1em",textTransform:"uppercase",fontWeight:600,marginBottom:8}}>Details</div>
            {ps.platform&&<div style={{fontSize:13,color:C.text,lineHeight:1.7}}>Platform: {ps.platform}</div>}
            {ps.tone&&<div style={{fontSize:13,color:C.text,lineHeight:1.7}}>Tone: {ps.tone}</div>}
            {ps.mode&&<div style={{fontSize:13,color:C.text,lineHeight:1.7}}>Mode: {ps.mode}</div>}
          </div>
        )}
        {linkedPost&&(
          <div style={{marginTop:10,padding:"12px 16px",borderRadius:14,background:"rgba(34,211,238,0.06)",border:"1px solid rgba(34,211,238,0.2)",display:"flex",alignItems:"center",gap:10}}>
            <Clock size={14} color="#22d3ee"/>
            <div style={{fontSize:12,color:"#22d3ee"}}>
              {linkedPost.status==='published'?`Published · ${linkedPost.platforms?.join(', ')}`
               :linkedPost.status==='failed'?`Failed: ${linkedPost.error_message||'unknown error'}`
               :`Scheduled · ${linkedPost.platforms?.join(', ')} · ${linkedPost.scheduled_for?new Date(linkedPost.scheduled_for).toLocaleString():'Now'}`}
            </div>
          </div>
        )}
        <div style={{marginTop:14,display:"flex",flexDirection:"column",gap:10}}>
          <PressBtn onClick={()=>{setSel(null);setPub(it);}} style={{...primaryBtn,width:"100%",justifyContent:"center"}}><Share2 size={15}/> Publish to Social</PressBtn>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <PressBtn onClick={()=>{navigator.clipboard?.writeText(JSON.stringify(it.pipeline_state,null,2));showToast('Copied!');}} style={{...ghostBtn,justifyContent:"center"}}><Copy size={14}/> Copy</PressBtn>
            <PressBtn onClick={()=>deleteItem(it.id)} style={{...ghostBtn,justifyContent:"center",color:"#f43f5e",borderColor:"rgba(244,63,94,0.2)"}}>🗑 Delete</PressBtn>
          </div>
        </div>
      </div>
    );
  }

  // ── Calendar view ──
  if(view==='cal'){
    const cells=[];
    for(let i=0;i<firstDow;i++)cells.push(null);
    for(let d=1;d<=daysInMonth;d++)cells.push(d);
    while(cells.length%7!==0)cells.push(null);
    return(
      <div style={{padding:"56px 20px 120px",animation:"fadeIn 0.4s ease"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
          <h1 style={{fontSize:28,fontWeight:300,letterSpacing:"-0.03em",margin:0}}>Calendar</h1>
          <PressBtn onClick={()=>setView('grid')} style={{...ghostBtn,padding:"8px 14px",fontSize:12,display:"flex",alignItems:"center",gap:6}}><LayoutGrid size={14}/> Grid</PressBtn>
        </div>
        <div style={{padding:"16px",borderRadius:20,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
            <PressBtn onClick={()=>setCalMonth(new Date(calYear,calMon-1,1))} style={{...ghostBtn,padding:"6px 10px"}}><ChevronLeft size={16}/></PressBtn>
            <div style={{fontSize:15,fontWeight:500}}>{MONTH_NAMES[calMon]} {calYear}</div>
            <PressBtn onClick={()=>setCalMonth(new Date(calYear,calMon+1,1))} style={{...ghostBtn,padding:"6px 10px"}}><ChevronRight size={16}/></PressBtn>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:8}}>
            {["Su","Mo","Tu","We","Th","Fr","Sa"].map(d=><div key={d} style={{textAlign:"center",fontSize:10,color:C.sub,padding:"4px 0",fontWeight:600}}>{d}</div>)}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
            {cells.map((d,i)=>{
              if(!d)return<div key={i}/>;
              const key=new Date(calYear,calMon,d).toDateString();
              const dayPosts=postsByDay[key]??[];
              const isToday=new Date().toDateString()===key;
              const isSel=calDay===d;
              return(
                <PressBtn key={i} onClick={()=>setCalDay(isSel?null:d)} style={{padding:"8px 4px",borderRadius:10,background:isSel?"linear-gradient(135deg,rgba(139,92,246,0.3),rgba(34,211,238,0.2))":isToday?"rgba(255,255,255,0.08)":"transparent",border:isSel?"1px solid rgba(139,92,246,0.5)":isToday?"1px solid rgba(255,255,255,0.15)":"1px solid transparent",display:"flex",flexDirection:"column",alignItems:"center",gap:3,fontFamily:"inherit"}}>
                  <div style={{fontSize:13,color:isSel?C.text:isToday?"#a78bfa":C.text,fontWeight:isToday||isSel?600:400}}>{d}</div>
                  {dayPosts.length>0&&(
                    <div style={{display:"flex",gap:2,flexWrap:"wrap",justifyContent:"center"}}>
                      {dayPosts.slice(0,3).map((p,j)=>{
                        const plt=SOCIAL_PLATFORMS.find(x=>p.platforms?.includes(x.id));
                        return<div key={j} style={{width:6,height:6,borderRadius:"50%",background:plt?.color||C.violet}}/>;
                      })}
                    </div>
                  )}
                </PressBtn>
              );
            })}
          </div>
        </div>
        {calDay&&(
          <div style={{marginTop:16}}>
            <div style={{fontSize:12,color:C.sub,fontWeight:600,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:10}}>
              {MONTH_NAMES[calMon]} {calDay} — {calDayPosts.length} post{calDayPosts.length!==1?'s':''}
            </div>
            {calDayPosts.length===0?<div style={{fontSize:13,color:C.sub}}>No posts scheduled.</div>:calDayPosts.map(p=>(
              <div key={p.id} style={{padding:"14px 16px",borderRadius:16,marginBottom:8,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",gap:12}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:500}}>{p.title||'Untitled'}</div>
                  <div style={{fontSize:11,color:C.sub,marginTop:2,display:"flex",gap:8}}>
                    <span>{p.platforms?.map(id=>SOCIAL_PLATFORMS.find(x=>x.id===id)?.emoji).join(' ')}</span>
                    {p.scheduled_for&&<span>{new Date(p.scheduled_for).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>}
                    <span style={{color:p.status==='published'?'#a3e635':p.status==='failed'?'#f43f5e':'#fbbf24'}}>{p.status}</span>
                  </div>
                </div>
                <PressBtn onClick={()=>deletePost(p.id)} style={{padding:"6px 10px",borderRadius:10,background:"rgba(244,63,94,0.08)",border:"1px solid rgba(244,63,94,0.15)",color:"#f43f5e",fontFamily:"inherit",fontSize:12}}>✕</PressBtn>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Grid view ──
  return(
    <div style={{padding:"56px 20px 120px",animation:"fadeIn 0.4s ease"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
        <h1 style={{fontSize:28,fontWeight:300,letterSpacing:"-0.03em",margin:0}}>Library</h1>
        <PressBtn onClick={()=>setView('cal')} style={{...ghostBtn,padding:"8px 14px",fontSize:12,display:"flex",alignItems:"center",gap:6}}><Calendar size={14}/> Calendar</PressBtn>
      </div>
      <div style={{display:"flex",gap:8,marginTop:14,marginBottom:18}}>
        {['all','scheduled','published'].map(t=>(
          <PressBtn key={t} onClick={()=>setTab(t)} style={{padding:"7px 16px",borderRadius:100,fontSize:12,fontWeight:500,fontFamily:"inherit",background:tab===t?"linear-gradient(135deg,rgba(139,92,246,0.35),rgba(34,211,238,0.25))":"rgba(255,255,255,0.06)",border:tab===t?"1px solid rgba(139,92,246,0.4)":"1px solid rgba(255,255,255,0.1)",color:tab===t?C.text:C.sub}}>
            {t.charAt(0).toUpperCase()+t.slice(1)}
          </PressBtn>
        ))}
      </div>

      {loading&&<div style={{textAlign:"center",color:C.sub,paddingTop:40,fontSize:13}}>Loading…</div>}

      {!loading&&tab==='all'&&(
        filteredItems.length===0?(
          <div style={{textAlign:"center",paddingTop:40}}>
            <div style={{fontSize:32,marginBottom:12}}>📂</div>
            <div style={{fontSize:15,fontWeight:400,color:C.text}}>Nothing saved yet</div>
            <div style={{fontSize:12,color:C.sub,marginTop:6}}>Generate a script or creator post and tap 💾 to save it here.</div>
          </div>
        ):(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            {filteredItems.map((it,i)=>{
              const color=TYPE_COLOR[it.type]||'violet';
              const ps=it.pipeline_state||{};
              return(
                <PressBtn key={it.id} onClick={()=>setSel(it)} style={{aspectRatio:"3/4",borderRadius:20,position:"relative",overflow:"hidden",background:`linear-gradient(135deg,${BG[color]},rgba(10,10,30,0.8))`,border:"1px solid rgba(255,255,255,0.08)",animation:`slideUp 0.4s ${i*0.05}s both`,fontFamily:"inherit",width:"100%",padding:0}}>
                  <div style={{position:"absolute",bottom:0,left:0,right:0,padding:14,background:"linear-gradient(to top,rgba(0,0,0,0.8),transparent)"}}>
                    <div style={{fontSize:10,color:C.sub,textTransform:"uppercase",letterSpacing:"0.08em"}}>{TYPE_LABEL[it.type]||it.type}</div>
                    <div style={{fontSize:13,fontWeight:500,marginTop:4,lineHeight:1.3,color:C.text}}>{ps.title||ps.prompt||'Untitled'}</div>
                    <div style={{fontSize:10,color:C.sub,marginTop:4}}>{timeAgo(it.created_at)}</div>
                  </div>
                </PressBtn>
              );
            })}
          </div>
        )
      )}

      {!loading&&(tab==='scheduled'||tab==='published')&&(
        filteredPosts.length===0?(
          <div style={{textAlign:"center",paddingTop:40}}>
            <div style={{fontSize:32,marginBottom:12}}>{tab==='scheduled'?'🗓':'✅'}</div>
            <div style={{fontSize:15,fontWeight:400,color:C.text}}>No {tab} posts yet</div>
            <div style={{fontSize:12,color:C.sub,marginTop:6}}>Save content and hit Publish to Social to get started.</div>
          </div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {filteredPosts.map(p=>(
              <div key={p.id} style={{padding:"16px 18px",borderRadius:18,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)"}}>
                <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,fontWeight:500}}>{p.title||'Untitled'}</div>
                    <div style={{fontSize:11,color:C.sub,marginTop:4,display:"flex",gap:10,flexWrap:"wrap"}}>
                      <span>{p.platforms?.map(id=>SOCIAL_PLATFORMS.find(x=>x.id===id)?.emoji+' '+SOCIAL_PLATFORMS.find(x=>x.id===id)?.label).join(' · ')}</span>
                    </div>
                    {p.scheduled_for&&<div style={{fontSize:11,color:"#fbbf24",marginTop:4,display:"flex",alignItems:"center",gap:4}}><Clock size={10}/>{new Date(p.scheduled_for).toLocaleString()}</div>}
                    {p.status==='failed'&&<div style={{fontSize:11,color:"#f43f5e",marginTop:4}}>{p.error_message}</div>}
                  </div>
                  <div style={{display:"flex",gap:6,alignItems:"center"}}>
                    <div style={{fontSize:11,padding:"3px 10px",borderRadius:100,background:p.status==='published'?"rgba(163,230,53,0.15)":p.status==='failed'?"rgba(244,63,94,0.15)":"rgba(251,191,36,0.15)",color:p.status==='published'?"#a3e635":p.status==='failed'?"#f43f5e":"#fbbf24",fontWeight:600}}>{p.status}</div>
                    <PressBtn onClick={()=>deletePost(p.id)} style={{padding:"5px 8px",borderRadius:8,background:"rgba(244,63,94,0.08)",border:"1px solid rgba(244,63,94,0.15)",color:"#f43f5e",fontFamily:"inherit",fontSize:11}}>✕</PressBtn>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {publishTarget&&<PublishModal item={publishTarget} session={session} connections={connections} showToast={showToast} onClose={()=>setPub(null)} onPublished={(p)=>{setPosts(prev=>[...prev,p]);showToast(p.scheduled_for?'Post scheduled ✓':'Publishing now…');}}/>}
    </div>
  );
}

/* ── PUBLISH MODAL ── */
function PublishModal({ item, session, connections, showToast, onClose, onPublished }) {
  const ps=item.pipeline_state||{};
  const [selPlatforms,setSelP] = useState(connections.length?[connections[0]]:[]);
  const [caption,setCaption]   = useState(ps.caption||ps.hook||'');
  const [mode,setMode]         = useState('now');
  const [date,setDate]         = useState('');
  const [time,setTime]         = useState('09:00');
  const [busy,setBusy]         = useState(false);

  const togglePlatform=(id)=>setSelP(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);

  const handleSubmit=async()=>{
    if(!selPlatforms.length){showToast('Pick at least one platform');return;}
    if(!session){showToast('Please sign in');return;}
    setBusy(true);
    try{
      let scheduled_for=null;
      if(mode==='schedule'&&date){
        scheduled_for=new Date(`${date}T${time||'09:00'}`).toISOString();
      }
      const res=await fetch('/api/social/posts',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},
        body:JSON.stringify({
          generation_id:item.id,
          title:ps.title||ps.prompt||'Untitled',
          caption,
          media_url:ps.media_url||ps.imageUrl||ps.videoUrl||null,
          media_type:item.type==='image'?'image':item.type==='video'||item.type==='avatar'||item.type==='motion'?'video':'text',
          platforms:selPlatforms,
          scheduled_for,
        }),
      });
      if(res.ok){
        const data=await res.json();
        onPublished(data);
        onClose();
      } else {
        const err=await res.json();
        showToast(err.error||'Publish failed');
      }
    }catch{showToast('Connection failed');}
    setBusy(false);
  };

  return(
    <div style={{position:"fixed",inset:0,zIndex:200,display:"flex",flexDirection:"column",justifyContent:"flex-end"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#0f0f1c",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"28px 28px 0 0",padding:"24px 20px 40px",animation:"slideUp 0.3s ease",maxHeight:"90vh",overflowY:"auto"}}>
        <div style={{width:40,height:4,borderRadius:2,background:"rgba(255,255,255,0.2)",margin:"0 auto 20px"}}/>
        <div style={{fontSize:18,fontWeight:500,marginBottom:18,display:"flex",alignItems:"center",gap:8}}><Share2 size={17} color={C.violet}/> Publish to Social</div>

        {/* Platform grid */}
        <div style={{fontSize:11,color:C.sub,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:600,marginBottom:10}}>Platforms</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:20}}>
          {SOCIAL_PLATFORMS.map(pl=>{
            const connected=connections.includes(pl.id);
            const active=selPlatforms.includes(pl.id);
            return(
              <PressBtn key={pl.id} onClick={()=>connected&&togglePlatform(pl.id)} style={{padding:"12px 14px",borderRadius:14,background:active?"linear-gradient(135deg,rgba(139,92,246,0.25),rgba(34,211,238,0.15))":"rgba(255,255,255,0.04)",border:active?"1px solid rgba(139,92,246,0.5)":"1px solid rgba(255,255,255,0.08)",display:"flex",alignItems:"center",gap:8,fontFamily:"inherit",opacity:connected?1:0.5}}>
                <span style={{fontSize:18}}>{pl.emoji}</span>
                <div style={{flex:1,textAlign:"left"}}>
                  <div style={{fontSize:12,fontWeight:500,color:C.text}}>{pl.label}</div>
                  <div style={{fontSize:10,color:connected?"#a3e635":"#f43f5e"}}>{connected?'Connected':'Not connected'}</div>
                </div>
                {active&&connected&&<Check size={14} color="#22d3ee"/>}
              </PressBtn>
            );
          })}
        </div>

        {/* Caption */}
        <div style={{fontSize:11,color:C.sub,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:600,marginBottom:8}}>Caption</div>
        <textarea value={caption} onChange={e=>setCaption(e.target.value)} placeholder="Write your caption…" rows={3} style={{width:"100%",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:14,color:C.text,fontSize:13,padding:"12px 14px",fontFamily:"inherit",resize:"vertical",outline:"none",boxSizing:"border-box",marginBottom:18}}/>

        {/* Schedule toggle */}
        <div style={{fontSize:11,color:C.sub,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:600,marginBottom:10}}>When</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:mode==='schedule'?14:20}}>
          {['now','schedule'].map(m=>(
            <PressBtn key={m} onClick={()=>setMode(m)} style={{padding:"11px",borderRadius:12,background:mode===m?"linear-gradient(135deg,rgba(139,92,246,0.3),rgba(34,211,238,0.2))":"rgba(255,255,255,0.04)",border:mode===m?"1px solid rgba(139,92,246,0.5)":"1px solid rgba(255,255,255,0.08)",color:mode===m?C.text:C.sub,fontSize:13,fontWeight:mode===m?600:400,fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
              {m==='now'?<><Send size={13}/> Post now</>:<><Clock size={13}/> Schedule</>}
            </PressBtn>
          ))}
        </div>
        {mode==='schedule'&&(
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:20}}>
            <div>
              <div style={{fontSize:11,color:C.sub,marginBottom:6}}>Date</div>
              <input type="date" value={date} onChange={e=>setDate(e.target.value)} min={new Date().toISOString().split('T')[0]} style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:12,color:C.text,fontSize:13,padding:"10px 12px",fontFamily:"inherit",outline:"none",boxSizing:"border-box",colorScheme:"dark"}}/>
            </div>
            <div>
              <div style={{fontSize:11,color:C.sub,marginBottom:6}}>Time</div>
              <input type="time" value={time} onChange={e=>setTime(e.target.value)} style={{width:"100%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:12,color:C.text,fontSize:13,padding:"10px 12px",fontFamily:"inherit",outline:"none",boxSizing:"border-box",colorScheme:"dark"}}/>
            </div>
          </div>
        )}

        <PressBtn onClick={handleSubmit} disabled={busy||!selPlatforms.length} style={{...primaryBtn,width:"100%",justifyContent:"center",opacity:busy||!selPlatforms.length?0.6:1}}>
          {busy?<><div style={{width:14,height:14,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"#fff",animation:"spin 1s linear infinite"}}/>Working…</>:<><Share2 size={15}/>{mode==='now'?'Publish Now':'Schedule Post'}</>}
        </PressBtn>
      </div>
    </div>
  );
}

function SubScreen({ name, onBack, showToast }) {
  const screens = {
    Account:         <AccountScreen onBack={onBack} showToast={showToast}/>,
    Notifications:   <NotifSettingsScreen onBack={onBack} showToast={showToast}/>,
    "Export quality":<ExportScreen onBack={onBack} showToast={showToast}/>,
    "Connected apps":<ConnectedAppsScreen onBack={onBack} showToast={showToast}/>,
    "Help & support":<HelpScreen onBack={onBack}/>,
    Pricing:         <PricingScreen onBack={onBack} showToast={showToast}/>
  };
  return screens[name]||<div style={{padding:"60px 20px"}}><PressBtn onClick={onBack} style={ghostBtn}><ArrowLeft size={18}/></PressBtn><h1 style={{marginTop:20,fontSize:24,fontWeight:300}}>{name}</h1></div>;
}

function SubHeader({ title, onBack }) {
  return <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:24}}><PressBtn onClick={onBack} style={ghostBtn}><ArrowLeft size={18}/></PressBtn><h1 style={{margin:0,fontSize:22,fontWeight:300}}>{title}</h1></div>;
}

function AccountScreen({ onBack, showToast }) {
  return (
    <div style={{padding:"56px 20px 40px"}}>
      <SubHeader title="Account" onBack={onBack}/>
      <div style={{padding:20,borderRadius:22,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",textAlign:"center",marginBottom:20}}>
        <div style={{width:64,height:64,borderRadius:"50%",background:"linear-gradient(135deg,#8b5cf6,#22d3ee)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:26,fontWeight:500,margin:"0 auto"}}>A</div>
        <div style={{marginTop:12,fontSize:17,fontWeight:500}}>Creator</div>
        <div style={{fontSize:12,color:C.sub,marginTop:4}}>creator@omnyra.ai</div>
        <div style={{marginTop:10,display:"inline-flex",alignItems:"center",gap:6,padding:"4px 12px",borderRadius:100,background:"rgba(139,92,246,0.15)",border:"1px solid rgba(139,92,246,0.3)",fontSize:11,color:"#a78bfa"}}><Crown size={11}/> Pro Plan</div>
      </div>
      {[{icon:User,label:"Edit profile"},{icon:CreditCard,label:"Billing",val:"Pro · $29/mo"},{icon:Lock,label:"Change password"},{icon:Shield,label:"Privacy settings"}].map(item=>(
        <PressBtn key={item.label} onClick={()=>showToast(`${item.label} — coming soon`)} style={{width:"100%",padding:"14px 18px",borderRadius:16,marginTop:8,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",gap:14,color:C.text,fontFamily:"inherit",textAlign:"left"}}>
          <div style={{width:34,height:34,borderRadius:10,background:"rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"center"}}><item.icon size={16} color={C.sub} strokeWidth={1.8}/></div>
          <div style={{flex:1}}><div style={{fontSize:13,fontWeight:500}}>{item.label}</div>{item.val&&<div style={{fontSize:11,color:C.sub,marginTop:2}}>{item.val}</div>}</div>
          <ChevronRight size={14} color={C.sub}/>
        </PressBtn>
      ))}
      <PressBtn onClick={async()=>{ await supabase.auth.signOut(); window.location.replace('/'); }} style={{width:"100%",padding:"14px 18px",borderRadius:16,marginTop:8,background:"rgba(244,63,94,0.06)",border:"1px solid rgba(244,63,94,0.15)",display:"flex",alignItems:"center",gap:14,color:"#f43f5e",fontFamily:"inherit",textAlign:"left"}}>
        <div style={{width:34,height:34,borderRadius:10,background:"rgba(244,63,94,0.12)",display:"flex",alignItems:"center",justifyContent:"center"}}><LogOut size={16} color="#f43f5e" strokeWidth={1.8}/></div>
        <div style={{fontSize:13,fontWeight:500,flex:1}}>Sign out</div>
        <ChevronRight size={14} color="#f43f5e"/>
      </PressBtn>
    </div>
  );
}

function NotifSettingsScreen({ onBack, showToast }) {
  const [s,setS]=useState({a:true,b:true,c:true,d:false});
  const items=[{k:"a",l:"New features",sub:"Updates and launches"},{k:"b",l:"Creator tips",sub:"Daily prompts"},{k:"c",l:"Billing alerts",sub:"Usage and renewals"},{k:"d",l:"Weekly digest",sub:"Your stats"}];
  return (
    <div style={{padding:"56px 20px 40px"}}>
      <SubHeader title="Notifications" onBack={onBack}/>
      {items.map(item=>(
        <div key={item.k} onClick={()=>{setS(p=>({...p,[item.k]:!p[item.k]}));showToast("Saved!");}} style={{padding:"15px 18px",borderRadius:16,marginTop:8,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"space-between",cursor:"pointer"}}>
          <div><div style={{fontSize:13,fontWeight:500}}>{item.l}</div><div style={{fontSize:11,color:C.sub,marginTop:2}}>{item.sub}</div></div>
          <div style={{width:44,height:26,borderRadius:13,background:s[item.k]?"linear-gradient(135deg,#8b5cf6,#22d3ee)":"rgba(255,255,255,0.1)",position:"relative",transition:"background 0.3s",flexShrink:0}}>
            <div style={{position:"absolute",top:3,left:s[item.k]?21:3,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"left 0.3s"}}/>
          </div>
        </div>
      ))}
    </div>
  );
}

function ExportScreen({ onBack, showToast }) {
  const [q,setQ]=useState("HD");
  return (
    <div style={{padding:"56px 20px 40px"}}>
      <SubHeader title="Export Quality" onBack={onBack}/>
      {[{l:"HD",sub:"1080p · Recommended"},{l:"4K",sub:"2160p · Pro required"},{l:"Original",sub:"Source quality"}].map(o=>(
        <PressBtn key={o.l} onClick={()=>{setQ(o.l);showToast(`Export set to ${o.l}`);}} style={{width:"100%",padding:"16px 18px",borderRadius:16,marginTop:8,background:q===o.l?"linear-gradient(135deg,rgba(139,92,246,0.18),rgba(34,211,238,0.1))":"rgba(255,255,255,0.03)",border:q===o.l?"1px solid rgba(139,92,246,0.5)":"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",justifyContent:"space-between",color:C.text,fontFamily:"inherit",textAlign:"left"}}>
          <div><div style={{fontSize:14,fontWeight:500}}>{o.l}</div><div style={{fontSize:11,color:C.sub,marginTop:2}}>{o.sub}</div></div>
          {q===o.l&&<Check size={16} color="#22d3ee"/>}
        </PressBtn>
      ))}
    </div>
  );
}

function ConnectedAppsScreen({ onBack, showToast }) {
  const [session,setSession] = useState(null);
  const [socialConns,setSocial] = useState([]);
  const [aiConn,setAI] = useState({anthropic:true,elevenlabs:false,did:false,Kling:false,kling:false,runway:false,stability:false});
  const [socialLoading,setSocialLoading] = useState(true);

  useEffect(()=>{
    const init=async()=>{
      const {data:{session:s}}=await supabase.auth.getSession();
      setSession(s);
      if(s){
        const res=await fetch('/api/social/connections',{headers:{Authorization:`Bearer ${s.access_token}`}});
        if(res.ok)setSocial((await res.json()).map(c=>c.platform));
      }
      setSocialLoading(false);
    };
    init();
  },[]);

  const connectSocial=async(platform)=>{
    if(!session){showToast('Sign in first');return;}
    window.location.href=`/api/social/connect/${platform}?token=${session.access_token}`;
  };

  const disconnectSocial=async(platform)=>{
    if(!session)return;
    await fetch(`/api/social/connections?platform=${platform}`,{method:'DELETE',headers:{Authorization:`Bearer ${session.access_token}`}});
    setSocial(p=>p.filter(x=>x!==platform));
    showToast(`${platform.charAt(0).toUpperCase()+platform.slice(1)} disconnected`);
  };

  const aiApps=[
    {k:"anthropic", n:"Anthropic Claude",  s:"AI writing · scripts · research", i:"✦", c:"#f97316"},
    {k:"elevenlabs",n:"ElevenLabs",         s:"Voice cloning & text-to-speech",  i:"🎙", c:"#22d3ee"},
    {k:"did",       n:"D-ID",               s:"Avatars · digital twin · lip sync",i:"🎭", c:"#8b5cf6"},
    {k:"Kling",     n:"Kling Labs",          s:"Image to video (cost-efficient)",  i:"⚡", c:"#fbbf24"},
    {k:"kling",     n:"Kling AI",           s:"Realistic image-to-video motion",  i:"🎬", c:"#a3e635"},
    {k:"runway",    n:"Runway ML",          s:"Advanced cinematic video gen",     i:"🎞", c:"#60a5fa"},
    {k:"stability", n:"Stability AI",       s:"AI image generation",              i:"🖼", c:"#e879f9"}
  ];

  return (
    <div style={{padding:"56px 20px 60px"}}>
      <SubHeader title="Connected Apps" onBack={onBack}/>

      {/* Social Platforms */}
      <div style={{fontSize:11,color:C.sub,textTransform:"uppercase",letterSpacing:"0.12em",fontWeight:700,marginBottom:10}}>Social Platforms</div>
      <div style={{padding:"12px 14px",borderRadius:14,background:"rgba(139,92,246,0.06)",border:"1px solid rgba(139,92,246,0.2)",marginBottom:14,fontSize:12,color:C.sub}}>
        📱 Connect your accounts to schedule and publish content directly from Omnyra
      </div>
      {SOCIAL_PLATFORMS.map(pl=>{
        const connected=socialConns.includes(pl.id);
        return(
          <div key={pl.id} style={{padding:"16px 18px",borderRadius:16,marginBottom:8,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:42,height:42,borderRadius:14,background:`${pl.color}22`,border:`1px solid ${pl.color}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{pl.emoji}</div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,fontWeight:500}}>{pl.label}</div>
              <div style={{fontSize:11,color:connected?"#a3e635":C.sub,marginTop:2}}>{connected?'Connected · tap to disconnect':'Not connected'}</div>
            </div>
            <PressBtn onClick={()=>connected?disconnectSocial(pl.id):connectSocial(pl.id)} style={{padding:"7px 14px",borderRadius:100,background:connected?"rgba(34,211,238,0.15)":"linear-gradient(135deg,rgba(139,92,246,0.3),rgba(34,211,238,0.2))",border:connected?"1px solid rgba(34,211,238,0.4)":"1px solid rgba(139,92,246,0.4)",color:connected?"#22d3ee":"#fff",fontSize:11,fontWeight:600,fontFamily:"inherit"}}>
              {socialLoading?'…':connected?'Connected':'Connect'}
            </PressBtn>
          </div>
        );
      })}

      {/* AI Tools */}
      <div style={{fontSize:11,color:C.sub,textTransform:"uppercase",letterSpacing:"0.12em",fontWeight:700,marginBottom:10,marginTop:24}}>AI Tools</div>
      <div style={{padding:"12px 14px",borderRadius:14,background:"rgba(251,191,36,0.06)",border:"1px solid rgba(251,191,36,0.2)",marginBottom:14,fontSize:12,color:C.sub}}>
        🔌 <span style={{color:"#f97316"}}>Claude</span> writes · <span style={{color:"#fbbf24"}}>Kling · Sync Labs</span> animates · <span style={{color:"#22d3ee"}}>ElevenLabs</span> voices · <span style={{color:"#8b5cf6"}}>D-ID</span> avatars
      </div>
      {aiApps.map(app=>(
        <div key={app.k} style={{padding:"16px 18px",borderRadius:16,marginBottom:8,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",gap:14}}>
          <div style={{width:42,height:42,borderRadius:14,background:`${app.c}22`,border:`1px solid ${app.c}44`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>{app.i}</div>
          <div style={{flex:1}}><div style={{fontSize:13,fontWeight:500}}>{app.n}</div><div style={{fontSize:11,color:C.sub,marginTop:2}}>{app.s}</div></div>
          <PressBtn onClick={()=>{setAI(c=>({...c,[app.k]:!c[app.k]}));showToast(aiConn[app.k]?`${app.n} disconnected`:`${app.n} connected! 🎉`);}} style={{padding:"7px 14px",borderRadius:100,background:aiConn[app.k]?"rgba(34,211,238,0.15)":"linear-gradient(135deg,rgba(139,92,246,0.3),rgba(34,211,238,0.2))",border:aiConn[app.k]?"1px solid rgba(34,211,238,0.4)":"1px solid rgba(139,92,246,0.4)",color:aiConn[app.k]?"#22d3ee":"#fff",fontSize:11,fontWeight:600,fontFamily:"inherit"}}>
            {aiConn[app.k]?"Connected":"Connect"}
          </PressBtn>
        </div>
      ))}
    </div>
  );
}

function HelpScreen({ onBack }) {
  const faqs=[
    { q:"How do credits work?", a:"Credits are your generation currency. Scripts and Research are always FREE. Images cost 2–4 credits. Voice costs 2–4 credits. Video costs 10–40 credits. Avatar videos cost 25–60+ credits. You get credits every month with your plan, and can top up anytime with credit packs." },
    { q:"How much does each action cost?", a:"Script & Research: FREE\nStandard image: 2 credits\nHD image: 4 credits\n30s voice: 2 credits · 1 min voice: 4 credits\n10s video: 10 credits\n30s video: 20 credits\n60s video: 40 credits\nAvatar 30s: 25 credits\nAvatar 60s: 45 credits\nFull workflow (avatar + voice): 50–70 credits" },
    { q:"What credit packs are available?", a:"Starter: $9 AUD → 100 credits\nCreator Pack: $25 AUD → 300 credits\nPro Pack: $49 AUD → 800 credits\nStudio Pack: $99 AUD → 2,000 credits\nCredits never expire and can be used for any tool." },
    { q:"How do the 7 AI modes work?", a:"Each mode gives Claude a completely different personality. Viral writes scroll-stopping hooks. Genius gives expert deep analysis. Educational explains simply. Switch on any tool screen — it completely changes your output." },
    { q:"Will avatars and voices improve when APIs connect?", a:"Yes! The avatars and voice styles you see now are UI previews. When you connect D-ID (avatars) and ElevenLabs (voice) in Connected Apps, you get real AI-generated talking avatars, lip sync and cloned voices. The quality will be significantly better." },
    { q:"Why D-ID instead of HeyGen for avatars?", a:"D-ID offers similar quality to HeyGen at a much lower cost, making it better for an affordable creator platform. Connect it in Profile → Connected Apps." },
    { q:"Which APIs do I need?", a:"Text tools only: Anthropic Claude (already working — free while in beta).\nFor voice: ElevenLabs (~$5/mo)\nFor avatars: D-ID (~$5.99/mo)\nFor video: Kling AI or Sync Labs (~$8/mo)\nFor images: Stability AI (~$10/mo)" },
    { q:"Can I cancel anytime?", a:"Yes — cancel any time from Account → Billing. No lock-in contracts. Your credits for the current month remain usable until the end of the period." }
  ];
  const [open,setOpen]=useState(null);
  return (
    <div style={{padding:"56px 20px 40px"}}>
      <SubHeader title="Help & Support" onBack={onBack}/>
      <div style={{padding:"16px 18px",borderRadius:20,background:"linear-gradient(135deg,rgba(139,92,246,0.15),rgba(34,211,238,0.1))",border:"1px solid rgba(139,92,246,0.25)",marginBottom:20}}>
        <div style={{fontSize:14,fontWeight:500}}>Need help? We&apos;re here.</div>
        <div style={{fontSize:12,color:C.sub,marginTop:4}}>support@omnyra.ai · Usually replies in under 2 hours</div>
      </div>
      {faqs.map((f,i)=>(
        <div key={i} onClick={()=>setOpen(open===i?null:i)} style={{marginTop:8,borderRadius:16,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",overflow:"hidden",cursor:"pointer"}}>
          <div style={{padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{fontSize:13,fontWeight:500,flex:1,paddingRight:12}}>{f.q}</div>
            <ChevronRight size={14} color={C.sub} style={{transform:open===i?"rotate(90deg)":"none",transition:"transform 0.25s",flexShrink:0}}/>
          </div>
          {open===i&&<div style={{padding:"0 18px 14px",fontSize:13,color:C.sub,lineHeight:1.7,whiteSpace:"pre-line"}}>{f.a}</div>}
        </div>
      ))}
    </div>
  );
}

function PricingScreen({ onBack, showToast }) {
  const [sel,setSel]=useState("Pro");
  const [tab,setTab]=useState("plans"); // plans | credits
  const [loading,setLoading]=useState(false);

  const handleUpgrade = async () => {
    if (sel==="Free") { onBack(); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/stripe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({plan:sel})});
      const data = await res.json();
      if (data.url) { localStorage.setItem("omnyra_onboarded","1"); window.location.href=data.url; } else { showToast("Payment unavailable — try again"); setLoading(false); }
    } catch { showToast("Connection failed"); setLoading(false); }
  };
  return (
    <div style={{padding:"56px 20px 40px"}}>
      <SubHeader title="Plans & Pricing" onBack={onBack}/>

      {/* Tab switcher */}
      <div style={{display:"flex",gap:8,marginBottom:18,padding:4,borderRadius:14,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)"}}>
        {["plans","credits"].map(t=>(
          <PressBtn key={t} onClick={()=>setTab(t)} style={{flex:1,padding:"9px 16px",borderRadius:10,background:tab===t?"linear-gradient(135deg,rgba(139,92,246,0.3),rgba(34,211,238,0.2))":"transparent",border:"none",color:tab===t?"#fff":C.sub,fontSize:13,fontWeight:tab===t?600:400,fontFamily:"inherit",textTransform:"capitalize"}}>
            {t==="plans"?"📋 Plans":"⚡ Credits"}
          </PressBtn>
        ))}
      </div>

      {tab==="plans"&&(
        <>
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {PLANS.map(p=>(
              <PressBtn key={p.name} onClick={()=>setSel(p.name)} style={{textAlign:"left",padding:18,borderRadius:22,background:sel===p.name?"linear-gradient(135deg,rgba(139,92,246,0.18),rgba(34,211,238,0.12))":"rgba(255,255,255,0.03)",border:sel===p.name?"1px solid rgba(139,92,246,0.5)":"1px solid rgba(255,255,255,0.06)",position:"relative",color:C.text,fontFamily:"inherit",width:"100%"}}>
                {p.tag&&<div style={{position:"absolute",top:14,right:14,padding:"3px 8px",borderRadius:8,fontSize:10,fontWeight:600,background:p.tag==="BEST"?"linear-gradient(135deg,#22d3ee,#8b5cf6)":"linear-gradient(135deg,#fbbf24,#f59e0b)",color:"#0a0a0a"}}>{p.tag}</div>}
                <div style={{display:"flex",alignItems:"baseline",gap:8}}><span style={{fontSize:18,fontWeight:500}}>{p.name}</span><span style={{fontSize:22,fontWeight:300}}>${p.price}</span><span style={{fontSize:12,color:C.sub}}>{p.period}</span></div>
                <div style={{marginTop:8,display:"inline-flex",alignItems:"center",gap:5,padding:"3px 10px",borderRadius:100,background:"rgba(139,92,246,0.15)",border:"1px solid rgba(139,92,246,0.25)",fontSize:11,color:"#a78bfa"}}>⚡ {p.credits} 
                   credits/month</div>
                <div style={{marginTop:8,fontSize:12,color:C.sub,lineHeight:1.7}}>{p.features.slice(0,4).join(" · ")}</div>
              </PressBtn>
            ))}
          </div>
          <div style={{marginTop:12,padding:"12px 16px",borderRadius:14,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",fontSize:11,color:C.sub,textAlign:"center"}}>
            ✍️ Scripts & Research always FREE · Cancel anytime · Prices in AUD
          </div>
          <PressBtn onClick={handleUpgrade} disabled={loading} style={{...primaryBtn,marginTop:14,width:"100%",justifyContent:"center",opacity:loading?0.7:1}}>
            {loading?<><div style={{width:14,height:14,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"#fff",animation:"spin 1s linear infinite"}}/>Redirecting…</>:<>Upgrade to {sel} <ChevronRight size={16}/></>}
          </PressBtn>
        </>
      )}

      {tab==="credits"&&(
        <>
          <div style={{marginBottom:14}}>
            <div style={{fontSize:13,fontWeight:500,marginBottom:12}}>Credit packs (AUD) — top up anytime</div>
            {[{label:"Starter",credits:100,price:"$9"},{label:"Creator Pack",credits:300,price:"$25"},{label:"Pro Pack",credits:800,price:"$49"},{label:"Studio Pack",credits:2000,price:"$99"}].map((pack,i)=>(
              <PressBtn key={i} onClick={()=>showToast(`${pack.label} — connect Stripe to purchase`)} style={{width:"100%",padding:"14px 16px",borderRadius:16,marginBottom:8,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)",display:"flex",alignItems:"center",justifyContent:"space-between",color:C.text,fontFamily:"inherit"}}>
                <div><div style={{fontSize:13,fontWeight:500}}>{pack.label}</div><div style={{fontSize:11,color:C.sub}}>{pack.credits} credits · Never expire</div></div>
                <div style={{fontSize:16,fontWeight:600,color:"#22d3ee"}}>{pack.price} <span style={{fontSize:10,color:C.sub}}>AUD</span></div>
              </PressBtn>
            ))}
          </div>
          <div style={{fontSize:13,fontWeight:500,marginBottom:12}}>Cost per action</div>
          {[
            {cat:"Writing",items:[{a:"Script generation",c:"FREE"},{a:"Research Studio",c:"FREE"},{a:"Rewrite / redo",c:"1 credit"}]},
            {cat:"Images",items:[{a:"Standard image",c:"2 credits"},{a:"HD image",c:"4 credits"},{a:"Image variations ×4",c:"5 credits"}]},
            {cat:"Voice",items:[{a:"30 sec voice",c:"2 credits"},{a:"1 min voice",c:"4 credits"},{a:"Premium voice clone",c:"8 credits"}]},
            {cat:"Video",items:[{a:"10 sec video",c:"10 credits"},{a:"30 sec video",c:"20 credits"},{a:"60 sec video",c:"40 credits"}]},
            {cat:"Avatar Video",items:[{a:"Avatar 30 sec",c:"25 credits"},{a:"Avatar 60 sec",c:"45 credits"},{a:"Full workflow",c:"50–70 credits"}]},
          ].map((group,gi)=>(
            <div key={gi} style={{marginBottom:12,padding:"14px 16px",borderRadius:16,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.07)"}}>
              <div style={{fontSize:10,fontWeight:700,letterSpacing:"0.12em",color:"#a78bfa",textTransform:"uppercase",marginBottom:10}}>{group.cat}</div>
              {group.items.map((item,ii)=>(
                <div key={ii} style={{display:"flex",justifyContent:"space-between",paddingBottom:6,marginBottom:6,borderBottom:ii<group.items.length-1?"1px solid rgba(255,255,255,0.05)":"none"}}>
                  <div style={{fontSize:12,color:C.sub}}>{item.a}</div>
                  <div style={{fontSize:12,fontWeight:600,color:item.c==="FREE"?"#a3e635":"#22d3ee"}}>{item.c}</div>
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function Profile({ onSub, showToast, onBrandPanel, brand }) {
  const brandActive = !!(brand?.brand_name || brand?.niche);
  const menu=[
    {l:"Brand Memory",   i:Building2,  s: brandActive ? `${brand.brand_name || brand.niche} · Active` : "Save your brand for every generation", c:"#a78bfa", action: onBrandPanel},
    {l:"Account",        i:User,       s:"Profile, billing, password",    c:"#8b5cf6"},
    {l:"Notifications",  i:Bell,       s:"Alerts and preferences",         c:"#22d3ee"},
    {l:"Export quality", i:Sliders,    s:"HD, 4K, Original",               c:"#fbbf24"},
    {l:"Connected apps", i:Smartphone, s:"Claude · D-ID · ElevenLabs · Kling",c:"#a3e635"},
    {l:"Pricing",        i:CreditCard, s:"Plans and billing",               c:"#f43f5e"},
    {l:"Help & support", i:HelpCircle, s:"FAQs and contact",                c:"#60a5fa"}
  ];
  return (
    <div style={{padding:"56px 20px 0",animation:"fadeIn 0.4s ease"}}>
      <h1 style={{fontSize:28,fontWeight:300,letterSpacing:"-0.03em",margin:0}}>Profile</h1>
      <div style={{marginTop:20,padding:20,borderRadius:22,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",display:"flex",alignItems:"center",gap:14}}>
        <div style={{width:52,height:52,borderRadius:"50%",background:"linear-gradient(135deg,#8b5cf6,#22d3ee)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,fontWeight:500}}>A</div>
        <div style={{flex:1}}><div style={{fontSize:15,fontWeight:500}}>Creator</div><div style={{fontSize:11,color:C.sub,marginTop:2}}>Pro plan · 450 generations/mo · 3 min video</div></div>
        <PressBtn onClick={()=>onSub("Account")} style={iconChipStyle}><Settings size={16}/></PressBtn>
      </div>
      <PressBtn onClick={()=>onSub("Pricing")} style={{marginTop:12,width:"100%",padding:18,borderRadius:22,background:"linear-gradient(135deg,rgba(251,191,36,0.18),rgba(251,191,36,0.04))",border:"1px solid rgba(251,191,36,0.25)",display:"flex",alignItems:"center",gap:14,color:C.text,fontFamily:"inherit",textAlign:"left"}}>
        <Crown size={22} color={C.gold}/><div style={{flex:1}}><div style={{fontSize:13,fontWeight:500}}>Upgrade to Studio</div><div style={{fontSize:11,color:C.sub,marginTop:2}}>$99/mo · Batch generation · Priority queue · 5 min video</div></div>
        <ChevronRight size={16} color={C.sub}/>
      </PressBtn>
      <div style={{marginTop:14}}>
        {menu.map(item=>(
          <PressBtn key={item.l} onClick={()=>item.action ? item.action() : onSub(item.l)} style={{width:"100%",padding:"15px 18px",borderRadius:16,marginTop:8,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.06)",display:"flex",alignItems:"center",gap:14,color:C.text,fontFamily:"inherit",textAlign:"left"}}>
            <div style={{width:38,height:38,borderRadius:12,background:`${item.c}18`,border:`1px solid ${item.c}33`,display:"flex",alignItems:"center",justifyContent:"center",position:"relative"}}>
              <item.i size={16} color={item.c} strokeWidth={1.8}/>
              {item.l==="Brand Memory" && brandActive && <span style={{position:"absolute",top:4,right:4,width:7,height:7,borderRadius:"50%",background:"#a78bfa",boxShadow:"0 0 6px #8b5cf6"}}/>}
            </div>
            <div style={{flex:1}}><div style={{fontSize:13,fontWeight:500}}>{item.l}</div><div style={{fontSize:11,color:C.sub,marginTop:2}}>{item.s}</div></div>
            <ChevronRight size={14} color={C.sub}/>
          </PressBtn>
        ))}
        <PressBtn onClick={async()=>{ await supabase.auth.signOut(); window.location.replace('/'); }} style={{width:"100%",padding:"15px 18px",borderRadius:16,marginTop:8,background:"rgba(244,63,94,0.06)",border:"1px solid rgba(244,63,94,0.15)",display:"flex",alignItems:"center",gap:14,color:"#f43f5e",fontFamily:"inherit",textAlign:"left"}}>
          <div style={{width:38,height:38,borderRadius:12,background:"rgba(244,63,94,0.12)",display:"flex",alignItems:"center",justifyContent:"center"}}><LogOut size={16} color="#f43f5e" strokeWidth={1.8}/></div>
          <div style={{fontSize:13,fontWeight:500,flex:1}}>Sign out</div>
          <ChevronRight size={14} color="#f43f5e"/>
        </PressBtn>
      </div>
    </div>
  );
}

function TabBar({ screen, setScreen }) {
  const tabs=[{id:"home",l:"Home",i:Sparkles},{id:"studio",l:"Studio",i:Lightbulb},{id:"library",l:"Library",i:Film},{id:"profile",l:"You",i:User}];
  return (
    <div style={{position:"fixed",bottom:18,left:0,right:0,display:"flex",justifyContent:"center",zIndex:50,pointerEvents:"none"}}>
      <div style={{display:"flex",gap:4,padding:6,borderRadius:100,background:"rgba(13,10,31,0.75)",border:"1px solid rgba(255,255,255,0.1)",backdropFilter:"blur(30px)",boxShadow:"0 20px 60px -10px rgba(0,0,0,0.6)",pointerEvents:"auto"}}>
        {tabs.map(t=>{
          const a=screen===t.id;
          return <PressBtn key={t.id} onClick={()=>setScreen(t.id)} style={{padding:"10px 16px",borderRadius:100,border:"none",background:a?"linear-gradient(135deg,rgba(139,92,246,0.4),rgba(34,211,238,0.3))":"transparent",color:a?"#fff":C.sub,display:"flex",alignItems:"center",gap:6,fontSize:12,fontWeight:500,fontFamily:"inherit"}}><t.i size={15} strokeWidth={1.8}/>{a&&<span>{t.l}</span>}</PressBtn>;
        })}
      </div>
    </div>
  );
}

function Orb({ size=120 }) {
  return (
    <div style={{width:size,height:size,position:"relative",animation:"float 4s ease-in-out infinite"}}>
      <div style={{position:"absolute",inset:0,borderRadius:"50%",background:"radial-gradient(circle at 30% 30%,#c4b5fd 0%,#8b5cf6 25%,#4c1d95 60%,#1e1b4b 100%)",boxShadow:"0 30px 80px -20px rgba(139,92,246,0.7),inset -20px -20px 40px rgba(0,0,0,0.4)"}}/>
      <svg viewBox="0 0 100 100" style={{position:"absolute",inset:0,width:"100%",height:"100%"}}>
        <defs><linearGradient id="ribbon" x1="0" y1="0" x2="1" y2="0"><stop offset="0%" stopColor="#a78bfa"/><stop offset="50%" stopColor="#22d3ee"/><stop offset="100%" stopColor="#fcd34d"/></linearGradient></defs>
        <path d="M 25 50 Q 25 30,40 30 Q 55 30,60 50 Q 65 70,75 70 Q 85 70,85 50 Q 85 30,75 30 Q 65 30,60 50 Q 55 70,40 70 Q 25 70,25 50 Z" fill="url(#ribbon)" opacity="0.9"/>
      </svg>
      <div style={{position:"absolute",top:"8%",left:"15%",width:"40%",height:"30%",borderRadius:"50%",background:"radial-gradient(ellipse,rgba(255,255,255,0.5),transparent 70%)",filter:"blur(8px)"}}/>
    </div>
  );
}

/* ── BRAND PANEL ── */
function BrandPanel({ onClose, showToast }) {
  const [brandName,         setBrandName]         = useState("");
  const [tagline,           setTagline]           = useState("");
  const [primaryColor,      setPrimaryColor]      = useState("#8b5cf6");
  const [secondaryColor,    setSecondaryColor]    = useState("");
  const [toneOfVoice,       setToneOfVoice]       = useState("");
  const [audience,          setAudience]          = useState("");
  const [niche,             setNiche]             = useState("");
  const [contentStyleNotes, setContentStyleNotes] = useState("");
  const [saving,            setSaving]            = useState(false);
  const [loaded,            setLoaded]            = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setLoaded(true); return; }
        const res = await fetch('/api/brand', { headers: { Authorization: `Bearer ${session.access_token}` } });
        if (res.ok) {
          const d = await res.json();
          if (d) {
            setBrandName(d.brand_name || "");
            setTagline(d.tagline || "");
            setPrimaryColor(d.colors?.[0] || "#8b5cf6");
            setSecondaryColor(d.colors?.[1] || "");
            setToneOfVoice(d.tone_of_voice || "");
            setAudience(d.target_audience || "");
            setNiche(d.niche || "");
            setContentStyleNotes(d.content_style_notes || "");
          }
        }
      } catch {}
      setLoaded(true);
    };
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { showToast("Please sign in first"); setSaving(false); return; }
      const colors = [primaryColor, secondaryColor].filter(c => c);
      const payload = { brand_name: brandName, tagline, colors, tone_of_voice: toneOfVoice, target_audience: audience, niche, content_style_notes: contentStyleNotes };
      const res = await fetch('/api/brand', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(payload) });
      if (res.ok) { showToast("Brand Kit saved ✓"); onClose(payload); }
      else showToast("Save failed — try again");
    } catch { showToast("Connection failed"); }
    setSaving(false);
  };

  const clearBrand = () => {
    setBrandName(""); setTagline(""); setPrimaryColor("#8b5cf6"); setSecondaryColor("");
    setToneOfVoice(""); setAudience(""); setNiche(""); setContentStyleNotes("");
  };

  const TONES = [
    { id: "Professional",  emoji: "💼" },
    { id: "Casual",        emoji: "😊" },
    { id: "Funny",         emoji: "😂" },
    { id: "Inspirational", emoji: "✨" },
    { id: "Educational",   emoji: "📚" },
  ];

  const inp = { width:"100%", marginTop:8, padding:"12px 16px", borderRadius:14, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", color:C.text, fontSize:14, outline:"none", fontFamily:"inherit", boxSizing:"border-box" };
  const hasBrand = brandName || niche;

  return (
    <div style={{minHeight:"100vh",background:C.bg,animation:"fadeIn 0.2s ease",overflowY:"auto"}}>
      <div style={{padding:"56px 20px 60px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:8}}>
          <PressBtn onClick={()=>onClose(null)} style={ghostBtn}><ArrowLeft size={16}/></PressBtn>
          <div>
            <h2 style={{margin:0,fontSize:22,fontWeight:300,letterSpacing:"-0.02em"}}>Brand Kit</h2>
            <p style={{margin:"4px 0 0",fontSize:12,color:C.sub}}>Auto-injected into every script, caption &amp; generation</p>
          </div>
        </div>

        {!loaded ? (
          <div style={{display:"flex",justifyContent:"center",padding:"60px 0"}}>
            <div style={{width:28,height:28,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.2)",borderTopColor:"#8b5cf6",animation:"spin 1s linear infinite"}}/>
          </div>
        ) : (
          <>
            {/* ── Identity ── */}
            <div style={{fontSize:10,color:C.sub,letterSpacing:"0.12em",textTransform:"uppercase",fontWeight:700,marginBottom:12,marginTop:4}}>Identity</div>

            <div style={{marginBottom:14}}>
              <label style={labelStyle}>Brand Name</label>
              <input value={brandName} onChange={e=>setBrandName(e.target.value)} placeholder="e.g. Omnyra AI" style={inp}/>
            </div>

            <div style={{marginBottom:14}}>
              <label style={labelStyle}>Tagline</label>
              <input value={tagline} onChange={e=>setTagline(e.target.value)} placeholder="e.g. Create. Don't juggle." style={inp}/>
            </div>

            <div style={{marginBottom:14}}>
              <label style={labelStyle}>Niche / Industry</label>
              <input value={niche} onChange={e=>setNiche(e.target.value)} placeholder="e.g. AI tools, fitness, real estate" style={inp}/>
            </div>

            <div style={{marginBottom:22}}>
              <label style={labelStyle}>Target Audience</label>
              <input value={audience} onChange={e=>setAudience(e.target.value)} placeholder="e.g. Entrepreneurs 25–40, content creators" style={inp}/>
            </div>

            {/* ── Tone ── */}
            <div style={{fontSize:10,color:C.sub,letterSpacing:"0.12em",textTransform:"uppercase",fontWeight:700,marginBottom:12}}>Tone of Voice</div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:10}}>
              {TONES.map(t=>{
                const active = toneOfVoice === t.id;
                return (
                  <PressBtn key={t.id} onClick={()=>setToneOfVoice(active ? "" : t.id)} style={{padding:"9px 14px",borderRadius:100,background:active?"linear-gradient(135deg,rgba(139,92,246,0.3),rgba(34,211,238,0.2))":"rgba(255,255,255,0.04)",border:active?"1px solid rgba(139,92,246,0.5)":"1px solid rgba(255,255,255,0.08)",color:active?"#fff":C.sub,fontSize:12,fontFamily:"inherit",display:"flex",alignItems:"center",gap:5}}>
                    <span>{t.emoji}</span><span style={{fontWeight:active?600:400}}>{t.id}</span>
                    {active && <Check size={11} style={{marginLeft:2}}/>}
                  </PressBtn>
                );
              })}
            </div>
            <div style={{marginBottom:22}}>
              <input value={toneOfVoice} onChange={e=>setToneOfVoice(e.target.value)} placeholder="Or describe your custom tone…" style={{...inp, marginTop:0, fontSize:13}}/>
            </div>

            {/* ── Colors ── */}
            <div style={{fontSize:10,color:C.sub,letterSpacing:"0.12em",textTransform:"uppercase",fontWeight:700,marginBottom:12}}>Brand Colors</div>
            <div style={{display:"flex",gap:14,marginBottom:22,alignItems:"flex-start"}}>
              {[
                { label:"Primary",   value:primaryColor,   set:setPrimaryColor,   fallback:"#8b5cf6" },
                { label:"Secondary", value:secondaryColor, set:setSecondaryColor, fallback:"#22d3ee" },
              ].map(slot=>(
                <div key={slot.label} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
                  <div style={{position:"relative",width:52,height:52,borderRadius:16,background:slot.value||"rgba(255,255,255,0.06)",border:`2px solid ${slot.value?slot.value+"80":"rgba(255,255,255,0.12)"}`,overflow:"hidden",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                    {!slot.value && <span style={{fontSize:22,color:C.sub,pointerEvents:"none"}}>+</span>}
                    <input type="color" value={slot.value||slot.fallback} onChange={e=>slot.set(e.target.value)} style={{position:"absolute",inset:0,opacity:0,cursor:"pointer",width:"100%",height:"100%"}}/>
                  </div>
                  <span style={{fontSize:10,color:C.sub,letterSpacing:"0.06em"}}>{slot.label}</span>
                </div>
              ))}
              <div style={{flex:1,display:"flex",alignItems:"center",paddingTop:4}}>
                <span style={{fontSize:11,color:C.sub,lineHeight:1.5}}>Tap a swatch<br/>to pick a colour</span>
              </div>
            </div>

            {/* ── Content Style Notes ── */}
            <div style={{fontSize:10,color:C.sub,letterSpacing:"0.12em",textTransform:"uppercase",fontWeight:700,marginBottom:12}}>Content Style Notes</div>
            <div style={{marginBottom:24}}>
              <textarea
                value={contentStyleNotes}
                onChange={e=>setContentStyleNotes(e.target.value)}
                placeholder={"e.g. Always open with a bold statement. Use short punchy sentences. Avoid corporate jargon. End every video with a question to drive comments."}
                rows={4}
                style={{...inp, marginTop:0, resize:"vertical", lineHeight:1.6, fontSize:13}}
              />
              <div style={{marginTop:6,fontSize:11,color:C.sub}}>This is added verbatim to every generation — be as specific as you like.</div>
            </div>

            {/* ── Preview ── */}
            {hasBrand && (
              <div style={{marginBottom:24,padding:"16px 18px",borderRadius:18,background:"linear-gradient(135deg,rgba(139,92,246,0.1),rgba(34,211,238,0.07))",border:"1px solid rgba(139,92,246,0.2)"}}>
                <div style={{fontSize:10,color:C.sub,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:10,fontWeight:700}}>Kit Preview</div>
                {brandName   && <div style={{fontSize:15,fontWeight:600,color:"#fff",marginBottom:2}}>{brandName}</div>}
                {tagline     && <div style={{fontSize:12,color:"#a78bfa",marginBottom:8,fontStyle:"italic"}}>"{tagline}"</div>}
                <div style={{display:"flex",flexDirection:"column",gap:4}}>
                  {niche               && <div style={{fontSize:12,color:C.sub}}>🏷 {niche}</div>}
                  {audience            && <div style={{fontSize:12,color:C.sub}}>👥 {audience}</div>}
                  {toneOfVoice         && <div style={{fontSize:12,color:"#a78bfa"}}>🎙 {toneOfVoice} tone</div>}
                  {contentStyleNotes   && <div style={{fontSize:11,color:C.sub,marginTop:4,lineHeight:1.5,borderTop:"1px solid rgba(255,255,255,0.07)",paddingTop:8}}>{contentStyleNotes.length>120?contentStyleNotes.slice(0,120)+"…":contentStyleNotes}</div>}
                </div>
                {(primaryColor||secondaryColor) && (
                  <div style={{display:"flex",gap:6,marginTop:10,alignItems:"center"}}>
                    {primaryColor   && <div style={{width:20,height:20,borderRadius:6,background:primaryColor,border:"1px solid rgba(255,255,255,0.15)"}}/>}
                    {secondaryColor && <div style={{width:20,height:20,borderRadius:6,background:secondaryColor,border:"1px solid rgba(255,255,255,0.15)"}}/>}
                    <span style={{fontSize:10,color:C.sub}}>Brand palette</span>
                  </div>
                )}
              </div>
            )}

            <PressBtn onClick={save} disabled={saving} style={{...primaryBtn,width:"100%",justifyContent:"center",opacity:saving?0.7:1}}>
              {saving
                ? <><div style={{width:16,height:16,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"#fff",animation:"spin 1s linear infinite"}}/>Saving…</>
                : <><Check size={16}/>Save Brand Kit</>}
            </PressBtn>

            {hasBrand && (
              <PressBtn onClick={clearBrand} style={{...ghostBtn,width:"100%",justifyContent:"center",marginTop:10,color:"rgba(244,63,94,0.7)",border:"1px solid rgba(244,63,94,0.15)"}}>
                Clear brand kit
              </PressBtn>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function GlobalStyles() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@300;400;500;600&display=swap');
      *{box-sizing:border-box;-webkit-tap-highlight-color:transparent;}
      html,body{margin:0;background:#070710;}
      button{font-family:inherit;}
      ::selection{background:rgba(139,92,246,0.4);}
      ::-webkit-scrollbar{width:0;}
      textarea::placeholder,input::placeholder{color:rgba(245,243,255,0.3);}
      @keyframes fadeIn{from{opacity:0}to{opacity:1}}
      @keyframes fadeSlide{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
      @keyframes slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
      @keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
      @keyframes slideRight{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:translateX(0)}}
      @keyframes pop{from{opacity:0;transform:scale(0.85)}to{opacity:1;transform:scale(1)}}
      @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
      @keyframes drift1{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(40px,60px) scale(1.15)}}
      @keyframes drift2{0%,100%{transform:translate(0,0) scale(1)}50%{transform:translate(-50px,-40px) scale(1.1)}}
      @keyframes drift3{0%,100%{transform:translate(0,0)}50%{transform:translate(-30px,50px)}}
      @keyframes spin{to{transform:rotate(360deg)}}
      @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.6}}
    `}</style>
  );
}
function LoginGate({ onDone }) {
  const [tab,setTab]         = useState("signin");
  const [email,setEmail]     = useState("");
  const [password,setPassword] = useState("");
  const [loading,setLoading] = useState(false);
  const [error,setError]     = useState(null);
  const [success,setSuccess] = useState(null);

  const handle = async e => {
    e.preventDefault();
    setLoading(true); setError(null); setSuccess(null);
    const friendlyErr = (err) => {
      if (!err) return null;
      if (err.message?.includes('ISO-8859-1') || err.message?.includes('non ISO')) {
        return 'Connection error — please clear your browser cookies and try again.';
      }
      return err.message;
    };
    if (tab === "signup") {
      // Use the admin API route so the account is auto-confirmed — no email verification step
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(friendlyErr({ message: data.error || 'Signup failed' })); setLoading(false); return; }
      // Immediately sign in so onAuthStateChange fires and advances the stage
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password });
      if (signInErr) setError(friendlyErr(signInErr));
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) setError(friendlyErr(err));
      // onAuthStateChange handles the transition to "app" on success
    }
    setLoading(false);
  };

  const inp = { width:"100%", padding:"13px 16px", background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.1)", borderRadius:14, color:C.text, fontSize:15, outline:"none", fontFamily:"inherit", boxSizing:"border-box" };

  return (
    <div style={{minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"28px 24px",animation:"fadeIn 0.4s ease"}}>
      <div style={{width:"100%",maxWidth:400}}>
        {/* Logo */}
        <div style={{textAlign:"center",marginBottom:36}}>
          <Orb size={64}/>
          <div style={{marginTop:20,fontSize:28,fontWeight:300,letterSpacing:"-0.03em"}}>
            Omnyra <span style={{background:"linear-gradient(135deg,#22d3ee,#8b5cf6)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",fontWeight:500}}>AI</span>
          </div>
          <div style={{marginTop:6,fontSize:13,color:C.sub}}>The Creator OS</div>
        </div>

        {/* Tab toggle */}
        <div style={{display:"flex",background:"rgba(255,255,255,0.04)",borderRadius:14,padding:4,marginBottom:24,border:"1px solid rgba(255,255,255,0.07)"}}>
          {[["signin","Sign In"],["signup","Sign Up"]].map(([id,label])=>(
            <PressBtn key={id} onClick={()=>{setTab(id);setError(null);setSuccess(null);}} style={{flex:1,padding:"11px",borderRadius:11,border:"none",fontSize:14,fontWeight:600,fontFamily:"inherit",background:tab===id?"linear-gradient(135deg,rgba(139,92,246,0.3),rgba(34,211,238,0.2))":"transparent",color:tab===id?"#fff":C.sub}}>
              {label}
            </PressBtn>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handle} style={{display:"flex",flexDirection:"column",gap:14}}>
          <div>
            <label style={{...labelStyle,display:"block",marginBottom:6}}>Email</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="you@example.com" style={inp}/>
          </div>
          <div>
            <label style={{...labelStyle,display:"block",marginBottom:6}}>Password</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="••••••••" style={inp}/>
          </div>

          {error   && <div style={{padding:"11px 14px",borderRadius:12,background:"rgba(239,68,68,0.1)",border:"1px solid rgba(239,68,68,0.25)",color:"#f87171",fontSize:13}}>{error}</div>}
          {success && <div style={{padding:"11px 14px",borderRadius:12,background:"rgba(52,211,153,0.1)",border:"1px solid rgba(52,211,153,0.25)",color:"#34d399",fontSize:13}}>{success}</div>}

          <PressBtn onClick={()=>{}} style={{...primaryBtn,justifyContent:"center",width:"100%",marginTop:4,opacity:loading?0.7:1,pointerEvents:loading?"none":"auto"}}>
            {loading
              ? <><div style={{width:16,height:16,borderRadius:"50%",border:"2px solid rgba(255,255,255,0.3)",borderTopColor:"#fff",animation:"spin 1s linear infinite"}}/>Please wait…</>
              : tab==="signin" ? "Sign In" : "Create Account"
            }
          </PressBtn>
        </form>

        <div style={{textAlign:"center",marginTop:20,fontSize:12,color:C.sub}}>
          No credit card required · Free plan available
        </div>
      </div>
    </div>
  );
}