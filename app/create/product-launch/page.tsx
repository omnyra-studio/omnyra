"use client";

import { useEffect, useRef, useState, Suspense, type CSSProperties, type ChangeEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import AnimatedBackground from "@/components/AnimatedBackground";
import BrandContextFields from "@/components/BrandContextFields";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UploadedFile { name: string; dataUrl: string; size: number; }

type Platform   = "tiktok" | "instagram_reels" | "youtube_shorts";
type ProductType = "physical" | "digital" | "service";
type Outcome    = "pre_launch" | "launch_day" | "post_launch";
type Vibe       = "luxury" | "approachable" | "bold" | "minimal" | "playful" | "exclusive";

interface HookOption {
  hook_text: string;
  hook_type: string;
  psychological_trigger: string;
  predicted_retention_strength: number;
  retention_rationale: string;
  risk_level: string;
  risk_explanation: string;
  best_for_audience_segment: string;
}

interface Brief {
  situation_analysis: {
    whats_happening_in_niche: string;
    what_your_audience_is_responding_to: string;
    white_space_opportunity: string;
  };
  recommended_angle: {
    core_idea: string;
    why_this_now: string;
    why_this_you: string;
  };
  hook_options: HookOption[];
  structural_recommendation: {
    pacing_map: string;
    emotional_arc: string;
    visual_pacing_notes: string;
  };
  risk_assessment: {
    overall_confidence: number;
    confidence_explanation: string;
    what_would_increase_confidence: string;
    kill_criteria: string;
  };
  predicted_performance: {
    estimated_views_range: string;
    key_retention_moment: string;
    comparison_to_baseline: string;
  };
}

interface BriefApiResponse {
  brief_id: string;
  brief: Brief;
  hooks: Array<{ id: string; hook_text: string; hook_type: string; score: number }>;
}

// ─── Style constants ──────────────────────────────────────────────────────────

const C = {
  text:   "#E8DEFF",
  sub:    "#BBA8C8",
  gold:   "#F0C040",
  purple: "#C084FC",
  pink:   "#E879F9",
  green:  "#4ECB8C",
};

const INPUT: CSSProperties = {
  width: "100%",
  background: "rgba(13,0,16,0.7)",
  border: "1px solid rgba(204,171,175,0.2)",
  borderRadius: 12,
  padding: "12px 16px",
  color: C.purple,
  fontSize: 14,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.2s",
};

const LABEL: CSSProperties = {
  display: "block",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.15em",
  textTransform: "uppercase",
  color: C.sub,
  marginBottom: 8,
};

const CARD: CSSProperties = {
  background: "rgba(75,30,130,0.65)",
  backdropFilter: "blur(16px)",
  border: "1px solid rgba(207,164,47,0.25)",
  borderRadius: 20,
  padding: "28px 32px",
};

const SECTION_TAG: CSSProperties = {
  display: "block",
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.2em",
  textTransform: "uppercase",
  color: C.pink,
  marginBottom: 18,
};

// ─── Data ─────────────────────────────────────────────────────────────────────

const PRODUCT_TYPES: Array<{ id: ProductType; label: string; icon: string; desc: string }> = [
  { id: "physical", icon: "📦", label: "Physical",  desc: "Tangible goods — beauty, fashion, food, tech hardware" },
  { id: "digital",  icon: "💾", label: "Digital",   desc: "Software, courses, templates, digital downloads"      },
  { id: "service",  icon: "⚡", label: "Service",   desc: "Coaching, agency, subscription, SaaS"                 },
];

const VIBES: Array<{ id: Vibe; icon: string; label: string }> = [
  { id: "luxury",      icon: "💎", label: "Luxury"      },
  { id: "approachable",icon: "😊", label: "Approachable"},
  { id: "bold",        icon: "🔥", label: "Bold"        },
  { id: "minimal",     icon: "◻️", label: "Minimal"     },
  { id: "playful",     icon: "🎨", label: "Playful"     },
  { id: "exclusive",   icon: "✨", label: "Exclusive"   },
];

const PLATFORMS: Array<{ id: Platform; label: string }> = [
  { id: "tiktok",          label: "TikTok"           },
  { id: "instagram_reels", label: "Instagram Reels"  },
  { id: "youtube_shorts",  label: "YouTube Shorts"   },
];

const OUTCOMES: Array<{ id: Outcome; icon: string; label: string; desc: string }> = [
  { id: "pre_launch",  icon: "🔮", label: "Pre-Launch",  desc: "Build anticipation & waitlist"    },
  { id: "launch_day",  icon: "🚀", label: "Launch Day",  desc: "Drive immediate sales & momentum" },
  { id: "post_launch", icon: "📈", label: "Post-Launch", desc: "Sustain buzz & reviews"           },
];

const LOADING_STEPS = [
  "Analysing your product...",
  "Studying what's converting right now...",
  "Building your launch brief...",
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function riskColor(level: string) {
  const l = (level ?? "").toLowerCase();
  if (l === "safe")  return "#4ECB8C";
  if (l === "swing") return "#E879F9";
  return "#F0C040";
}

function riskLabel(level: string) {
  const l = (level ?? "").toLowerCase();
  if (l === "safe")  return "Safe";
  if (l === "swing") return "Swing";
  return "Moderate";
}

// ─── Exports ──────────────────────────────────────────────────────────────────

export default function ProductLaunchPage() {
  return (
    <Suspense>
      <ProductLaunchInner />
    </Suspense>
  );
}

// ─── Main inner component ─────────────────────────────────────────────────────

function ProductLaunchInner() {
  const router = useRouter();

  // Auth
  const [authLoading, setAuthLoading] = useState(true);
  const [authed, setAuthed]           = useState(false);
  const [userId, setUserId]           = useState<string | null>(null);

  // Form
  const [productName, setProductName]     = useState("");
  const [productType, setProductType]     = useState<ProductType>("physical");
  const [productDesc, setProductDesc]     = useState("");
  const [features, setFeatures]           = useState(["", "", ""]);
  const [targetAudience, setTargetAudience] = useState("");
  const [vibe, setVibe]                   = useState<Vibe | "">("");
  const [platform, setPlatform]           = useState<Platform>("tiktok");
  const [outcome, setOutcome]             = useState<Outcome>("launch_day");
  const [pricePoint, setPricePoint]       = useState("");
  const [pastWins, setPastWins]           = useState("");
  const [competitors, setCompetitors]     = useState("");
  const [uniqueAngle, setUniqueAngle]     = useState("");

  // File upload
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [dragOver, setDragOver]           = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Submission
  const [submitting, setSubmitting]     = useState(false);
  const [loadingStep, setLoadingStep]   = useState(0);
  const [error, setError]               = useState<string | null>(null);

  // Results
  const [briefResponse, setBriefResponse]         = useState<BriefApiResponse | null>(null);
  const [projectId, setProjectId]                 = useState<string | null>(null);
  const [selectedHookIndex, setSelectedHookIndex] = useState<number | null>(null);
  const [showInput, setShowInput]                 = useState(true);
  const [generatingScript, setGeneratingScript]   = useState(false);
  const [isDirecting, setIsDirecting]             = useState(false);
  const [exported, setExported]                   = useState(false);

  // ── Auth check + brand profile pre-fill ──────────────────────────────────────

  useEffect(() => {
    createClient().auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setAuthed(true);
        setUserId(session.user.id);

        fetch("/api/brand", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((p) => {
            if (!p) return;
            if (p.target_audience) setTargetAudience(p.target_audience);
            if (p.competitors) setCompetitors(p.competitors);
          })
          .catch(() => {});
      }
      setAuthLoading(false);
    });
  }, []);

  // ── Loading step animation ────────────────────────────────────────────────────

  useEffect(() => {
    if (!submitting) { setTimeout(() => setLoadingStep(0), 0); return; }
    const t1 = setTimeout(() => setLoadingStep(1), 1800);
    const t2 = setTimeout(() => setLoadingStep(2), 3800);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [submitting]);

  // ── File upload helpers ───────────────────────────────────────────────────────

  function processFiles(files: FileList | null) {
    if (!files) return;
    const remaining = 3 - uploadedFiles.length;
    if (remaining <= 0) return;
    Array.from(files).slice(0, remaining).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      if (file.size > 5 * 1024 * 1024) { setError(`${file.name} exceeds 5MB limit.`); return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        setUploadedFiles((prev) => prev.length >= 3 ? prev : [...prev, { name: file.name, dataUrl: ev.target?.result as string, size: file.size }]);
      };
      reader.readAsDataURL(file);
    });
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    processFiles(e.dataTransfer.files);
  }

  function handleFileInput(e: ChangeEvent<HTMLInputElement>) {
    processFiles(e.target.files);
    e.target.value = "";
  }

  // ── Submit ────────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!productName.trim() || !productDesc.trim() || !userId) return;
    setSubmitting(true);
    setError(null);

    const sb = createClient();

    const filledFeatures = features.filter(Boolean);
    const outcomeLabel = {
      pre_launch:  "Build pre-launch anticipation and waitlist signups",
      launch_day:  "Drive immediate launch-day sales and maximum reach",
      post_launch: "Sustain post-launch momentum, testimonials, and reviews",
    }[outcome];

    const userContext = [
      `PRODUCT TYPE: ${productType.toUpperCase()}`,
      pricePoint     ? `PRICE POINT: ${pricePoint}` : null,
      targetAudience ? `TARGET AUDIENCE: ${targetAudience}` : null,
      pastWins       ? `PAST WINS: ${pastWins}` : null,
      competitors    ? `COMPETITORS: ${competitors}` : null,
      uniqueAngle    ? `UNIQUE ANGLE: ${uniqueAngle}` : null,
      vibe ? `BRAND VIBE/AESTHETIC: ${vibe}` : null,
      `CAMPAIGN OBJECTIVE: ${outcomeLabel}`,
      filledFeatures.length > 0
        ? `KEY SELLING POINTS:\n${filledFeatures.map((f, i) => `${i + 1}. ${f}`).join("\n")}`
        : null,
      uploadedFiles.length > 0 ? `UPLOADED MEDIA: ${uploadedFiles.length} product image(s) attached` : null,
      "CONTENT FORMAT: Cinematic product reveal reel. Prioritise visual storytelling, feature reveals, before/after, and a high-urgency CTA.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const goal = `Create a scroll-stopping product launch reel for "${productName}": ${productDesc}. ${vibe ? `Brand aesthetic is ${vibe}.` : ""} This is a ${productType} product. Optimise for ${platform} with a ${vibe || "premium"} visual identity. Include cinematic hooks, feature revelation moments, and a conversion-focused CTA.`;

    try {
      const { data: proj, error: projErr } = await sb
        .from("projects")
        .insert({
          user_id: userId,
          title:   `${productName} — Launch Reel`,
          goal,
          platform,
          niche:   `product launch · ${productType}`,
          status:  "draft",
        })
        .select("id")
        .single();

      if (projErr) throw new Error(projErr.message);

      const pid = proj.id as string;
      setProjectId(pid);

      const res = await fetch("/api/generate-brief", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ goal, platform, niche: `product launch · ${productType}`, projectId: pid, userContext }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Brief generation failed");

      setBriefResponse(data as BriefApiResponse);
      setShowInput(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGenerateScript() {
    const hookId = selectedHookIndex !== null ? briefResponse?.hooks[selectedHookIndex]?.id : null;
    if (!hookId || !projectId) return;
    setGeneratingScript(true);
    try {
      await fetch("/api/generate-script", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ hookId, projectId }),
      });
      router.push(`/dashboard/creator?project=${projectId}`);
    } catch {
      setError("Script generation failed. Please try again.");
    } finally {
      setGeneratingScript(false);
    }
  }

  async function handleDirectVideo() {
    if (!projectId) return;
    setIsDirecting(true);
    setError(null);
    try {
      // Build script text from all available product context
      const hook = brief?.hook_options?.[selectedHookIndex ?? 0];
      const scriptText = [
        hook?.hook_text ?? "",
        productDesc,
        features.filter(Boolean).join(". "),
        brief?.recommended_angle?.core_idea ?? "",
      ].filter(Boolean).join("\n\n");

      const res = await fetch("/api/orchestrate-project", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ mode: "product_launch", scriptText, projectId, platform }),
      });
      const data = await res.json() as { project_id?: string; plan_id?: string; mode?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Shot plan generation failed");
      router.push(`/dashboard/director/${data.plan_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Shot plan generation failed");
      setIsDirecting(false);
    }
  }

  function handleSelectHook(index: number) {
    setSelectedHookIndex(index);
    const hookId = briefResponse?.hooks[index]?.id;
    if (!hookId || !projectId) return;
    fetch("/api/select-hook", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ hookId, projectId }),
    }).catch(() => {});
  }

  function handleExport() {
    if (!briefResponse) return;
    const { brief } = briefResponse;
    const text = [
      `OMNYRA PRODUCT LAUNCH BRIEF — ${productName.toUpperCase()}`,
      `Platform: ${platform} | Type: ${productType} | Objective: ${outcome}`,
      "",
      "── SITUATION ──",
      brief.situation_analysis.whats_happening_in_niche,
      "",
      "── RECOMMENDED ANGLE ──",
      brief.recommended_angle.core_idea,
      `Why now: ${brief.recommended_angle.why_this_now}`,
      "",
      "── HOOKS ──",
      ...brief.hook_options.map((h, i) => `${i + 1}. ${h.hook_text}`),
      "",
      "── STRUCTURE ──",
      `Pacing: ${brief.structural_recommendation.pacing_map}`,
      `Arc: ${brief.structural_recommendation.emotional_arc}`,
      "",
      "── PREDICTION ──",
      `Confidence: ${brief.risk_assessment.overall_confidence}%`,
      `Views: ${brief.predicted_performance.estimated_views_range}`,
    ].join("\n");

    navigator.clipboard.writeText(text).then(() => {
      setExported(true);
      setTimeout(() => setExported(false), 2400);
    });
  }

  function handleReset() {
    setBriefResponse(null);
    setProjectId(null);
    setSelectedHookIndex(null);
    setShowInput(true);
    setError(null);
  }

  // ── AUTH LOADING ──────────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "transparent", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <AnimatedBackground />
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{ width: 32, height: 32, borderRadius: "50%", border: "2px solid rgba(207,164,47,0.2)", borderTopColor: C.gold, animation: "spin 1s linear infinite", margin: "0 auto" }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      </div>
    );
  }

  // ── SIGN-IN GATE ──────────────────────────────────────────────────────────────

  if (!authed) {
    return (
      <div style={{ minHeight: "100vh", background: "transparent", position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <AnimatedBackground />
        <div style={{ position: "relative", zIndex: 1, maxWidth: 420, width: "100%", margin: "0 24px" }}>
          <div className="glass-card" style={{ borderRadius: 24, padding: "40px 36px", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🎬</div>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "#FFFFFF", margin: "0 0 10px" }}>
              Sign in to access Omnyra
            </h2>
            <p style={{ color: C.sub, fontSize: 14, lineHeight: 1.6, margin: "0 0 28px" }}>
              Product Launch Reel is a protected feature. Sign in to generate cinematic launch briefs.
            </p>
            <Link
              href="/signin"
              className="gold-btn"
              style={{ display: "block", width: "100%", padding: "14px", fontSize: 15, borderRadius: 12 }}
            >
              Sign In to Continue →
            </Link>
            <p style={{ color: C.sub, fontSize: 12, marginTop: 16 }}>
              No account?{" "}
              <Link href="/signup" style={{ color: C.gold, textDecoration: "underline" }}>Create one free →</Link>
            </p>
          </div>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  const brief = briefResponse?.brief;
  const canSubmit = !submitting && productName.trim().length > 0 && productDesc.trim().length > 0;

  // ── RENDER ────────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "transparent", position: "relative", color: C.text }}>
      <AnimatedBackground />

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg) } }
        @keyframes fadeIn  { from { opacity: 0; transform: translateY(14px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes metalShimmer { 0% { background-position: 0% 50% } 100% { background-position: 200% 50% } }
        @keyframes pulseSoft { 0%,100% { opacity: 1 } 50% { opacity: 0.55 } }
      `}</style>

      <div style={{ position: "relative", zIndex: 1, paddingTop: 72 }}>

        {/* ── Page identity strip ──────────────────────────────────────────── */}
        <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 24px 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
            <Link href="/create" style={{ color: C.sub, fontSize: 12, textDecoration: "none" }}>
              ← All Modes
            </Link>
            <span style={{ color: "rgba(187,168,200,0.3)", fontSize: 12 }}>·</span>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase",
              color: C.pink }}>
              Product Launch Reel
            </span>
          </div>
          {showInput && (
            <>
              <h1 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.8rem, 4vw, 2.6rem)", fontWeight: 700, color: "#FFFFFF", margin: "0 0 8px", lineHeight: 1.15 }}>
                Turn your product into a{" "}
                <span className="metallic-gold">launch moment.</span>
              </h1>
              <p style={{ color: C.sub, fontSize: 15, lineHeight: 1.65, margin: 0 }}>
                Tell Omnyra about your product and we&apos;ll generate a cinematic launch brief — hooks engineered to stop the scroll, visual storytelling arcs, and a CTA that converts.
              </p>
            </>
          )}
        </div>

        {/* ════════════════════════════════════════════════════════════════════
            STATE 1: INPUT FORM
        ════════════════════════════════════════════════════════════════════ */}
        {showInput && (
          <div style={{ maxWidth: 800, margin: "0 auto", padding: "24px 24px 80px", display: "flex", flexDirection: "column", gap: 18 }}>

            {/* ── Product Identity ──────────────────────────────────────── */}
            <div style={CARD}>
              <span style={SECTION_TAG}>Product Identity</span>

              {/* Product Type */}
              <div style={{ marginBottom: 20 }}>
                <label style={LABEL}>Product Type</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  {PRODUCT_TYPES.map(pt => {
                    const active = productType === pt.id;
                    return (
                      <button
                        key={pt.id}
                        onClick={() => setProductType(pt.id)}
                        style={{
                          padding: "14px 10px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit",
                          border: active ? "1px solid rgba(207,164,47,0.6)" : "1px solid rgba(255,255,255,0.08)",
                          background: active ? "rgba(207,164,47,0.1)" : "rgba(255,255,255,0.03)",
                          color: active ? C.gold : C.sub,
                          textAlign: "center", transition: "all 0.2s",
                        }}
                      >
                        <div style={{ fontSize: 22, marginBottom: 6 }}>{pt.icon}</div>
                        <div style={{ fontSize: 13, fontWeight: active ? 700 : 400 }}>{pt.label}</div>
                        <div style={{ fontSize: 10, color: active ? "rgba(212,168,67,0.7)" : "rgba(187,168,200,0.5)", marginTop: 3, lineHeight: 1.4 }}>
                          {pt.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Product Name + Price */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, marginBottom: 20 }}>
                <div>
                  <label style={LABEL}>Product Name *</label>
                  <input
                    type="text"
                    value={productName}
                    onChange={e => setProductName(e.target.value)}
                    placeholder="e.g. GlowMask Pro, The Inner Work Course, Solara App"
                    style={INPUT}
                  />
                </div>
                <div style={{ minWidth: 140 }}>
                  <label style={LABEL}>Price Point</label>
                  <input
                    type="text"
                    value={pricePoint}
                    onChange={e => setPricePoint(e.target.value)}
                    placeholder="e.g. $49 / free"
                    style={INPUT}
                  />
                </div>
              </div>

              {/* Product Description */}
              <div>
                <label style={LABEL}>What does it do? *</label>
                <textarea
                  rows={3}
                  value={productDesc}
                  onChange={e => setProductDesc(e.target.value)}
                  placeholder="Describe your product in plain language. What problem does it solve? What transformation does it create? e.g. 'A 10-minute morning routine system that builds consistent habits without willpower...'"
                  style={{ ...INPUT, resize: "vertical", lineHeight: 1.6 }}
                />
              </div>
            </div>

            {/* ── Key Selling Points ────────────────────────────────────── */}
            <div style={CARD}>
              <span style={SECTION_TAG}>Key Selling Points</span>
              <p style={{ color: C.sub, fontSize: 13, marginTop: -8, marginBottom: 18, lineHeight: 1.55 }}>
                The 3 things that make your product impossible to ignore. These become visual beats in the reel.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {features.map((f, i) => (
                  <div key={i} style={{ position: "relative" }}>
                    <div style={{
                      position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
                      width: 20, height: 20, borderRadius: "50%",
                      background: f.trim() ? "rgba(207,164,47,0.2)" : "rgba(255,255,255,0.06)",
                      border: f.trim() ? "1px solid rgba(207,164,47,0.5)" : "1px solid rgba(255,255,255,0.1)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 10, fontWeight: 700, color: f.trim() ? C.gold : C.sub,
                      transition: "all 0.2s",
                    }}>
                      {i + 1}
                    </div>
                    <input
                      type="text"
                      value={f}
                      onChange={e => {
                        const next = [...features];
                        next[i] = e.target.value;
                        setFeatures(next);
                      }}
                      placeholder={[
                        "e.g. Works in 60 seconds — no complicated setup",
                        "e.g. Clinically tested by 500 users, 94% saw results",
                        "e.g. Comes with a 90-day money-back guarantee",
                      ][i]}
                      style={{ ...INPUT, paddingLeft: 44 }}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* ── Audience & Vibe ───────────────────────────────────────── */}
            <div style={CARD}>
              <span style={SECTION_TAG}>Audience &amp; Aesthetic</span>

              <div style={{ marginBottom: 20 }}>
                <BrandContextFields
                  showNiche={false}
                  values={{ targetAudience, pastWins, competitors, uniqueAngle }}
                  onChange={(field: string, value: string) => {
                    if (field === "targetAudience") setTargetAudience(value);
                    else if (field === "pastWins") setPastWins(value);
                    else if (field === "competitors") setCompetitors(value);
                    else if (field === "uniqueAngle") setUniqueAngle(value);
                  }}
                />
              </div>

              <div>
                <label style={LABEL}>Brand Vibe</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {VIBES.map(v => {
                    const active = vibe === v.id;
                    return (
                      <button
                        key={v.id}
                        onClick={() => setVibe(active ? "" : v.id)}
                        style={{
                          display: "flex", alignItems: "center", gap: 6,
                          padding: "8px 16px", borderRadius: 100, cursor: "pointer", fontFamily: "inherit",
                          fontSize: 12, fontWeight: active ? 700 : 400,
                          border: active ? "1px solid rgba(207,164,47,0.55)" : "1px solid rgba(255,255,255,0.08)",
                          background: active ? "rgba(207,164,47,0.12)" : "rgba(255,255,255,0.03)",
                          color: active ? C.gold : C.sub,
                          transition: "all 0.2s",
                        }}
                      >
                        <span>{v.icon}</span>
                        <span>{v.label}</span>
                        {active && <span style={{ fontSize: 9, marginLeft: 2 }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Platform & Campaign ───────────────────────────────────── */}
            <div style={CARD}>
              <span style={SECTION_TAG}>Campaign Setup</span>

              {/* Platform */}
              <div style={{ marginBottom: 20 }}>
                <label style={LABEL}>Platform</label>
                <div style={{ display: "flex", gap: 10 }}>
                  {PLATFORMS.map(p => {
                    const active = platform === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setPlatform(p.id)}
                        style={{
                          flex: 1, padding: "10px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit",
                          fontSize: 12, fontWeight: active ? 700 : 400,
                          border: active ? "1px solid rgba(207,164,47,0.55)" : "1px solid rgba(255,255,255,0.08)",
                          background: active ? "rgba(207,164,47,0.12)" : "rgba(255,255,255,0.03)",
                          color: active ? C.gold : C.sub,
                          transition: "all 0.2s",
                        }}
                      >
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Outcome */}
              <div>
                <label style={LABEL}>Campaign Objective</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                  {OUTCOMES.map(o => {
                    const active = outcome === o.id;
                    return (
                      <button
                        key={o.id}
                        onClick={() => setOutcome(o.id)}
                        style={{
                          padding: "14px 10px", borderRadius: 12, cursor: "pointer", fontFamily: "inherit",
                          border: active ? "1px solid rgba(232,121,249,0.5)" : "1px solid rgba(255,255,255,0.08)",
                          background: active ? "rgba(232,121,249,0.08)" : "rgba(255,255,255,0.03)",
                          textAlign: "center", transition: "all 0.2s",
                        }}
                      >
                        <div style={{ fontSize: 20, marginBottom: 6 }}>{o.icon}</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: active ? "#E879F9" : C.sub, marginBottom: 4 }}>
                          {o.label}
                        </div>
                        <div style={{ fontSize: 10, color: "rgba(187,168,200,0.55)", lineHeight: 1.4 }}>
                          {o.desc}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Media Upload ──────────────────────────────────────────── */}
            <div style={CARD}>
              <span style={SECTION_TAG}>Media Upload</span>
              <p style={{ color: "rgba(187,168,200,0.6)", fontSize: 12, margin: "-10px 0 14px", lineHeight: 1.5 }}>
                Used for AI image generation and avatar matching
              </p>

              {uploadedFiles.length < 3 && (
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    border: `2px dashed ${dragOver ? "rgba(207,164,47,0.7)" : "rgba(207,164,47,0.3)"}`,
                    borderRadius: 14,
                    padding: "28px 20px",
                    textAlign: "center",
                    cursor: "pointer",
                    background: dragOver ? "rgba(207,164,47,0.06)" : "rgba(0,0,0,0.15)",
                    transition: "all 0.2s ease",
                  }}
                >
                  <div style={{ fontSize: 28, marginBottom: 8 }}>📎</div>
                  <p style={{ color: C.sub, fontSize: 13, margin: "0 0 4px", fontWeight: 500 }}>
                    Drop product images or face photo here
                  </p>
                  <p style={{ color: "#8A7D92", fontSize: 11, margin: 0 }}>
                    JPG, PNG, WebP · Max 3 files · 5MB each
                  </p>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                style={{ display: "none" }}
                onChange={handleFileInput}
              />

              {uploadedFiles.length > 0 && (
                <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
                  {uploadedFiles.map((f, i) => (
                    <div
                      key={i}
                      style={{
                        position: "relative",
                        width: 72,
                        height: 72,
                        borderRadius: 10,
                        overflow: "hidden",
                        border: "1px solid rgba(207,164,47,0.35)",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.dataUrl} alt={f.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      <button
                        onClick={() => setUploadedFiles((prev) => prev.filter((_, idx) => idx !== i))}
                        style={{
                          position: "absolute", top: 3, right: 3,
                          width: 18, height: 18, borderRadius: "50%",
                          background: "rgba(0,0,0,0.75)", border: "none",
                          color: "#fff", fontSize: 10, cursor: "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          fontFamily: "inherit",
                        }}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {uploadedFiles.length < 3 && (
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      style={{
                        width: 72, height: 72, borderRadius: 10,
                        border: "2px dashed rgba(207,164,47,0.25)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        cursor: "pointer", color: "#8A7D92", fontSize: 22,
                      }}
                    >
                      +
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Error */}
            {error && !submitting && (
              <div style={{
                padding: "14px 18px", borderRadius: 12,
                background: "rgba(196,122,90,0.08)", border: "1px solid rgba(196,122,90,0.3)",
              }}>
                <p style={{ color: "#CCABAF", fontSize: 13, margin: 0 }}>⚠ {error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={canSubmit ? "gold-btn" : undefined}
              style={{
                width: "100%", padding: "18px 24px", borderRadius: 9999,
                border: "none", fontSize: 16, fontWeight: 700, fontFamily: "inherit",
                cursor: canSubmit ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                ...(!canSubmit ? { background: "rgba(255,255,255,0.05)", color: "#8A7D92" } : {}),
              }}
            >
              {submitting ? (
                <>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#D4A843", display: "inline-block", animation: "pulseSoft 1.1s ease-in-out infinite" }} />
                  Omnyra is thinking...
                </>
              ) : (
                `Generate Launch Brief${productName ? ` for ${productName}` : ""} →`
              )}
            </button>

            {/* Loading steps */}
            {submitting && (
              <div style={{ display: "flex", justifyContent: "center", gap: 36 }}>
                {LOADING_STEPS.map((label, i) => (
                  <div key={i} style={{ textAlign: "center" }}>
                    <div style={{
                      width: 8, height: 8, borderRadius: "50%", margin: "0 auto 6px",
                      background: loadingStep >= i ? C.gold : "rgba(212,168,67,0.15)",
                      boxShadow: loadingStep === i ? "0 0 12px rgba(212,168,67,0.7)" : "none",
                      transition: "all 0.5s ease",
                    }} />
                    <p style={{ fontSize: 11, color: loadingStep >= i ? C.gold : "#8A7D92", margin: 0, whiteSpace: "nowrap", transition: "color 0.5s" }}>
                      {label}
                    </p>
                  </div>
                ))}
              </div>
            )}

          </div>
        )}

        {/* ════════════════════════════════════════════════════════════════════
            STATE 2: RESULTS
        ════════════════════════════════════════════════════════════════════ */}
        {!showInput && brief && (
          <div style={{ maxWidth: 920, margin: "0 auto", padding: "20px 24px 80px", animation: "fadeIn 0.45s ease-out" }}>

            {/* Top bar */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
              <div>
                <div style={{ fontSize: 11, color: C.sub, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.12em" }}>
                  Launch Brief
                </div>
                <div style={{ fontSize: 20, fontWeight: 700, color: "#FFFFFF" }}>
                  {productName}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setShowInput(true)}
                  style={{ padding: "7px 14px", borderRadius: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: C.sub, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                >
                  Edit Inputs
                </button>
                <button
                  onClick={handleReset}
                  style={{ padding: "7px 14px", borderRadius: 8, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: C.sub, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                >
                  New Product
                </button>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

              {/* ── Card 1: Situation Analysis ──────────────────────────── */}
              <div style={CARD}>
                <span style={SECTION_TAG}>Market Situation</span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
                  <div>
                    <p style={{ fontSize: 11, color: "#8A7D92", margin: "0 0 6px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      📊 What&apos;s happening
                    </p>
                    <p style={{ color: C.sub, fontSize: 14, lineHeight: 1.65, margin: 0 }}>
                      {brief.situation_analysis.whats_happening_in_niche}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: 11, color: "#8A7D92", margin: "0 0 6px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      👁 Audience responding to
                    </p>
                    <p style={{ color: C.sub, fontSize: 14, lineHeight: 1.65, margin: 0 }}>
                      {brief.situation_analysis.what_your_audience_is_responding_to}
                    </p>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <p style={{ fontSize: 11, color: "#8A7D92", margin: "0 0 6px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      🎯 Your opening
                    </p>
                    <p style={{ color: C.purple, fontWeight: 500, fontSize: 14, lineHeight: 1.65, margin: 0 }}>
                      {brief.situation_analysis.white_space_opportunity}
                    </p>
                  </div>
                </div>
              </div>

              {/* ── Card 2: Recommended Angle ────────────────────────────── */}
              <div style={{ ...CARD, border: "1px solid rgba(207,164,47,0.45)", boxShadow: "0 0 50px -15px rgba(207,164,47,0.2)" }}>
                <span style={{ ...SECTION_TAG, background: "linear-gradient(105deg, #CFA42F, #F7D96B, #CFA42F)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
                  Recommended Angle
                </span>
                <h2 style={{ fontFamily: "var(--font-display)", fontSize: "clamp(1.1rem, 2.5vw, 1.5rem)", fontWeight: 600, color: C.purple, margin: "0 0 16px", lineHeight: 1.3 }}>
                  {brief.recommended_angle.core_idea}
                </h2>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <p style={{ color: C.sub, fontSize: 14, lineHeight: 1.65, margin: 0 }}>
                    <span style={{ marginRight: 8 }}>⏰</span>{brief.recommended_angle.why_this_now}
                  </p>
                  <p style={{ color: C.sub, fontSize: 14, lineHeight: 1.65, margin: 0 }}>
                    <span style={{ marginRight: 8 }}>💪</span>{brief.recommended_angle.why_this_you}
                  </p>
                </div>
              </div>

              {/* ── Card 3: Hook Options ─────────────────────────────────── */}
              <div style={CARD}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                  <span style={{ ...SECTION_TAG, marginBottom: 0 }}>Launch Hooks</span>
                  <span style={{ background: "rgba(232,121,249,0.1)", border: "1px solid rgba(232,121,249,0.2)", color: C.pink, fontSize: 11, padding: "2px 10px", borderRadius: 9999 }}>
                    {brief.hook_options.length} options
                  </span>
                </div>
                <p style={{ color: C.sub, fontSize: 13, marginTop: -10, marginBottom: 16, lineHeight: 1.5 }}>
                  Select a hook to generate your full script. Each is engineered for a different psychological trigger and audience segment.
                </p>

                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {brief.hook_options.map((hook, i) => {
                    const selected = selectedHookIndex === i;
                    const rc = riskColor(hook.risk_level);
                    return (
                      <div
                        key={i}
                        onClick={() => handleSelectHook(i)}
                        style={{
                          background: "rgba(59,39,65,0.85)", backdropFilter: "blur(12px)",
                          border: selected ? "1px solid rgba(207,164,47,0.65)" : "1px solid rgba(255,255,255,0.08)",
                          borderRadius: 14, padding: "20px 22px", cursor: "pointer",
                          transform: selected ? "scale(1.005)" : "scale(1)",
                          transition: "all 0.2s ease",
                          boxShadow: selected ? "0 0 28px rgba(207,164,47,0.12)" : "none",
                        }}
                      >
                        <p style={{ color: C.purple, fontSize: 16, fontWeight: 600, margin: "0 0 10px", lineHeight: 1.4 }}>
                          &ldquo;{hook.hook_text}&rdquo;
                        </p>

                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
                          <span style={{ background: "rgba(232,121,249,0.1)", border: "1px solid rgba(232,121,249,0.2)", color: C.pink, fontSize: 11, padding: "3px 10px", borderRadius: 9999 }}>
                            {hook.hook_type}
                          </span>
                          <span style={{ background: `${rc}18`, border: `1px solid ${rc}40`, color: rc, fontSize: 11, padding: "3px 10px", borderRadius: 9999 }}>
                            {riskLabel(hook.risk_level)}
                          </span>
                          {hook.best_for_audience_segment && (
                            <span style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: C.sub, fontSize: 11, padding: "3px 10px", borderRadius: 9999 }}>
                              {hook.best_for_audience_segment}
                            </span>
                          )}
                        </div>

                        <p style={{ color: C.sub, fontSize: 13, lineHeight: 1.55, margin: "0 0 10px" }}>
                          <span style={{ color: "#8A7D92", marginRight: 6, fontSize: 11 }}>Why this converts:</span>
                          {hook.retention_rationale}
                        </p>

                        <p style={{ color: C.sub, fontSize: 13, lineHeight: 1.55, margin: "0 0 12px" }}>
                          <span style={{ color: "#8A7D92", marginRight: 6, fontSize: 11 }}>Triggers:</span>
                          {hook.psychological_trigger}
                        </p>

                        {/* Retention bar */}
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                            <span style={{ fontSize: 11, color: "#8A7D92" }}>Predicted retention strength</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: C.gold }}>{hook.predicted_retention_strength}/100</span>
                          </div>
                          <div style={{ height: 4, background: "#3B2741", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${hook.predicted_retention_strength}%`, background: "linear-gradient(90deg, #CFA42F, #F0A500)", borderRadius: 2, transition: "width 0.6s ease" }} />
                          </div>
                        </div>

                        {selected && (
                          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(207,164,47,0.2)" }}>
                            <p style={{ color: C.gold, fontSize: 13, fontWeight: 600, margin: 0 }}>
                              ✓ Selected — ready to generate your full launch script
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {selectedHookIndex !== null && (
                  <button
                    className="gold-btn"
                    onClick={handleGenerateScript}
                    disabled={generatingScript}
                    style={{ width: "100%", marginTop: 16, padding: "14px 24px", fontSize: 15, fontWeight: 700, fontFamily: "inherit", borderRadius: 9999, cursor: generatingScript ? "wait" : "pointer", border: "none" }}
                  >
                    {generatingScript ? "Generating launch script..." : "Generate Full Launch Script →"}
                  </button>
                )}
              </div>

              {/* ── Card 4: Structure & Visual Pacing ────────────────────── */}
              <div style={CARD}>
                <span style={SECTION_TAG}>Structure &amp; Visual Pacing</span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
                  {[
                    { label: "⏱ Pacing Map",      value: brief.structural_recommendation.pacing_map },
                    { label: "🎭 Emotional Arc",    value: brief.structural_recommendation.emotional_arc },
                    { label: "🎬 Visual Direction", value: brief.structural_recommendation.visual_pacing_notes },
                  ].map(({ label, value }) => (
                    <div key={label}>
                      <p style={{ fontSize: 11, color: "#8A7D92", margin: "0 0 6px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>
                        {label}
                      </p>
                      <p style={{ color: C.sub, fontSize: 14, lineHeight: 1.65, margin: 0 }}>{value}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Card 5: Risk & Predictions ────────────────────────────── */}
              <div style={CARD}>
                <span style={SECTION_TAG}>Confidence &amp; Predictions</span>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 28 }}>

                  {/* Confidence */}
                  <div>
                    <p style={{ fontSize: 11, color: "#8A7D92", margin: "0 0 4px" }}>Confidence</p>
                    <p style={{ fontSize: 48, fontWeight: 900, margin: "0 0 8px", background: "linear-gradient(105deg, #CFA42F, #F7D96B)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", lineHeight: 1 }}>
                      {brief.risk_assessment.overall_confidence}%
                    </p>
                    <p style={{ color: C.sub, fontSize: 13, lineHeight: 1.55, margin: "0 0 16px" }}>
                      {brief.risk_assessment.confidence_explanation}
                    </p>
                    <div style={{ background: "rgba(232,121,249,0.05)", border: "1px solid rgba(232,121,249,0.2)", borderRadius: 12, padding: "12px 14px" }}>
                      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.15em", color: C.pink, margin: "0 0 5px", textTransform: "uppercase" }}>Kill Criteria</p>
                      <p style={{ color: C.sub, fontSize: 13, lineHeight: 1.55, margin: 0 }}>{brief.risk_assessment.kill_criteria}</p>
                    </div>
                  </div>

                  {/* Predictions */}
                  <div>
                    <div style={{ marginBottom: 16 }}>
                      <p style={{ fontSize: 11, color: "#8A7D92", margin: "0 0 4px" }}>Estimated Views Range</p>
                      <p style={{ fontSize: 26, fontWeight: 700, color: C.purple, margin: 0 }}>
                        {brief.predicted_performance.estimated_views_range}
                      </p>
                    </div>
                    <div style={{ marginBottom: 16 }}>
                      <p style={{ fontSize: 11, color: "#8A7D92", margin: "0 0 5px" }}>Key Retention Moment</p>
                      <p style={{ color: C.sub, fontSize: 13, lineHeight: 1.55, margin: 0 }}>
                        {brief.predicted_performance.key_retention_moment}
                      </p>
                    </div>
                    <div>
                      <p style={{ fontSize: 11, color: "#8A7D92", margin: "0 0 5px" }}>vs. Baseline</p>
                      <p style={{ color: C.sub, fontSize: 13, lineHeight: 1.55, margin: 0 }}>
                        {brief.predicted_performance.comparison_to_baseline}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* ── Action buttons ───────────────────────────────────────── */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, marginTop: 32 }}>
              {selectedHookIndex !== null && (
                <button
                  className={!isDirecting ? "gold-btn" : undefined}
                  onClick={handleDirectVideo}
                  disabled={isDirecting || generatingScript}
                  style={{
                    padding: "16px 52px", fontSize: 16, fontWeight: 700, fontFamily: "inherit",
                    borderRadius: 9999, cursor: (isDirecting || generatingScript) ? "wait" : "pointer", border: "none",
                    ...((isDirecting || generatingScript) ? { background: "rgba(255,255,255,0.06)", color: "#8A7D92" } : {}),
                  }}
                >
                  {isDirecting ? "Building shot plan..." : "Direct this Video →"}
                </button>
              )}
              <button
                className="btn-ghost"
                onClick={handleExport}
                style={{ padding: "11px 32px", borderRadius: 9999, fontSize: 14, fontWeight: 500, fontFamily: "inherit", cursor: "pointer", background: "transparent" }}
              >
                {exported ? "✓ Copied to clipboard" : "Export Brief"}
              </button>
              <button
                onClick={handleReset}
                style={{ background: "none", border: "none", color: "#8A7D92", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
              >
                Start Over
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
