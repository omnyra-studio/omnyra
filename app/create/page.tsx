"use client";

import { Suspense, useCallback, useEffect, useRef, useState, type CSSProperties, type ChangeEvent, type DragEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import BrandContextFields from "@/components/BrandContextFields";
import PlatformSelector from "@/components/PlatformSelector";
import { usePostHog } from "posthog-js/react";
import ImageGenerator from "@/components/ImageGenerator";
import AssetUpload from "@/components/AssetUpload";
import { getUserTier, TIER_VIDEO_LIMITS, type UserTier } from "@/lib/getUserTier";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VersionResult {
  version: number;
  title: string;
  hook: string;
  script: string;
  cta: string;
  viral_score: number;
  hook_strength: string;
  best_post_time: string;
  estimated_reach: string;
  hooks: Array<{ id: string; hook_text: string; hook_type: string; score: number }>;
}

interface BriefApiResponse {
  success: boolean;
  brief_id: string;
  versions: VersionResult[];
  meta: { model: string; input_tokens: number; output_tokens: number };
}

interface UploadedFile {
  name: string;
  dataUrl: string;
  size: number;
}

interface VoiceOption {
  voice_id: string;
  name: string;
  preview_url?: string;
  labels?: {
    gender?: string;
    accent?: string;
    age?: string;
    description?: string;
    use_case?: string;
  };
}

// ─── Style constants ──────────────────────────────────────────────────────────

const LABEL: CSSProperties = {
  color: "#BBA8C8",
  fontSize: 13,
  fontWeight: 500,
  marginBottom: 6,
  display: "block",
};

const INPUT: CSSProperties = {
  width: "100%",
  background: "#0D0010",
  border: "1px solid rgba(204,171,175,0.25)",
  borderRadius: 12,
  padding: "12px 16px",
  color: "#C084FC",
  fontSize: 14,
  fontFamily: "inherit",
  outline: "none",
  boxSizing: "border-box",
  transition: "border-color 0.2s",
};

const SECTION_TAG: CSSProperties = {
  display: "block",
  color: "#E879F9",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: "0.2em",
  textTransform: "uppercase",
  marginBottom: 16,
  textAlign: "center",
};

const PIPELINE_STATUS_LABELS: Record<string, string> = {
  planning_scenes:   "Planning scenes...",
  generating_audio:  "Generating voiceover...",
  generating_avatar: "Generating avatar...",
  stitching:         "Finalising video...",
};

const TEMPLATE_TITLES: Record<string, string> = {
  "ugc-ad": "UGC Ad",
  storytime: "TikTok Storytime",
  influencer: "AI Influencer",
  "product-launch": "Product Launch",
  faceless: "Faceless Content",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hookStrengthColor(s: string) {
  if (s === "Explosive") return "#FF6B6B";
  if (s === "Strong") return "#4ECB8C";
  if (s === "Moderate") return "#F0C040";
  return "#A89BAF";
}

// ─── ViralScore component ─────────────────────────────────────────────────────

function ViralScore({ v }: { v: VersionResult }) {
  return (
    <div
      className="glass-card"
      style={{
        borderRadius: 20,
        padding: "24px 28px",
        background: "rgba(212,168,67,0.03)",
        border: "1px solid rgba(212,168,67,0.22)",
      }}
    >
      <span
        style={{
          ...SECTION_TAG,
          background: "linear-gradient(105deg, #CFA42F, #F7D96B, #CFA42F)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
        }}
      >
        Viral Analytics
      </span>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
          gap: 20,
        }}
      >
        {/* Viral Potential */}
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 10, color: "#8A7D92", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600 }}>
            Viral Potential
          </p>
          <p
            style={{
              fontSize: 34,
              fontWeight: 700,
              margin: 0,
              color: "#F0C040",
              lineHeight: 1.1,
            }}
          >
            {v.viral_score}
          </p>
          <p style={{ fontSize: 10, color: "#A89BAF", margin: "2px 0 0" }}>/ 100</p>
        </div>

        {/* Hook Strength */}
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 10, color: "#8A7D92", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600 }}>
            Hook Strength
          </p>
          <p style={{ fontSize: 17, fontWeight: 700, margin: 0, color: hookStrengthColor(v.hook_strength), lineHeight: 1.2 }}>
            {v.hook_strength}
          </p>
        </div>

        {/* Estimated Reach */}
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 10, color: "#8A7D92", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600 }}>
            Estimated Reach
          </p>
          <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: "#E879F9", lineHeight: 1.3 }}>
            {v.estimated_reach}
          </p>
        </div>

        {/* Best Post Time */}
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 10, color: "#8A7D92", margin: "0 0 8px", textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 600 }}>
            Best Post Time
          </p>
          <p style={{ fontSize: 13, fontWeight: 600, margin: 0, color: "#C084FC", lineHeight: 1.4 }}>
            {v.best_post_time}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Loading messages ─────────────────────────────────────────────────────────

const LOADING_MESSAGES = [
  'Analyzing TikTok trends... (~10s)',
  'Studying your audience...',
  'Building viral hooks...',
  'Crafting 5 unique angles...',
  'Calculating viral scores...',
  'Almost ready...',
];

// ─── Component ────────────────────────────────────────────────────────────────

function CreatePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const posthog = usePostHog();
  const template = searchParams.get("template") ?? "ugc-ad";
  const restoredFromSession = useRef(false);

  // Auth
  const [authLoading, setAuthLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [memoryCount, setMemoryCount] = useState(0);

  // Form — core
  const [goal, setGoal] = useState("");
  const [niche, setNiche] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);

  // Form — structured context
  const [targetAudience, setTargetAudience] = useState("");
  const [pastWins, setPastWins] = useState("");
  const [competitors, setCompetitors] = useState("");
  const [uniqueAngle, setUniqueAngle] = useState("");

  // File upload
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [loadingMessageIndex, setLoadingMessageIndex] = useState(0);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [streamedText, setStreamedText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Results
  const [briefResponse, setBriefResponse] = useState<BriefApiResponse | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [selectedVersion, setSelectedVersion] = useState(0);
  const [selectedHookIndex, setSelectedHookIndex] = useState<number | null>(null);
  const [showInput, setShowInput] = useState(true);
  const [generatingScript, setGeneratingScript] = useState(false);
  const [generatingMore, setGeneratingMore] = useState(false);
  const [exported, setExported] = useState(false);

  // Script + director
  const [generatedScript,    setGeneratedScript]    = useState<string>("");
  const generatedScriptRef = useRef<string>("");
  const [scriptId,           setScriptId]           = useState<string | null>(null);
  const [generatingShotPlan, setGeneratingShotPlan] = useState(false);

  // Voice
  const [userVoice, setUserVoice] = useState<{ voice_id: string; voice_name: string | null; has_voice_clone: boolean } | null>(null);
  const [isGeneratingVoice, setIsGeneratingVoice] = useState(false);
  const [voiceAudioUrl, setVoiceAudioUrl] = useState<string | null>(null);
  const [voiceDuration, setVoiceDuration] = useState(0);

  // Video generation panel
  const [voiceUrl, setVoiceUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoType, setVideoType] = useState<string | null>(null);
  const [pipelineStatus, setPipelineStatusDisplay] = useState<string | null>(null);
  const [hedraResuming, setHedraResuming] = useState(false);

  // Inline voice picker
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState<string>('');

  // Two-phase cinematic pipeline state
  const [clipsReady, setClipsReady] = useState(false);
  const [pendingClipUrls, setPendingClipUrls] = useState<string[]>([]);
  const [pendingClipDuration, setPendingClipDuration] = useState(10);
  const [pendingScript, setPendingScript] = useState('');
  const [pendingSourceImages, setPendingSourceImages] = useState<string[]>([]);
  const [savedReferenceId, setSavedReferenceId] = useState<string | null>(null);

  // Character registry
  const [characters, setCharacters] = useState<Array<{ id: string; name: string; ref_frame_url: string | null }>>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>('');

  // Selected scene image (from ImageGenerator or upload)
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Merge video + voiceover
  const [isMerging, setIsMerging] = useState(false);
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(null);

  // Visual continuity score (from cinematic generation)
  const [continuityScore, setContinuityScore] = useState<{
    character: number; environment: number; object: number; overall: number;
  } | null>(null);

  // Tier gating
  const [userTier, setUserTier] = useState<UserTier>("free");
  const [tierLimits, setTierLimits] = useState<typeof TIER_VIDEO_LIMITS[UserTier]>(TIER_VIDEO_LIMITS.free);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Avatar reference video upload
  const [avatarRefVideoUrl, setAvatarRefVideoUrl] = useState<string | null>(null);

  // Explicit face photo for Hedra avatar (takes priority over selectedImage)
  const [avatarImageUrl, setAvatarImageUrl] = useState<string | null>(null);

  // Lightning Mode — 2 clips, 5s each, ultra-draft quality, ~60s total
  const [lightningMode, setLightningMode] = useState(false);

  // Async job IDs — set when generation fires in background
  const [cinematicJobId, setCinematicJobId] = useState<string | null>(null);
  const [avatarJobId,    setAvatarJobId]    = useState<string | null>(null);

  // Rich generation progress
  const [genStage,   setGenStage]   = useState('');
  const [genMessage, setGenMessage] = useState('');
  const [genEta,     setGenEta]     = useState<number | null>(null);
  const genStartRef = useRef<number | null>(null);

  // Success toast + scroll-to-video
  const [showVideoToast, setShowVideoToast] = useState(false);
  const videoSectionRef = useRef<HTMLDivElement>(null);

  // Poll cleanup ref
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track previous videoType to detect tool switches
  const prevVideoTypeRef = useRef<string | null>(null);

  // Prevents stale sessionStorage setTimeout from restoring state after a reset
  const skipRestoreRef = useRef(false);

  // Series / continuation tracking
  const [continuationMode, setContinuationMode] = useState<{
    seriesId:       string;
    episodeNumber:  number;
    characterId:    string | null;
    characterName:  string | null;
    parentRenderId: string;
    parentSummary:  string;
  } | null>(null);
  const [isLoadingContinuation, setIsLoadingContinuation] = useState(false);

  // Restore in-progress video work from sessionStorage on mount.
  // Intentionally does NOT restore goal / niche / selectedPlatforms — input fields
  // always start blank so the user is never confused by a "stale" prompt on load.
  // skipRestoreRef prevents this running if resetAllState() was called synchronously
  // before this effect settled (eliminates the async race condition).
  useEffect(() => {
    if (skipRestoreRef.current) return;
    const saved = sessionStorage.getItem('omnyra_create_state');
    if (!saved) return;
    restoredFromSession.current = true;
    try {
      const state = JSON.parse(saved) as Record<string, unknown>;
      if (skipRestoreRef.current) return;
      // ── Input fields: NEVER restored — always start fresh ───────────────
      // goal, niche, selectedPlatforms, targetAudience, pastWins, competitors,
      // uniqueAngle are intentionally omitted so the prompt field is always blank.
      // ── In-progress video work: restored so user doesn't lose clips/brief ─
      if (state.selectedImage)   setSelectedImage(state.selectedImage as string);
      if (state.selectedVoiceId) setSelectedVoiceId(state.selectedVoiceId as string);
      if (state.videoType)       setVideoType(state.videoType as string);
      if (state.generatedScript) {
        setGeneratedScript(state.generatedScript as string);
        generatedScriptRef.current = state.generatedScript as string;
      }
      if (Array.isArray(state.pendingClipUrls) && (state.pendingClipUrls as unknown[]).length) {
        setPendingClipUrls(state.pendingClipUrls as string[]);
        setPendingClipDuration((state.pendingClipDuration as number | undefined) ?? 10);
        setPendingScript((state.pendingScript as string | undefined) ?? '');
        setClipsReady((state.clipsReady as boolean | undefined) ?? false);
      }
      if (state.briefResponse) {
        setBriefResponse(state.briefResponse as BriefApiResponse);
        setShowInput(false);
        setSelectedVersion((state.selectedVersion as number | undefined) ?? 0);
      }
    } catch { /* malformed JSON — ignore */ }
  }, []);

  // Persist key state to sessionStorage on every change so navigation doesn't lose work
  useEffect(() => {
    if (!goal && !briefResponse && !generatedScript && !pendingClipUrls.length) return;
    try {
      sessionStorage.setItem('omnyra_create_state', JSON.stringify({
        goal, niche, targetAudience, pastWins, competitors, uniqueAngle,
        selectedPlatforms, briefResponse, selectedVersion,
        generatedScript: generatedScriptRef.current,
        selectedImage, selectedVoiceId, videoType,
        pendingClipUrls, pendingClipDuration, pendingScript, clipsReady,
      }));
    } catch { /* storage quota exceeded — ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal, niche, targetAudience, pastWins, competitors, uniqueAngle,
      selectedPlatforms, briefResponse, selectedVersion, generatedScript,
      selectedImage, selectedVoiceId, videoType, pendingClipUrls, clipsReady]);

  // Auth check + brand profile pre-fill
  useEffect(() => {
    const sb = createClient();
    sb.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/signin");
        return;
      }
      setUserId(session.user.id);
      setAuthLoading(false);

      sb.from("profiles")
        .select("voice_id, voice_name, has_voice_clone")
        .eq("id", session.user.id)
        .single()
        .then(({ data }) => {
          if (data?.voice_id) {
            setUserVoice(data as { voice_id: string; voice_name: string | null; has_voice_clone: boolean });
            setSelectedVoiceId(data.voice_id);
          }
        });

      fetch('/api/voices')
        .then(r => r.json())
        .then(data => setVoices(Array.isArray(data.voices) ? data.voices : []))
        .catch(() => {});

      sb
        .from("creator_memory")
        .select("id", { count: "exact", head: true })
        .eq("user_id", session.user.id)
        .then(({ count }) => setMemoryCount(count ?? 0));

      fetch("/api/brand", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((p) => {
          if (!p || restoredFromSession.current) return;
          // 'omnyra_no_prefill' is written by resetAllState() so a hard refresh after
          // "New Project" doesn't re-inject the previous brand niche/audience.
          // Flag is one-shot: consumed immediately so subsequent visits pre-fill normally.
          const noPrefill = sessionStorage.getItem('omnyra_no_prefill');
          if (noPrefill) { sessionStorage.removeItem('omnyra_no_prefill'); return; }
          if (p.niche || p.primary_niche) setNiche(p.primary_niche || p.niche);
          if (p.target_audience) setTargetAudience(p.target_audience);
          if (p.competitors) setCompetitors(p.competitors);
        })
        .catch(() => {});
    });
  }, [router]);

  // Cycling loading messages
  useEffect(() => {
    if (!submitting) { setTimeout(() => setLoadingMessageIndex(0), 0); return; }
    const interval = setInterval(() => {
      setLoadingMessageIndex(prev => (prev + 1) % LOADING_MESSAGES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [submitting]);

  // Progress bar animation (~25s to reach 92%)
  useEffect(() => {
    if (!submitting) { setTimeout(() => setLoadingProgress(0), 0); return; }
    setTimeout(() => setLoadingProgress(0), 0);
    const interval = setInterval(() => {
      setLoadingProgress(prev => Math.min(prev + 2, 92));
    }, 500);
    return () => clearInterval(interval);
  }, [submitting]);

  // Load user tier
  useEffect(() => {
    getUserTier().then(tier => {
      setUserTier(tier);
      setTierLimits(TIER_VIDEO_LIMITS[tier]);
    });
  }, []);

  // Clean up video poll on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // Track generation start time
  useEffect(() => {
    if (isGeneratingVideo) {
      if (!genStartRef.current) genStartRef.current = Date.now();
    } else {
      genStartRef.current = null;
      setGenStage('');
      setGenMessage('');
      setGenEta(null);
    }
  }, [isGeneratingVideo]);

  // Clear results (but keep form inputs) when user switches video tool type.
  // Only fires when switching from one valid type to another — not on null → type (initial pick).
  useEffect(() => {
    const prev = prevVideoTypeRef.current;
    prevVideoTypeRef.current = videoType;
    if (!prev || !videoType || prev === videoType) return; // no tool switch
    if (isGeneratingVideo) return; // don't interrupt active generation
    // Clear output-side state only — keep goal/niche/form so user can re-generate in the new tool
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setBriefResponse(null);
    setProjectId(null);
    setSelectedVersion(0);
    setSelectedHookIndex(null);
    setShowInput(true);
    setGeneratedScript('');
    generatedScriptRef.current = '';
    setScriptId(null);
    setStreamedText('');
    setError(null);
    setVideoUrl(null);
    setVideoProgress(0);
    setMergedVideoUrl(null);
    setContinuityScore(null);
    setVoiceUrl(null);
    setVoiceAudioUrl(null);
    setClipsReady(false);
    setPendingClipUrls([]);
    setPendingScript('');
    setPendingSourceImages([]);
    setCinematicJobId(null);
    setAvatarJobId(null);
    setPipelineStatusDisplay(null);
    setGenStage('');
    setGenMessage('');
    setGenEta(null);
    try { sessionStorage.clear(); } catch { /* ok */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoType]);

  // Drive stage label / message / ETA from progress + videoType + pipelineStatus
  useEffect(() => {
    if (!isGeneratingVideo) return;
    const p = videoProgress;

    let stage = '';
    let msg   = '';
    let totalSecs = 90;

    if (videoType === 'cinematic') {
      totalSecs = lightningMode ? 65 : 120;
      if      (p < 8)   { stage = 'Analyzing script';    msg = 'Breaking your script into visual scenes...'; }
      else if (p < 15)  { stage = 'Scene planning';      msg = 'Mapping scene types and camera movements...'; }
      else if (p < 42)  { stage = 'Generating images';   msg = 'Flux AI: Creating reference frames for each scene...'; }
      else if (p < 87)  { stage = 'Generating clips';    msg = lightningMode ? 'Kling: Fast-rendering 2 clips in parallel...' : 'Kling Pro: Animating scenes in parallel...'; }
      else if (p < 96)  { stage = 'Adding voiceover';    msg = 'ElevenLabs: Synthesizing narration...'; }
      else if (p < 100) { stage = 'Stitching video';     msg = 'Assembling final video from all clips...'; }
      else              { stage = 'Complete';             msg = 'Your video is ready!'; }
    } else if (videoType === 'avatar') {
      totalSecs = 140;
      const ps = pipelineStatus;
      if      (p < 20 || !ps)                { stage = 'Preparing avatar';    msg = 'Loading character profile and script...'; }
      else if (ps === 'generating_audio')     { stage = 'Synthesizing voice';  msg = 'ElevenLabs Flash: Generating narration at 32ms...'; }
      else if (p < 35)                        { stage = 'Submitting to Hedra'; msg = 'Queuing your avatar lip-sync job...'; }
      else if (ps === 'generating_avatar')    { stage = 'Hedra lip-sync';      msg = hedraResuming ? 'Resuming Hedra generation...' : 'Hedra: Animating avatar with lip sync...'; }
      else if (ps === 'stitching')            { stage = 'Stitching video';     msg = 'Assembling final video...'; }
      else                                    { stage = 'Processing';          msg = 'Working on your avatar video...'; }
    } else {
      totalSecs = 45;
      stage = 'Generating';
      msg   = 'Creating your video clip...';
    }

    setGenStage(stage);
    setGenMessage(msg);

    // ETA: ratio-based estimate capped at 2× total
    if (genStartRef.current && p > 5 && p < 99) {
      const elapsedSecs = (Date.now() - genStartRef.current) / 1000;
      const rate        = p / elapsedSecs; // % per second
      if (rate > 0) {
        const byRate      = (100 - p) / rate;
        const byTotal     = Math.max(0, totalSecs - elapsedSecs);
        const eta         = byRate < totalSecs * 2 ? byRate : byTotal;
        setGenEta(Math.max(0, eta));
      }
    } else if (p >= 99) {
      setGenEta(null);
    }
  }, [isGeneratingVideo, videoProgress, videoType, pipelineStatus, hedraResuming]);

  // Load characters when avatar or cinematic mode is selected
  useEffect(() => {
    if ((videoType !== 'avatar' && videoType !== 'cinematic') || characters.length > 0) return;
    fetch('/api/characters')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.characters) setCharacters(data.characters);
      })
      .catch(() => {});
  }, [videoType, characters.length]);

  // ─── File upload helpers ─────────────────────────────────────────────────

  function processFiles(files: FileList | null) {
    if (!files) return;
    const current = uploadedFiles.length;
    const remaining = 3 - current;
    if (remaining <= 0) return;
    Array.from(files).slice(0, remaining).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      if (file.size > 5 * 1024 * 1024) {
        setError(`${file.name} exceeds 5MB limit.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        setUploadedFiles((prev) => {
          if (prev.length >= 3) return prev;
          return [...prev, { name: file.name, dataUrl: ev.target?.result as string, size: file.size }];
        });
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

  function removeFile(i: number) {
    setUploadedFiles((prev) => prev.filter((_, idx) => idx !== i));
  }

  // ─── Inline voice preview ────────────────────────────────────────────────

  async function handlePreviewVoice() {
    if (!selectedVoiceId) return;
    const voice = voices.find(v => v.voice_id === selectedVoiceId);
    if (voice?.preview_url) {
      new Audio(voice.preview_url).play().catch(() => {});
      return;
    }
    setIsGeneratingVoice(true);
    try {
      const res = await fetch('/api/test-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: 'Hello, this is a preview of your selected voice.', voice_id: selectedVoiceId }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      new Audio(URL.createObjectURL(blob)).play().catch(() => {});
    } catch {} finally {
      setIsGeneratingVoice(false);
    }
  }

  // ─── Submission ──────────────────────────────────────────────────────────

  async function handleSubmit() {
    if (!goal.trim() || !userId) return;
    if (!niche.trim()) { setError("Please add your niche in the Brand Context section below."); return; }
    if (template !== "storytime" && selectedPlatforms.length === 0) {
      setError("Select at least one platform.");
      return;
    }
    setSubmitting(true);
    setStreamedText('');
    setError(null);

    // Create a project in DB early so the pipeline has real IDs
    const sb = createClient();
    const { data: proj } = await sb
      .from("projects")
      .insert({
        user_id: userId,
        title: goal.slice(0, 80),
        goal,
        platform: template === "storytime" ? "tiktok" : (selectedPlatforms[0] ?? "tiktok"),
        niche,
        status: "draft",
      })
      .select("id")
      .single();
    if (proj?.id) setProjectId(proj.id as string);

    posthog?.capture('generation_started', {
      template,
      platforms: template === "storytime" ? ["tiktok"] : selectedPlatforms,
    });

    const payload = {
      goal,
      template,
      niche,
      targetAudience,
      platforms: template === "storytime" ? ["tiktok"] : selectedPlatforms,
    };

    try {
      // ── Primary path: sync route (reliable JSON, no stream parsing) ───────────
      const res = await fetch("/api/generate-brief-sync", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error((errBody as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const data = await res.json() as { versions?: VersionResult[] };
      console.log("[generate-brief-sync] response:", JSON.stringify(data).substring(0, 200));

      if (!data.versions?.length) throw new Error("No versions in response");

      setLoadingProgress(100);
      await new Promise<void>(r => setTimeout(r, 300));
      setBriefResponse({
        success:  true,
        brief_id: "",
        versions: data.versions,
        meta:     { model: "claude-sonnet-4-6", input_tokens: 0, output_tokens: 0 },
      });
      setSelectedVersion(0);
      setSelectedHookIndex(null);
      setShowInput(false);
      setStreamedText("");
      posthog?.capture("generation_completed", { template, versions_count: data.versions.length });

    } catch (primaryErr) {
      // ── Fallback: streaming route ─────────────────────────────────────────────
      console.warn("[generate-brief] sync failed, trying stream fallback:", primaryErr);
      try {
        const res = await fetch("/api/generate-brief", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(payload),
        });

        if (!res.ok || !res.body) throw new Error("Streaming fallback failed");

        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText  = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          fullText += chunk;
          setStreamedText(fullText);
        }

        // ── Debug logs ──────────────────────────────────────────────────────────
        console.log("=== STREAM COMPLETE ===");
        console.log("Total length:", fullText.length);
        console.log("First 300:", fullText.substring(0, 300));
        console.log("Last 300:",  fullText.substring(Math.max(0, fullText.length - 300)));
        console.log('Contains "versions":', fullText.includes('"versions"'));
        console.log("Contains {:", fullText.includes("{"));
        console.log("Contains }:", fullText.includes("}"));

        const clean = fullText.replace(/```json/g, "").replace(/```/g, "").trim();
        const start = clean.indexOf("{");
        const end   = clean.lastIndexOf("}");
        if (start === -1 || end === -1) throw new Error("No JSON in stream response");

        const parsed = JSON.parse(clean.slice(start, end + 1)) as { versions: VersionResult[] };
        if (!parsed.versions?.length) throw new Error("No versions in stream response");

        setLoadingProgress(100);
        await new Promise<void>(r => setTimeout(r, 300));
        setBriefResponse({
          success:  true,
          brief_id: "",
          versions: parsed.versions,
          meta:     { model: "claude-haiku", input_tokens: 0, output_tokens: 0 },
        });
        setSelectedVersion(0);
        setSelectedHookIndex(null);
        setShowInput(false);
        setStreamedText("");
        posthog?.capture("generation_completed", { template, versions_count: parsed.versions.length });

      } catch (fallbackErr) {
        setError(fallbackErr instanceof Error ? fallbackErr.message : "Something went wrong. Please try again.");
        setStreamedText("");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleSelectHook(index: number) {
    setSelectedHookIndex(index);
    posthog?.capture("version_selected", {
      template,
      version_index: selectedVersion,
      viral_score:   briefResponse?.versions[selectedVersion]?.viral_score,
    });

    // Non-blocking analytics persistence — does not gate any UI action
    const v = briefResponse?.versions[selectedVersion];
    if (v && projectId) {
      const sb = createClient();
      void sb.from("hooks")
        .insert({ project_id: projectId, hook_text: v.hook, hook_type: "original", score: v.viral_score ?? 0 });
    }
  }

  async function handleGenerateScript() {
    const v = briefResponse?.versions[selectedVersion];
    if (!v) return;
    setGeneratingScript(true);
    setGeneratedScript("");
    generatedScriptRef.current = "";
    setScriptId(null);
    try {
      const res = await fetch("/api/generate-script", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hook:           v.hook,
          script:         v.script,
          cta:            v.cta,
          title:          v.title,
          template,
          niche,
          targetAudience,
          platforms: template === "storytime" ? ["tiktok"] : selectedPlatforms,
        }),
      });
      if (!res.ok || !res.body) throw new Error("Script generation failed");
      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;
        setGeneratedScript(prev => prev + chunk);
      }
      generatedScriptRef.current = accumulated;
      setTimeout(() => {
        document.getElementById("script-preview")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    } catch {
      setError("Script generation failed. Please try again.");
    } finally {
      setGeneratingScript(false);
    }
  }

  async function handleDirectVideo() {
    if (!scriptId || !projectId) return;
    const platform = selectedPlatforms[0] ?? "tiktok";
    const mode =
      template === "storytime"    ? "storytime"    :
      template === "influencer"   ? "influencer"   :
      template === "product-launch" ? "product_launch" : "general";
    setGeneratingShotPlan(true);
    setError(null);
    try {
      const res = await fetch("/api/orchestrate-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, scriptId, projectId, platform }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Shot plan generation failed");
      router.push(`/dashboard/director/${data.plan_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Shot plan generation failed");
      setGeneratingShotPlan(false);
    }
  }

  async function handleGenerateMore() {
    if (!goal.trim() || !niche.trim()) return;
    setGeneratingMore(true);
    try {
      const platforms = template === "storytime" ? ["tiktok"] : selectedPlatforms;
      const res = await fetch("/api/generate-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal,
          platform: platforms[0],
          platforms,
          niche,
          projectId,
          targetAudience,
          pastWins,
          competitors,
          uniqueAngle,
          uploadedFileCount: uploadedFiles.length,
          versionCount: 5,
        }),
      });
      if (!res.ok || !res.body) throw new Error("Generation failed");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fullText += decoder.decode(value, { stream: true });
      }
      const clean = fullText.replace(/```json/g, '').replace(/```/g, '').trim();
      const s = clean.indexOf('{');
      const e2 = clean.lastIndexOf('}');
      if (s === -1 || e2 === -1) throw new Error('No JSON in response');
      const parsed = JSON.parse(clean.slice(s, e2 + 1)) as { versions: VersionResult[] };
      if (!parsed.versions?.length) throw new Error('No versions returned');
      setBriefResponse((prev) =>
        prev
          ? { ...prev, versions: [...prev.versions, ...parsed.versions] }
          : { success: true, brief_id: '', versions: parsed.versions, meta: { model: '', input_tokens: 0, output_tokens: 0 } }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setGeneratingMore(false);
    }
  }

  function handleExport() {
    if (!briefResponse) return;
    const v = briefResponse.versions[selectedVersion];
    if (!v) return;
    const text = [
      "OMNYRA STRATEGY BRIEF",
      `Goal: ${goal}`,
      `Niche: ${niche}`,
      `Version: ${selectedVersion + 1} — ${v.title}`,
      `Viral Score: ${v.viral_score}/100 | ${v.hook_strength} hook`,
      "",
      "── VIRAL ANALYTICS ──",
      `Hook Strength: ${v.hook_strength}`,
      `Best Post Time: ${v.best_post_time}`,
      `Estimated Reach: ${v.estimated_reach}`,
      "",
      "── HOOK ──",
      v.hook,
      "",
      "── SCRIPT ──",
      v.script,
      "",
      "── CTA ──",
      v.cta,
    ].join("\n");

    navigator.clipboard.writeText(text).then(() => {
      setExported(true);
      setTimeout(() => setExported(false), 2200);
    });
  }

  async function handleAvatarVideoUploaded(url: string) {
    setAvatarRefVideoUrl(url);
    // Persist to profile so the avatar pipeline can find the reference video
    const sb = createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (user) {
      await sb.from("profiles").update({ avatar_reference_video_url: url }).eq("id", user.id);
    }
  }

  async function handleGenerateVoice() {
    const voiceId = selectedVoiceId || userVoice?.voice_id;
    if (!voiceId || !briefResponse) return;
    setIsGeneratingVoice(true);
    setVoiceAudioUrl(null);
    try {
      const v = briefResponse.versions[selectedVersion];
      // Use expanded Claude script when available — brief v.script is ~30 words (13s); generatedScript is 75+ words (30s)
      const scriptText = generatedScript || v.script || v.hook;
      const wordCount  = scriptText.trim().split(/\s+/).length;
      const estimatedSec = (wordCount / 2.5).toFixed(1);
      console.log(`[SCRIPT_AUDIT] word_count=${wordCount} estimated_sec=${estimatedSec} source=${generatedScript ? 'generatedScript' : 'brief_script'}`);
      const res = await fetch('/api/test-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: scriptText, voice_id: voiceId }),
      });
      if (!res.ok) throw new Error('Voice generation failed');
      const blob = await res.blob();
      // Measure actual narration duration for timeline planning
      const dur = await new Promise<number>((resolve) => {
        const audio = new Audio();
        const blobUrl = URL.createObjectURL(blob);
        audio.onloadedmetadata = () => { URL.revokeObjectURL(blobUrl); resolve(audio.duration); };
        audio.onerror = () => { URL.revokeObjectURL(blobUrl); resolve(0); };
        audio.src = blobUrl;
      });
      setVoiceDuration(dur);
      // Upload to Supabase via server route (uses supabaseAdmin, bypasses RLS)
      let publicVoiceUrl: string | null = null;
      try {
        const voiceFormData = new FormData();
        voiceFormData.append('audio', blob, 'voice.mp3');
        voiceFormData.append('userId', userId ?? '');
        const upRes = await fetch('/api/upload/voice', { method: 'POST', body: voiceFormData });
        const upJson = await upRes.json() as { url?: string; error?: string };
        console.log('[VOICE_URL_ASSIGN]', { status: upRes.status, json: upJson });
        if (upRes.ok && upJson.url) {
          publicVoiceUrl = upJson.url;
        } else {
          console.warn('[voice] upload failed:', JSON.stringify(upJson));
        }
      } catch (upErr) {
        console.warn('[voice] upload error:', upErr);
      }
      // Fall back to blob URL for audio player if upload failed
      setVoiceAudioUrl(publicVoiceUrl ?? URL.createObjectURL(blob));
      posthog?.capture('voiceover_generated', { template, has_voice_clone: userVoice?.has_voice_clone });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Voice generation failed');
    } finally {
      setIsGeneratingVoice(false);
    }
  }

  async function handleVersionVoice() {
    if (!briefResponse) return;
    const voice_id = selectedVoiceId || userVoice?.voice_id;
    if (!voice_id) return;
    setIsGeneratingVoice(true);
    setVoiceUrl(null);
    try {
      const script = briefResponse.versions[selectedVersion].script;
      const res = await fetch('/api/test-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: script, voice_id }),
      });
      if (!res.ok) throw new Error('Voice generation failed');
      const blob = await res.blob();
      setVoiceUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error('Voice error:', err);
    } finally {
      setIsGeneratingVoice(false);
    }
  }

  async function handleGenerateVideoAvatar() {
    if (!briefResponse) return;

    if (!avatarImageUrl && !selectedImage) {
      setError('An image is required for Avatar mode — upload a face photo or select a scene image first.');
      return;
    }

    if (pollRef.current) clearInterval(pollRef.current);

    setIsGeneratingVideo(true);
    setVideoProgress(10);
    setPipelineStatusDisplay(null);

    try {
      const script = briefResponse.versions[selectedVersion].script;
      const avatarVoiceId = selectedVoiceId || userVoice?.voice_id || "EXAVITQu4vr4xnSDxMaO";
      console.log('[AVATAR_SUBMIT]', { selectedVoiceId, userVoiceId: userVoice?.voice_id, payloadVoiceId: avatarVoiceId });

      if (!selectedVoiceId && !userVoice?.voice_id) {
        setError('Please select a voice before generating your avatar video.');
        setIsGeneratingVideo(false);
        return;
      }

      const res = await fetch('/api/generate-avatar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          script,
          voice_id:          avatarVoiceId,
          background_image:  selectedImage || avatarImageUrl,
          avatar_image_url:  avatarImageUrl || undefined,
          plan:              userTier,
          character_id:      selectedCharacterId || null,
          lightningMode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to queue avatar job');
      }

      // Idempotency hit — job already completed
      if (data.status === 'completed' && data.result_url) {
        setVideoUrl(data.result_url);
        setMergedVideoUrl(data.result_url);
        setVideoProgress(100);
        setIsGeneratingVideo(false);
        return;
      }

      const jobId: string = data.jobId;
      if (!jobId) throw new Error('No jobId returned from avatar queue');

      // Unlock UI immediately — user can navigate away; banner will track progress
      setAvatarJobId(jobId);
      setIsGeneratingVideo(false);
      setVideoProgress(0);

      // Poll every 15s in background — up to 60 polls (15 min)
      let pollCount = 0;
      const MAX_POLLS = 60;
      let lastStageOutputs: Record<string, string> | null = null;

      pollRef.current = setInterval(async () => {
        try {
          pollCount++;
          if (pollCount > MAX_POLLS) {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            const hedraGenId = lastStageOutputs?.hedra_generation_id;
            if (hedraGenId) {
              console.log('[generate-avatar] client timeout but Hedra gen exists — resuming', hedraGenId);
              setAvatarJobId(null);
              pollHedraCompletion(hedraGenId, jobId);
              return;
            }
            setAvatarJobId(null);
            setError('Avatar generation timed out. Please check My Videos or try again.');
            return;
          }

          const statusRes = await fetch(`/api/job-status?id=${jobId}`);
          if (!statusRes.ok) return; // transient error — keep polling

          const status = await statusRes.json();
          console.log(`[generate-avatar] poll ${pollCount} status=${status.status} stage=${status.stage}`);

          if (status.stage_outputs) lastStageOutputs = status.stage_outputs as Record<string, string>;

          if (status.status === 'completed') {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            setAvatarJobId(null);
            setVideoUrl(status.result_url);
            setMergedVideoUrl(status.result_url);
            setVideoProgress(100);
            setPipelineStatusDisplay(null);
            setShowVideoToast(true);
            setTimeout(() => setShowVideoToast(false), 5000);
            setTimeout(() => videoSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
            void fetch('/api/save-render', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                video_url:        status.result_url,
                script:           generatedScriptRef.current || generatedScript || briefResponse?.versions[selectedVersion]?.script || null,
                template:         'avatar',
                series_id:        continuationMode?.seriesId        ?? null,
                episode_number:   continuationMode?.episodeNumber   ?? null,
                parent_render_id: continuationMode?.parentRenderId  ?? null,
              }),
            }).then(r => r.json())
              .then(d => console.log('[SAVE_RENDER:avatar]', d))
              .catch(e => console.warn('[SAVE_RENDER_ERR:avatar]', e));
          } else if (status.status === 'failed') {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            const hedraGenId: string | undefined = (status.stage_outputs as Record<string, string> | null)?.hedra_generation_id;
            if (hedraGenId) {
              console.log('[generate-avatar] server timed out but Hedra gen exists — resuming client-side', hedraGenId);
              setAvatarJobId(null);
              pollHedraCompletion(hedraGenId, jobId);
              return;
            }
            setAvatarJobId(null);
            const stageLabel = status.stage ? ` [stage: ${status.stage}]` : '';
            setError(`${status.error || 'Avatar generation failed'}${stageLabel}`);
            setPipelineStatusDisplay(null);
          }
        } catch (pollErr) {
          console.error('[generate-avatar] poll error:', pollErr);
          // keep polling on network errors
        }
      }, 15_000);

    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Avatar generation failed';
      console.error('[generate-avatar] error:', msg);
      setError(msg);
      setIsGeneratingVideo(false);
    }
  }

  async function pollHedraCompletion(generationId: string, jobId: string) {
    if (pollRef.current) clearInterval(pollRef.current);
    setHedraResuming(true);
    setIsGeneratingVideo(true);
    setVideoProgress(50);
    setPipelineStatusDisplay('generating_avatar');

    let hedraPolls = 0;
    const MAX_HEDRA_POLLS = 60; // 5 min at 5 s intervals

    pollRef.current = setInterval(async () => {
      try {
        hedraPolls++;
        if (hedraPolls > MAX_HEDRA_POLLS) {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setError('Hedra generation timed out — please try again or contact support.');
          setPipelineStatusDisplay(null);
          setIsGeneratingVideo(false);
          setHedraResuming(false);
          return;
        }

        const resumeRes = await fetch(`/api/resume-hedra?id=${generationId}`);
        if (!resumeRes.ok) return; // transient error — keep polling
        const resume = await resumeRes.json();
        console.log(`[hedra-resume] poll ${hedraPolls} status=${resume.generation?.status}`);

        const genStatus: string = resume.generation?.status ?? '';

        // Advance progress 50 → 88 % while waiting
        setVideoProgress(Math.min(50 + Math.round((hedraPolls / MAX_HEDRA_POLLS) * 38), 88));

        if (genStatus === 'complete') {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setVideoProgress(90);
          setPipelineStatusDisplay('stitching');

          const recoverRes = await fetch(`/api/recover-hedra?id=${generationId}&job_id=${jobId}`);
          const recovered = await recoverRes.json();

          if (!recoverRes.ok || !recovered.video_url) {
            setError(recovered.error || 'Failed to retrieve completed video');
            setPipelineStatusDisplay(null);
            setIsGeneratingVideo(false);
            setHedraResuming(false);
            return;
          }

          setVideoUrl(recovered.video_url);
          setMergedVideoUrl(recovered.video_url);
          setVideoProgress(100);
          setPipelineStatusDisplay(null);
          setIsGeneratingVideo(false);
          setHedraResuming(false);
          setShowVideoToast(true);
          setTimeout(() => setShowVideoToast(false), 5000);
          setTimeout(() => videoSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
          void fetch('/api/save-render', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              video_url:        recovered.video_url,
              script:           generatedScriptRef.current || generatedScript || briefResponse?.versions[selectedVersion]?.script || null,
              template:         'avatar',
              series_id:        continuationMode?.seriesId        ?? null,
              episode_number:   continuationMode?.episodeNumber   ?? null,
              parent_render_id: continuationMode?.parentRenderId  ?? null,
            }),
          }).then(r => r.json())
            .then(d => console.log('[SAVE_RENDER:hedra]', d))
            .catch(e => console.warn('[SAVE_RENDER_ERR:hedra]', e));

        } else if (genStatus === 'error' || genStatus === 'failed') {
          clearInterval(pollRef.current!);
          pollRef.current = null;
          setError('Hedra generation failed — please try again.');
          setPipelineStatusDisplay(null);
          setIsGeneratingVideo(false);
          setHedraResuming(false);
        }
      } catch (pollErr) {
        console.error('[hedra-resume] poll error:', pollErr);
      }
    }, 5000);
  }

  async function handleComposeWithVoice() {
    const voiceId = selectedVoiceId || userVoice?.voice_id;
    if (!voiceId) { setError('Please select a voice'); return; }
    if (!pendingClipUrls.length) return;

    // Try every script source in priority order, pick first with >30 words
    const scriptSources = [
      generatedScriptRef.current,
      generatedScript,
      pendingScript,
      briefResponse?.versions[selectedVersion]?.script,
    ].filter((s): s is string => !!s?.trim());

    console.log('[PHASE2_SCRIPTS]', scriptSources.map((s, i) => ({ i, words: s.split(' ').length, preview: s.substring(0, 50) })));

    const scriptToSpeak = scriptSources.find(s => s.split(' ').length > 30) ?? scriptSources[0];

    if (!scriptToSpeak) {
      setError('No script found — please generate a script first');
      return;
    }

    console.log('[PHASE2_SCRIPT_CHOSEN]', scriptToSpeak.split(' ').length, 'words');

    setIsGeneratingVideo(true);
    setVideoProgress(55);
    setIsGeneratingVoice(true);
    try {
      // TTS — full script, no truncation
      const ttsRes = await fetch('/api/test-voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: scriptToSpeak, voice_id: voiceId, full: true }),
      });
      if (!ttsRes.ok) throw new Error('TTS failed: ' + ttsRes.status);
      const ttsBlob = await ttsRes.blob();
      console.log('[PHASE2_TTS_BLOB]', ttsBlob.size, 'bytes — expected >100000 for 30s audio');
      setIsGeneratingVoice(false);

      // Upload
      const voiceForm = new FormData();
      voiceForm.append('audio', ttsBlob, 'voice.mp3');
      voiceForm.append('userId', userId ?? '');
      const uploadRes = await fetch('/api/upload/voice', { method: 'POST', body: voiceForm });
      const uploadJson = await uploadRes.json() as { url?: string; error?: string };
      console.log('[PHASE2_VOICE_URL]', uploadJson.url);
      if (!uploadJson.url) throw new Error('Voice upload failed: ' + JSON.stringify(uploadJson));
      setVoiceAudioUrl(uploadJson.url);

      setVideoProgress(80);

      // Compose
      const composeRes = await fetch('/api/compose-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clipUrls:     pendingClipUrls,
          clipDuration: pendingClipDuration,
          voiceoverUrl: uploadJson.url,
          mode:         'cinematic',
        }),
      });
      const composeData = await composeRes.json() as { video_url?: string; has_audio?: boolean; error?: string };
      console.log('[PHASE2_COMPOSE_DONE]', composeData);
      if (!composeRes.ok) throw new Error(composeData.error ?? `Compose failed (${composeRes.status})`);

      const finalUrl = composeData.video_url ?? pendingClipUrls[0];
      setVideoUrl(finalUrl);
      if (composeData.has_audio) setMergedVideoUrl(finalUrl);
      setClipsReady(false);
      setPendingClipUrls([]);
      setVideoProgress(100);

      // Save to My Videos library (fire-and-forget, server-side insert via supabaseAdmin)
      void fetch('/api/save-render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_url:        finalUrl,
          audio_url:        uploadJson.url ?? null,
          script:           generatedScriptRef.current || generatedScript || pendingScript || null,
          template,
          series_id:        continuationMode?.seriesId        ?? null,
          episode_number:   continuationMode?.episodeNumber   ?? null,
          parent_render_id: continuationMode?.parentRenderId  ?? null,
        }),
      }).then(r => r.json())
        .then(d => console.log('[SAVE_RENDER:cinematic]', d))
        .catch(e => console.warn('[SAVE_RENDER_ERR:cinematic]', e));
    } catch (err) {
      console.error('[compose-with-voice] error:', err);
      setError(err instanceof Error ? err.message : 'Composition failed');
    } finally {
      setIsGeneratingVideo(false);
      setIsGeneratingVoice(false);
    }
  }

  async function handleGenerateOutput(type: string) {
    if (!briefResponse) return;
    const v = briefResponse.versions[selectedVersion];

    if (type === 'avatar') {
      await handleGenerateVideoAvatar();
      return;
    }

    if (type === 'cinematic') {
      setIsGeneratingVideo(true);
      setVideoProgress(5);
      try {
        const hookText = v.hook || '';

        // ── Step 1: Ensure expanded script ─────────────────────────────────
        // Read from ref — immune to React state resets during async flow
        let scriptForCinematic = generatedScriptRef.current || generatedScript;
        console.log('[VOICE_SCRIPT_SOURCE]', {
          generatedScript: generatedScriptRef.current?.substring(0, 100) || generatedScript?.substring(0, 100),
          vScript: v.script?.substring(0, 100),
          wordCount: (generatedScriptRef.current || generatedScript)?.split(' ').length,
          using: (generatedScriptRef.current || generatedScript) ? 'generatedScript' : 'FALLBACK',
        });
        if (!scriptForCinematic) {
          console.log('[cinematic] no generatedScript — fetching from generate-script');
          setVideoProgress(8);
          try {
            const sRes = await fetch('/api/generate-script', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                hook: v.hook, script: v.script, cta: v.cta, title: v.title,
                template, niche, targetAudience,
                platforms: template === 'storytime' ? ['tiktok'] : selectedPlatforms,
              }),
            });
            if (sRes.ok && sRes.body) {
              const reader = sRes.body.getReader();
              const decoder = new TextDecoder();
              let text = '';
              while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                text += decoder.decode(value, { stream: true });
                setGeneratedScript(text);
              }
              generatedScriptRef.current = text;
              scriptForCinematic = text;
            }
          } catch (sErr) {
            console.warn('[cinematic][SCRIPT_FALLBACK] generate-script threw — falling back to brief v.script:', sErr);
          }
          if (!scriptForCinematic) {
            scriptForCinematic = v.script || '';
            console.warn('[cinematic][SCRIPT_FALLBACK] using brief v.script as fallback', {
              word_count: scriptForCinematic.trim().split(/\s+/).length,
              estimated_sec: (scriptForCinematic.trim().split(/\s+/).length / 2.5).toFixed(1),
            });
          }
        }

        const _auditWordCount = scriptForCinematic.trim().split(/\s+/).length;
        const estimatedSec = (_auditWordCount / 2.5).toFixed(1);
        console.log('[SCRIPT_AUDIT]', { word_count: _auditWordCount, estimated_sec: estimatedSec, source: (generatedScriptRef.current || generatedScript) ? 'generatedScript' : 'brief_fallback' });

        // ── PHASE 1: Generate clips only — voice picker shown after ───────────
        const scriptText = scriptForCinematic;
        // Snapshot script at click time — generatedScriptRef may be stale after async awaits above
        const scriptSnapshot = generatedScriptRef.current?.trim() || generatedScript?.trim() || scriptText?.trim() || '';
        console.log('[SCRIPT_SNAPSHOT]', {
          length: scriptSnapshot.length,
          words:  scriptSnapshot.split(/\s+/).filter(Boolean).length,
          source: generatedScriptRef.current ? 'ref' : generatedScript ? 'state' : 'fallback',
          lightningMode,
        });

        // Lightning: 2 clips (14s video, under 90s total). Normal: 3 clips (30s video).
        // run-cinematic already caps at 3 — matching here prevents split-script over-generation.
        const wordCount         = scriptSnapshot.split(/\s+/).filter(Boolean).length || 75;
        const estimatedVoiceSec = Math.ceil(wordCount / 2.3);
        const clipCount         = lightningMode ? 2 : 3;
        console.log('[LIGHTNING]', { lightningMode, clipCount, wordCount, estimatedVoiceSec });

        console.log('[CLIP_COUNT]', { wordCount, estimatedVoiceSec, clipCount });
        console.log('[CINEMATIC_STEP1_SCRIPT]', scriptText.length, 'chars', scriptText.substring(0, 80));

        type SeqData = {
          stitched_url?: string; stitch_source?: string; clip_urls?: string[];
          source_images?: string[];
          clips_generated?: number; clip_duration?: number; total_duration?: number;
          error?: string; required?: number; SEQUENCE_ROUTE_VERSION?: string; clipsAttempted?: number;
          successfulClips?: number; failedClips?: number; extractedUrls?: Array<string | null>;
          clipReports?: string[];
          continuity_score?: { character: number; environment: number; object: number; overall: number } | null;
        };

        let enhancedPrompts: string[] = [];
        let sceneTypes: (string | null)[] = [];
        try {
          const splitRes = await fetch('/api/split-script', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ script: scriptText, hook: hookText, num_segments: clipCount, niche, goal }),
          });
          if (splitRes.ok) {
            const { segments } = await splitRes.json() as {
              segments: Array<{ text: string; visual_prompt: string; scene_type?: string | null; provider?: string | null }>
            };
            if (Array.isArray(segments) && segments.length) {
              enhancedPrompts = segments.map(s => s.visual_prompt || hookText || scriptText.substring(0, 200));
              sceneTypes      = segments.map((s: Record<string, unknown>) => (s.type ?? s.scene_type ?? null) as string | null);
              console.log('[cinematic] split-script scene types:', sceneTypes);
            }
          }
        } catch { /* non-fatal */ }

        if (!enhancedPrompts.length) {
          const tagMatches = [...scriptText.matchAll(/\[SCENE:\s*([^\]]+)\]/gi)].map(m => m[1].trim());
          enhancedPrompts = Array.from({ length: clipCount }, (_, i) =>
            tagMatches[i % Math.max(tagMatches.length, 1)] || hookText || scriptText.substring(0, 200)
          );
        }

        // ── Fire-and-forget: submit job → return immediately ─────────────────
        setVideoProgress(50);
        const jobRes = await fetch('/api/cinematic-jobs', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({
            prompts:          enhancedPrompts,
            script:           scriptText || undefined,
            goal:             goal || undefined,
            niche:            niche || undefined,
            voiceId:          selectedVoiceId || undefined,
            characterId:      selectedCharacterId || undefined,
            lightningMode,
            ...(lightningMode && {
              speedMode:          'ultra-draft',
              maxClips:           2,
              targetDurationSecs: 20,
            }),
          }),
        });

        if (jobRes.status === 402) throw new Error('Not enough credits for this video. Upgrade your plan to continue.');
        if (!jobRes.ok) {
          const errData = await jobRes.json().catch(() => ({})) as { error?: string };
          throw new Error(errData.error || `Failed to queue cinematic job (${jobRes.status})`);
        }

        const { jobId } = await jobRes.json() as { jobId: string };
        setCinematicJobId(jobId);
        setVideoProgress(100);
        setIsGeneratingVideo(false);

        // Poll every 10s in background — update UI when done
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
          try {
            const st = await fetch(`/api/cinematic-status?jobId=${jobId}`).then(r => r.json()) as {
              status: string; video_url?: string; error?: string;
            };
            if (st.status === 'complete' && st.video_url) {
              clearInterval(pollRef.current!);
              pollRef.current = null;
              setCinematicJobId(null);
              setVideoUrl(st.video_url);
              setMergedVideoUrl(st.video_url);
              setShowVideoToast(true);
              setTimeout(() => setShowVideoToast(false), 5000);
              setTimeout(() => videoSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
            } else if (st.status === 'failed') {
              clearInterval(pollRef.current!);
              pollRef.current = null;
              setCinematicJobId(null);
              setError(st.error || 'Cinematic generation failed — try again');
            }
          } catch { /* keep polling on network error */ }
        }, 10_000);

      } catch (err) {
        console.error('Cinematic error:', err);
        setError(err instanceof Error ? err.message : 'Cinematic generation failed');
        setIsGeneratingVideo(false);
      }
      return;
    }

    if (type === 'fast') {
      setIsGeneratingVideo(true);
      setVideoProgress(30);
      try {
        const isWatermarked = userTier === 'free';
        const videoDuration = tierLimits.video_seconds;
        console.log('Video generation — image_url:', selectedImage?.substring(0, 80));
        console.log('Video generation — prompt:', v.hook?.substring(0, 120));
        const falRes = await fetch('/api/generate-video-fal', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: v.hook,
            model: 'fast',
            image_url: selectedImage || undefined,
            niche: niche || undefined,
            watermark: isWatermarked,
            duration: videoDuration,
          }),
        });
        const falData = await falRes.json();
        if (!falRes.ok) throw new Error(falData.error || 'fal.ai generation failed');
        if (!falData.video_url) throw new Error('No video URL returned');
        setVideoUrl(falData.video_url);
        setVideoProgress(100);
      } catch (err) {
        console.error('fal.ai error:', err);
        setError('Quick Preview failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
      } finally {
        setIsGeneratingVideo(false);
      }
      return;
    }

    if (type === 'sequence') {
      setIsGeneratingVideo(true);
      setVideoProgress(10);
      try {
        const splitRes = await fetch('/api/split-script', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            script: v.script,
            hook: v.hook,
            num_segments: 4,
            niche,
            style: 'cinematic',
          }),
        });
        if (!splitRes.ok) throw new Error('Script splitting failed');
        const { segments } = await splitRes.json();
        setVideoProgress(20);

        const seqRes = await fetch('/api/generate-video-sequence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompts: segments.map((s: { visual_prompt: string }) => s.visual_prompt),
            image_urls: selectedImage ? [selectedImage] : [],
            clip_length: 15,
            model: 'cinematic',
          }),
        });
        setVideoProgress(80);
        const seqData = await seqRes.json();
        if (!seqRes.ok) throw new Error(seqData.error || 'Sequence generation failed');
        setVideoUrl(seqData.video_url);
        setVideoProgress(100);
      } catch (err) {
        console.error('Sequence error:', err);
        setError('Sequence generation failed: ' + (err instanceof Error ? err.message : 'Unknown error'));
      } finally {
        setIsGeneratingVideo(false);
      }
      return;
    }
  }

  async function handleMergeVideoAudio() {
    if (!videoUrl || !voiceAudioUrl) return;
    setIsMerging(true);
    try {
      let audioBase64: string | undefined;
      let audioUrl: string | undefined;

      if (voiceAudioUrl.startsWith('blob:')) {
        const response = await fetch(voiceAudioUrl);
        const blob = await response.blob();
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        audioBase64 = dataUrl.split(',')[1];
      } else {
        audioUrl = voiceAudioUrl;
      }

      const res = await fetch('/api/merge-video-audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_url: videoUrl, audio_url: audioUrl, audio_base64: audioBase64 }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error || 'Merge failed');
      }

      // Server returns JSON with permanent Supabase URL (or binary blob fallback)
      const contentType = res.headers.get('content-type') ?? '';
      let mergedUrl: string;
      if (contentType.includes('application/json')) {
        const data = await res.json() as { merged_url: string; duration_seconds?: number };
        mergedUrl = data.merged_url;
        console.log('[MERGE] permanent url:', mergedUrl.substring(0, 80), 'duration:', data.duration_seconds);
      } else {
        // Legacy binary fallback
        const blob = await res.blob();
        mergedUrl = URL.createObjectURL(blob);
        console.log('[MERGE] blob url (fallback)');
      }
      setMergedVideoUrl(mergedUrl);

      // Save to library — use merged URL if permanent (Supabase), else original video URL
      const libraryUrl = mergedUrl.startsWith('blob:') ? videoUrl : mergedUrl;
      void fetch('/api/save-render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_url:        libraryUrl,
          audio_url:        voiceAudioUrl?.startsWith('blob:') ? null : voiceAudioUrl,
          script:           generatedScript || briefResponse?.versions[selectedVersion]?.script || null,
          template,
          series_id:        continuationMode?.seriesId        ?? null,
          episode_number:   continuationMode?.episodeNumber   ?? null,
          parent_render_id: continuationMode?.parentRenderId  ?? null,
        }),
      }).then(r => r.json())
        .then(d => console.log('[SAVE_RENDER:merge]', d))
        .catch(e => console.warn('[SAVE_RENDER_ERR:merge]', e));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Combine failed');
    } finally {
      setIsMerging(false);
    }
  }

  async function handleDownload(url: string, filename: string) {
    console.info('[DOWNLOAD_TRIGGERED]', url);
    // Route through server-side proxy so Content-Disposition: attachment is set.
    // This guarantees a Save-As dialog instead of the browser opening the video player.
    const proxyUrl = `/api/download?url=${encodeURIComponent(url)}&filename=${encodeURIComponent(filename)}`;
    try {
      const res = await fetch(proxyUrl);
      if (!res.ok) throw new Error(`proxy ${res.status}`);
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 15_000);
    } catch (proxyErr) {
      console.warn('[DOWNLOAD] proxy failed, falling back to direct fetch:', proxyErr);
      // Fallback: direct blob fetch (works when CORS allows it)
      try {
        const res = await fetch(url, { mode: 'cors', credentials: 'omit' });
        if (!res.ok) throw new Error(`direct ${res.status}`);
        const blob = new Blob([await res.arrayBuffer()], { type: 'video/mp4' });
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(blobUrl), 15_000);
      } catch {
        // Last resort: open in new tab (user can right-click → save)
        window.open(url, '_blank', 'noopener');
      }
    }
  }

  const resetAllState = useCallback(() => {
    // Kill any running poll immediately
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    genStartRef.current = null;
    restoredFromSession.current = false;

    // Block any pending sessionStorage restore setTimeout from re-applying old state
    skipRestoreRef.current = true;

    // Nuke all storage — both sessionStorage and localStorage, all keys
    try { sessionStorage.clear(); } catch { /* quota / private mode */ }
    try { localStorage.removeItem('omnyra-draft'); localStorage.removeItem('omnyra_create_state'); } catch { /* ok */ }
    // One-shot flag: survives the hard refresh and prevents brand pre-fill from
    // re-injecting the old niche/audience on the next mount.
    try { sessionStorage.setItem('omnyra_no_prefill', '1'); } catch { /* ok */ }

    // ── Form inputs ──────────────────────────────────────────────────────────
    setGoal('');
    setNiche('');
    setSelectedPlatforms([]);
    setTargetAudience('');
    setPastWins('');
    setCompetitors('');
    setUniqueAngle('');
    setUploadedFiles([]);

    // ── Submission / loading ─────────────────────────────────────────────────
    setSubmitting(false);
    setLoadingMessageIndex(0);
    setLoadingProgress(0);
    setStreamedText('');
    setError(null);

    // ── Results / brief ──────────────────────────────────────────────────────
    setBriefResponse(null);
    setProjectId(null);
    setSelectedVersion(0);
    setSelectedHookIndex(null);
    setShowInput(true);
    setGeneratingScript(false);
    setGeneratingMore(false);
    setExported(false);

    // ── Script ───────────────────────────────────────────────────────────────
    setGeneratedScript('');
    generatedScriptRef.current = '';
    setScriptId(null);
    setGeneratingShotPlan(false);

    // ── Voice ────────────────────────────────────────────────────────────────
    setIsGeneratingVoice(false);
    setVoiceAudioUrl(null);
    setVoiceDuration(0);
    setVoiceUrl(null);

    // ── Video generation ─────────────────────────────────────────────────────
    setVideoUrl(null);
    setIsGeneratingVideo(false);
    setVideoProgress(0);
    setVideoType(null);
    setPipelineStatusDisplay(null);
    setHedraResuming(false);

    // ── Cinematic pipeline ───────────────────────────────────────────────────
    setClipsReady(false);
    setPendingClipUrls([]);
    setPendingClipDuration(10);
    setPendingScript('');
    setPendingSourceImages([]);
    setSavedReferenceId(null);
    setCinematicJobId(null);

    // ── Avatar ───────────────────────────────────────────────────────────────
    setAvatarJobId(null);
    setAvatarImageUrl(null);
    setAvatarRefVideoUrl(null);
    setSelectedImage(null);

    // ── Character / voice selection ──────────────────────────────────────────
    setSelectedCharacterId('');
    setSelectedVoiceId('');

    // ── Output ───────────────────────────────────────────────────────────────
    setMergedVideoUrl(null);
    setContinuityScore(null);
    setIsMerging(false);

    // ── Progress indicators ──────────────────────────────────────────────────
    setGenStage('');
    setGenMessage('');
    setGenEta(null);

    // ── Modes / flags ────────────────────────────────────────────────────────
    setLightningMode(false);
    setContinuationMode(null);
    setIsLoadingContinuation(false);

    window.scrollTo({ top: 0, behavior: 'smooth' });
    console.info('[NUCLEAR_RESET] All form state and storage cleared');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleContinueStory() {
    setIsLoadingContinuation(true);
    try {
      const res = await fetch('/api/continue-story', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ characterId: selectedCharacterId || undefined }),
      });
      const data = await res.json() as {
        hookOptions:    string[];
        script:         string;
        seriesId:       string;
        episodeNumber:  number;
        parentRenderId: string;
        characterId:    string | null;
        characterName:  string | null;
        parentSummary:  string;
        error?:         string;
      };
      if (!res.ok) {
        setError(data.error ?? 'Failed to load continuation');
        return;
      }
      resetAllState();
      setContinuationMode({
        seriesId:       data.seriesId,
        episodeNumber:  data.episodeNumber,
        characterId:    data.characterId,
        characterName:  data.characterName,
        parentRenderId: data.parentRenderId,
        parentSummary:  data.parentSummary,
      });
      if (data.characterId) setSelectedCharacterId(data.characterId);
      const hook = data.hookOptions?.[0] ?? '';
      setGoal(hook || `Continue the story — Episode ${data.episodeNumber}`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch {
      setError('Failed to load story continuation');
    } finally {
      setIsLoadingContinuation(false);
    }
  }

  // ─── Auth loading ────────────────────────────────────────────────────────

  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span className="pulse-dot" style={{ width: 8, height: 8, borderRadius: "50%", display: "block" }} />
      </div>
    );
  }

  const activeVersion = briefResponse?.versions[selectedVersion] ?? null;

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "transparent", position: "relative" }}>
      <div style={{ position: "relative", zIndex: 1 }}>

        {/* Page title */}
        <div style={{ maxWidth: 672, margin: "0 auto", padding: "20px 24px 0", textAlign: "center" }}>
          <div className="page-title" style={{ fontSize: "1.5rem", fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", background: "linear-gradient(105deg,#CFA42F,#F7D96B)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", marginBottom: "8px" }}>
            {TEMPLATE_TITLES[template] ?? "Create Content"}
          </div>
          {continuationMode && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 6 }}>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "4px 12px", borderRadius: 9999,
                background: "rgba(201,168,76,0.12)", border: "1px solid rgba(201,168,76,0.35)",
                fontSize: 11, fontWeight: 700, color: "#C9A84C", letterSpacing: "0.12em", textTransform: "uppercase",
              }}>
                Episode {continuationMode.episodeNumber}
              </span>
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                padding: "4px 12px", borderRadius: 9999,
                background: "rgba(232,121,249,0.08)", border: "1px solid rgba(232,121,249,0.2)",
                fontSize: 11, fontWeight: 600, color: "#BBA8C8",
              }}>
                ✦ Memory Powered Continuation
              </span>
            </div>
          )}
        </div>

        {/* Memory badge */}
        {memoryCount > 0 && (
          <div style={{ maxWidth: 672, margin: "0 auto", padding: "8px 24px 0" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 14px",
                borderRadius: 9999,
                background: "rgba(232,121,249,0.06)",
                border: "1px solid rgba(232,121,249,0.2)",
                fontSize: 12,
                color: "#BBA8C8",
              }}
            >
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#E879F9",
                  display: "inline-block",
                  animation: "pulseSoft 2.5s ease-in-out infinite",
                }}
              />
              Omnyra remembers your style — {memoryCount} past{" "}
              {memoryCount === 1 ? "project" : "projects"} analyzed
            </span>
          </div>
        )}

        {/* ── STATE 1: INPUT ─────────────────────────────────────────────────── */}
        {showInput && (
          <div style={{ maxWidth: 672, margin: "0 auto", padding: "28px 24px 80px" }}>
            <div className="glass-card" style={{ borderRadius: 24, padding: "clamp(24px, 5vw, 40px)" }}>
              <span style={SECTION_TAG}>New Project</span>
              <h1
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: "clamp(1.6rem, 4vw, 2.1rem)",
                  fontWeight: 700,
                  color: "#C084FC",
                  margin: "0 0 12px",
                  lineHeight: 1.2,
                  textAlign: "center",
                }}
              >
                What should Omnyra create?
              </h1>
              <p style={{ color: "#BBA8C8", fontSize: 14, lineHeight: 1.65, margin: "0 0 30px", textAlign: "center" }}>
                Describe your goal. Omnyra analyzes trends, audience patterns, and your creative
                history to build 3 strategy versions with hooks, viral scores, and predictions.
              </p>

              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                {/* Goal */}
                <div>
                  <label style={LABEL}>What do you want to create?</label>
                  <textarea
                    rows={3}
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                    placeholder="e.g., A viral skincare ad for a new moisturizer launch targeting women 25–34..."
                    style={{ ...INPUT, resize: "vertical" }}
                  />
                </div>

                {/* Platform */}
                <div>
                  <label style={LABEL}>Target Platform{template !== "storytime" ? "s" : ""}</label>
                  {template === "storytime" ? (
                    <div
                      style={{
                        padding: "10px 16px",
                        background: "rgba(75,30,130,0.4)",
                        borderRadius: 10,
                        color: "rgba(255,255,255,0.7)",
                        fontSize: "0.9rem",
                        border: "1px solid rgba(204,171,175,0.15)",
                      }}
                    >
                      🎵 TikTok only — Storytime is optimised exclusively for TikTok format
                    </div>
                  ) : (
                    <PlatformSelector
                      selected={selectedPlatforms}
                      onChange={setSelectedPlatforms}
                    />
                  )}
                </div>

                {/* ── Brand Context Fields ──────────────────────────────── */}
                <BrandContextFields
                  values={{ niche, targetAudience, pastWins, competitors, uniqueAngle }}
                  onChange={(field: string, value: string) => {
                    if (field === "niche") setNiche(value);
                    else if (field === "targetAudience") setTargetAudience(value);
                    else if (field === "pastWins") setPastWins(value);
                    else if (field === "competitors") setCompetitors(value);
                    else if (field === "uniqueAngle") setUniqueAngle(value);
                  }}
                />

                {/* ── Media Upload ───────────────────────────────────────────── */}
                <div>
                  <label style={LABEL}>
                    Media Upload{" "}
                    <span style={{ color: "#8A7D92", fontSize: 12, fontWeight: 400 }}>(optional)</span>
                  </label>
                  <p style={{ fontSize: 11, color: "#8A7D92", margin: "0 0 10px" }}>
                    Used for AI image generation and avatar matching
                  </p>

                  {/* Drop zone */}
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
                        background: dragOver ? "rgba(207,164,47,0.06)" : "rgba(0,0,0,0.2)",
                        transition: "all 0.2s ease",
                      }}
                    >
                      <div style={{ fontSize: 28, marginBottom: 8 }}>📎</div>
                      <p style={{ color: "#BBA8C8", fontSize: 13, margin: "0 0 4px", fontWeight: 500 }}>
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

                  {/* Thumbnails */}
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
                          <img
                            src={f.dataUrl}
                            alt={f.name}
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                          <button
                            onClick={() => removeFile(i)}
                            style={{
                              position: "absolute",
                              top: 3,
                              right: 3,
                              width: 18,
                              height: 18,
                              borderRadius: "50%",
                              background: "rgba(0,0,0,0.75)",
                              border: "none",
                              color: "#fff",
                              fontSize: 10,
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              lineHeight: 1,
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
                            width: 72,
                            height: 72,
                            borderRadius: 10,
                            border: "2px dashed rgba(207,164,47,0.25)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            color: "#8A7D92",
                            fontSize: 22,
                          }}
                        >
                          +
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Error */}
              {error && !submitting && (
                <div
                  style={{
                    marginTop: 20,
                    padding: "12px 16px",
                    borderRadius: 12,
                    background: "rgba(196,122,90,0.08)",
                    border: "1px solid rgba(196,122,90,0.35)",
                  }}
                >
                  <p style={{ color: "#CCABAF", fontSize: 13, margin: 0 }}>⚠ {error}</p>
                </div>
              )}

              {/* Submit */}
              <button
                onClick={handleSubmit}
                disabled={submitting || !goal.trim()}
                className={!submitting && goal.trim() ? "gold-btn" : undefined}
                style={{
                  width: "100%",
                  marginTop: 28,
                  padding: "16px 24px",
                  borderRadius: 9999,
                  border: "none",
                  fontSize: 16,
                  fontWeight: 600,
                  fontFamily: "inherit",
                  cursor: submitting || !goal.trim() ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10,
                  ...(!goal.trim() || submitting
                    ? { background: "rgba(255,255,255,0.06)", color: "#8A7D92" }
                    : {}),
                }}
              >
                {submitting ? (
                  <>
                    <span
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        background: "#D4A843",
                        display: "inline-block",
                        animation: "pulseSoft 1.1s ease-in-out infinite",
                      }}
                    />
                    Omnyra is building 5 versions...
                  </>
                ) : (
                  "Generate 5 Strategy Versions"
                )}
              </button>

              {/* Loading progress */}
              {submitting && (
                <div style={{ marginTop: 20 }}>
                  <div style={{ width: '100%', height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2, marginBottom: 12 }}>
                    <div style={{
                      width: loadingProgress + '%',
                      height: '100%',
                      background: 'linear-gradient(90deg, #C9A84C, #FFD700)',
                      borderRadius: 2,
                      transition: 'width 0.5s ease',
                    }} />
                  </div>
                  <p style={{ textAlign: 'center', fontSize: 13, color: '#F0C040', margin: '0 0 16px', transition: 'all 0.4s ease' }}>
                    {LOADING_MESSAGES[loadingMessageIndex]}
                  </p>
                  {streamedText && (
                    <div style={{
                      background: 'rgba(13,0,16,0.7)',
                      border: '1px solid rgba(201,168,76,0.15)',
                      borderRadius: 10,
                      padding: '14px 16px',
                      fontFamily: 'monospace',
                      fontSize: '0.72rem',
                      color: 'rgba(255,255,255,0.5)',
                      maxHeight: 140,
                      overflow: 'hidden',
                      lineHeight: 1.5,
                      maskImage: 'linear-gradient(to bottom, black 50%, transparent 100%)',
                      WebkitMaskImage: 'linear-gradient(to bottom, black 50%, transparent 100%)',
                    }}>
                      {streamedText.slice(-600)}
                      <span style={{ display: 'inline-block', width: 8, height: 12, background: '#C9A84C', marginLeft: 2, verticalAlign: 'middle', animation: 'omnyraBlinkCursor 1s step-end infinite' }} />
                    </div>
                  )}
                </div>
              )}
              <style>{`@keyframes omnyraBlinkCursor { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
            </div>
          </div>
        )}

        {/* ── STATE 2: RESULTS ───────────────────────────────────────────────── */}
        {!showInput && briefResponse && activeVersion && (
          <div
            style={{
              maxWidth: 896,
              margin: "0 auto",
              padding: "20px 24px 80px",
              animation: "fadeIn 0.45s ease-out",
            }}
          >
            {/* Top bar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
                marginBottom: 20,
                flexWrap: "wrap",
              }}
            >
              <p style={{ color: "#BBA8C8", fontSize: 13, flex: 1, minWidth: 0, margin: 0 }}>
                Brief for:{" "}
                <span style={{ color: "#C084FC" }}>
                  {goal.length > 60 ? goal.slice(0, 60) + "…" : goal}
                </span>
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => setShowInput(true)}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "rgba(255,255,255,0.9)",
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={resetAllState}
                  style={{
                    padding: "6px 14px",
                    borderRadius: 8,
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "rgba(255,255,255,0.9)",
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                  }}
                >
                  New Project
                </button>
              </div>
            </div>

            {/* ── Version tabs ──────────────────────────────────────────────── */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 24,
                flexWrap: "wrap",
              }}
            >
              {briefResponse.versions.map((v, i) => (
                <button
                  key={i}
                  onClick={() => { setSelectedVersion(i); posthog?.capture('version_selected', { template, version_index: i, viral_score: v.viral_score }); }}
                  style={{
                    padding: "9px 22px",
                    borderRadius: 9999,
                    border: selectedVersion === i
                      ? "1px solid rgba(207,164,47,0.65)"
                      : "1px solid rgba(255,255,255,0.1)",
                    background: selectedVersion === i
                      ? "rgba(207,164,47,0.1)"
                      : "rgba(255,255,255,0.04)",
                    color: "rgba(255,255,255,0.95)",
                    fontSize: "1rem",
                    fontWeight: 700,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 10,
                    transition: "all 0.2s",
                    boxShadow: selectedVersion === i ? "0 0 18px rgba(207,164,47,0.15)" : "none",
                  }}
                >
                  Version {v.version}
                  <span
                    style={{
                      fontSize: "0.95rem",
                      background: "rgba(255,215,0,0.15)",
                      border: "1px solid rgba(255,215,0,0.4)",
                      borderRadius: 9999,
                      padding: "1px 8px",
                      color: "#FFD700",
                      fontWeight: 800,
                    }}
                  >
                    {v.viral_score}/100
                  </span>
                </button>
              ))}
              <button
                onClick={handleGenerateMore}
                disabled={generatingMore}
                style={{
                  background: "none",
                  border: "none",
                  color: "rgba(255,255,255,0.85)",
                  fontSize: "0.95rem",
                  fontWeight: 600,
                  cursor: generatingMore ? "wait" : "pointer",
                  fontFamily: "inherit",
                  marginLeft: 4,
                  textDecoration: "underline",
                  textUnderlineOffset: 3,
                  opacity: generatingMore ? 0.4 : 1,
                }}
              >
                {generatingMore ? "Generating..." : "Generate 5 more →"}
              </button>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

              {/* ── Viral Score card ──────────────────────────────────────── */}
              <ViralScore v={activeVersion} />

              {/* ── Hook card ─────────────────────────────────────────────── */}
              <div
                className="glass-card"
                style={{
                  borderRadius: 20,
                  padding: "28px 32px",
                  border: "1px solid rgba(207,164,47,0.45)",
                  boxShadow: "0 0 40px -12px rgba(207,164,47,0.2)",
                }}
              >
                <span
                  style={{
                    ...SECTION_TAG,
                    background: "linear-gradient(105deg, #CFA42F, #F7D96B, #CFA42F)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  {activeVersion.title}
                </span>
                <p style={{ color: "#C084FC", fontSize: 18, fontWeight: 600, lineHeight: 1.5, margin: "0 0 20px" }}>
                  &ldquo;{activeVersion.hook}&rdquo;
                </p>
                <button
                  onClick={() => handleSelectHook(0)}
                  style={selectedHookIndex === 0 ? {
                    padding: "14px 28px",
                    borderRadius: 12,
                    border: "none",
                    background: "linear-gradient(135deg, #C9A84C, #FFD700)",
                    color: "#1a0a2e",
                    fontSize: "1rem",
                    fontWeight: 800,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    width: "100%",
                    marginTop: 16,
                    letterSpacing: "0.03em",
                    boxShadow: "0 4px 20px rgba(201,168,76,0.4)",
                  } : {
                    padding: "14px 28px",
                    borderRadius: 12,
                    border: "none",
                    background: "linear-gradient(135deg, #C9A84C, #FFD700)",
                    color: "#1a0a2e",
                    fontSize: "1rem",
                    fontWeight: 800,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    width: "100%",
                    marginTop: 16,
                    letterSpacing: "0.03em",
                    animation: "goldPulse 2s ease-in-out infinite",
                  }}
                >
                  {selectedHookIndex === 0 ? "✓ Version Selected" : "✦ Select This Version & Create Content →"}
                </button>
              </div>

              {/* ── Script card ───────────────────────────────────────────── */}
              <div className="glass-card" style={{ borderRadius: 20, padding: "28px 32px" }}>
                <span style={SECTION_TAG}>Script</span>
                <p style={{ color: "#BBA8C8", fontSize: 14, lineHeight: 1.8, margin: "0 0 20px", whiteSpace: "pre-wrap" }}>
                  {activeVersion.script}
                </p>
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.07)", paddingTop: 16 }}>
                  <p style={{ fontSize: 11, color: "#8A7D92", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Call to Action
                  </p>
                  <p style={{ color: "#E879F9", fontSize: 14, fontWeight: 600, margin: 0 }}>
                    {activeVersion.cta}
                  </p>
                </div>
              </div>

              {/* ── Generate Full Script — enabled immediately when brief is ready ── */}
              {!generatedScript && (
                <button
                  className={!generatingScript ? "gold-btn" : undefined}
                  onClick={handleGenerateScript}
                  disabled={generatingScript}
                  style={{
                    width: "100%",
                    padding: "14px 24px",
                    fontSize: 15,
                    fontWeight: 600,
                    fontFamily: "inherit",
                    borderRadius: 9999,
                    cursor: generatingScript ? "not-allowed" : "pointer",
                    border: "none",
                    ...(generatingScript
                      ? { background: "rgba(255,255,255,0.06)", color: "#8A7D92" }
                      : {}),
                  }}
                >
                  {generatingScript
                    ? "Generating full script..."
                    : selectedHookIndex !== null
                    ? "Generate Script with Selected Hook →"
                    : "Generate Full Script →"}
                </button>
              )}
              {/* Re-generate after a script is shown */}
              {generatedScript && !generatingScript && (
                <button
                  onClick={() => { setGeneratedScript(""); generatedScriptRef.current = ""; setScriptId(null); }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#8A7D92",
                    fontSize: 12,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    textDecoration: "underline",
                    padding: "4px 0",
                  }}
                >
                  Regenerate script
                </button>
              )}

            </div>

            {/* ── Generated Script section ──────────────────────────────────── */}
            {(generatedScript || generatingScript) && (
              <div
                id="script-preview"
                className="glass-card"
                style={{ borderRadius: 20, padding: "28px 32px", marginTop: 18, border: "1px solid rgba(124,111,255,0.35)" }}
              >
                <span style={{ ...SECTION_TAG, color: "#7c6fff" }}>Generated Script</span>

                <div style={{
                  background: "rgba(255,255,255,0.025)",
                  borderRadius: 10,
                  padding: "18px 20px",
                  marginBottom: 20,
                  minHeight: 80,
                }}>
                  <p style={{
                    color: "#BBA8C8",
                    fontSize: 14,
                    lineHeight: 1.85,
                    margin: 0,
                    whiteSpace: "pre-wrap",
                    fontFamily: "inherit",
                  }}>
                    {generatedScript}
                    {generatingScript && (
                      <span style={{
                        display: "inline-block",
                        width: 8,
                        height: 14,
                        background: "#C084FC",
                        marginLeft: 2,
                        verticalAlign: "middle",
                        animation: "omnyraBlinkCursor 1s step-end infinite",
                      }} />
                    )}
                  </p>
                </div>

                <button
                  onClick={() => {
                    document.getElementById('generate-video-section')?.scrollIntoView({ behavior: 'smooth' })
                  }}
                  className="gold-btn"
                  style={{ padding: '12px 28px' }}
                >
                  Direct this Video →
                </button>
              </div>
            )}

            {/* ── Image generator ───────────────────────────────────────────── */}
            {selectedHookIndex !== null && (
              <ImageGenerator
                concept={activeVersion.script || activeVersion.title || activeVersion.hook}
                template={template}
                niche={niche}
                platforms={selectedPlatforms}
                onImageSelect={setSelectedImage}
              />
            )}

            {/* ── VIDEO SECTION ─────────────────────────────────────────────── */}
            {selectedHookIndex === 0 && (
              <div id="generate-video-section" style={{ background: 'rgba(45,10,62,0.8)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 16, padding: '24px', marginTop: 18 }}>
                <p style={{ color: '#C9A84C', fontWeight: 700, fontSize: '1.1rem', margin: '0 0 6px' }}>🎬 GENERATE VIDEO</p>
                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.85rem', margin: '0 0 20px' }}>Choose how to bring your script to life</p>

                {selectedImage && (
                  <div style={{ background: 'rgba(201,168,76,0.1)', border: '1px solid rgba(201,168,76,0.3)', borderRadius: 10, padding: '10px 16px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={selectedImage} alt="Selected scene" style={{ width: 48, height: 48, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
                    <p style={{ color: 'rgba(255,255,255,0.9)', margin: 0, fontSize: '0.9rem' }}>
                      ✓ Your selected scene image will be used as the video base
                    </p>
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>

                  {/* Quick Preview — Free + all tiers */}
                  <button
                    onClick={() => setVideoType('fast')}
                    style={{
                      padding: 16, borderRadius: 12,
                      border: `2px solid ${videoType === 'fast' ? '#C9A84C' : 'rgba(255,255,255,0.15)'}`,
                      background: videoType === 'fast' ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.05)',
                      color: 'white', cursor: 'pointer', textAlign: 'center',
                      fontFamily: 'inherit', position: 'relative', transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>⚡</div>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>Quick Preview</div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>{tierLimits.video_seconds}s draft · fal.ai</div>
                    <div style={{ fontSize: '0.75rem', color: '#C9A84C', marginTop: 4 }}>10 credits</div>
                    {userTier === 'free' && (
                      <div style={{
                        position: 'absolute', top: 8, right: 8,
                        background: 'rgba(201,168,76,0.3)', borderRadius: 4,
                        padding: '2px 6px', fontSize: '0.65rem', color: '#C9A84C',
                      }}>WATERMARK</div>
                    )}
                  </button>

                  {/* Cinematic — Creator + Studio */}
                  <button
                    onClick={() => ['creator', 'studio'].includes(userTier) ? setVideoType('cinematic') : setShowUpgradeModal(true)}
                    style={{
                      padding: 16, borderRadius: 12,
                      border: `2px solid ${videoType === 'cinematic' ? '#C9A84C' : ['creator', 'studio'].includes(userTier) ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)'}`,
                      background: videoType === 'cinematic' ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.05)',
                      color: ['creator', 'studio'].includes(userTier) ? 'white' : 'rgba(255,255,255,0.35)',
                      cursor: ['creator', 'studio'].includes(userTier) ? 'pointer' : 'not-allowed',
                      textAlign: 'center', fontFamily: 'inherit', position: 'relative', transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>🎬</div>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>Cinematic Scene</div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>30s · Kling Pro</div>
                    <div style={{ fontSize: '0.75rem', color: '#C9A84C', marginTop: 4 }}>40 credits</div>
                    {!['creator', 'studio'].includes(userTier) && (
                      <div style={{
                        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
                        borderRadius: 10, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)',
                      }}>🔒 Creator+</div>
                    )}
                  </button>

                  {/* Avatar — Creator + Studio */}
                  <button
                    onClick={() => ['creator', 'studio'].includes(userTier) ? setVideoType('avatar') : setShowUpgradeModal(true)}
                    style={{
                      padding: 16, borderRadius: 12,
                      border: `2px solid ${videoType === 'avatar' ? '#C9A84C' : ['creator', 'studio'].includes(userTier) ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)'}`,
                      background: videoType === 'avatar' ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.05)',
                      color: ['creator', 'studio'].includes(userTier) ? 'white' : 'rgba(255,255,255,0.35)',
                      cursor: ['creator', 'studio'].includes(userTier) ? 'pointer' : 'not-allowed',
                      textAlign: 'center', fontFamily: 'inherit', position: 'relative', transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>👤</div>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>Avatar Video</div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>Talking head · Avatar</div>
                    <div style={{ fontSize: '0.75rem', color: '#C9A84C', marginTop: 4 }}>40 credits</div>
                    {!['creator', 'studio'].includes(userTier) && (
                      <div style={{
                        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
                        borderRadius: 10, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)',
                      }}>🔒 Creator+</div>
                    )}
                  </button>

                  {/* Full Sequence — Studio only, spans full width */}
                  <button
                    onClick={() => userTier === 'studio' ? setVideoType('sequence') : setShowUpgradeModal(true)}
                    style={{
                      padding: 16, borderRadius: 12, gridColumn: 'span 2',
                      border: `2px solid ${videoType === 'sequence' ? '#C9A84C' : userTier === 'studio' ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.05)'}`,
                      background: videoType === 'sequence' ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.05)',
                      color: userTier === 'studio' ? 'white' : 'rgba(255,255,255,0.35)',
                      cursor: userTier === 'studio' ? 'pointer' : 'not-allowed',
                      textAlign: 'center', fontFamily: 'inherit', position: 'relative', transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>✨</div>
                    <div style={{ fontWeight: 700, marginBottom: 4 }}>Full Sequence</div>
                    <div style={{ fontSize: '0.75rem', opacity: 0.6 }}>4 × 15s stitched = 60s · Studio only</div>
                    <div style={{ fontSize: '0.75rem', color: '#C9A84C', marginTop: 4 }}>40 credits</div>
                    {userTier !== 'studio' && (
                      <div style={{
                        position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
                        borderRadius: 10, display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)',
                      }}>🔒 Studio only — upgrade to unlock</div>
                    )}
                  </button>

                </div>

                {/* Face photo upload — used as Hedra avatar image; takes priority over scene */}
                {videoType === 'avatar' && userId && (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 4px' }}>
                      Face Photo <span style={{ color: '#C9A84C', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(required — your face, not a product image)</span>
                    </p>
                    <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 11, margin: '0 0 8px' }}>
                      Upload this to ensure Hedra animates YOUR face, not a generated scene.
                    </p>
                    <AssetUpload
                      variant="face"
                      userId={userId}
                      onUploaded={(url) => setAvatarImageUrl(url)}
                      initialUrl={avatarImageUrl ?? undefined}
                    />
                    {!avatarImageUrl && selectedImage && (
                      <p style={{ fontSize: 11, color: 'rgba(255,193,7,0.8)', marginTop: 6 }}>
                        ⚠ No face photo uploaded — will use selected scene image instead.
                      </p>
                    )}
                  </div>
                )}

                {/* Avatar reference video upload — shown when avatar type is selected */}
                {videoType === 'avatar' && userId && (
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', margin: '0 0 8px' }}>
                      Reference Video <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional — 5–30s, front-facing)</span>
                    </p>
                    <AssetUpload
                      variant="avatar"
                      userId={userId}
                      onUploaded={handleAvatarVideoUploaded}
                      initialUrl={avatarRefVideoUrl ?? undefined}
                    />
                  </div>
                )}

                {/* Character preset picker — shown for avatar and cinematic modes */}
                {(videoType === 'avatar' || videoType === 'cinematic') && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>
                        Character Preset <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(optional)</span>
                      </p>
                      <a
                        href="/dashboard/characters"
                        target="_blank"
                        rel="noreferrer"
                        style={{ fontSize: 11, color: '#C9A84C', textDecoration: 'none', fontWeight: 600 }}
                      >
                        {characters.length === 0 ? '+ Create character →' : 'Manage →'}
                      </a>
                    </div>
                    {characters.length > 0 ? (
                      <select
                        value={selectedCharacterId}
                        onChange={e => setSelectedCharacterId(e.target.value)}
                        style={{
                          width: '100%',
                          background: 'rgba(0,0,0,0.4)',
                          border: '1px solid rgba(255,255,255,0.2)',
                          borderRadius: 10,
                          color: 'white',
                          padding: '10px 14px',
                          fontSize: '0.9rem',
                          fontFamily: 'inherit',
                          outline: 'none',
                        }}
                      >
                        <option value="">None — use image only</option>
                        {characters.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                    ) : (
                      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', margin: 0, lineHeight: 1.5 }}>
                        No characters yet. Create one to lock a visual identity across all scenes.
                      </p>
                    )}
                  </div>
                )}

                {videoType === 'fast' && !selectedImage && !isGeneratingVideo && (
                  <div style={{
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: 10,
                    padding: '12px 16px',
                    marginBottom: 8,
                    color: '#fca5a5',
                    fontSize: '0.9rem',
                  }}>
                    ⚠ Select a scene image above first — the video is generated from your chosen image
                  </div>
                )}

                {videoType === 'avatar' && !avatarImageUrl && !selectedImage && !isGeneratingVideo && (
                  <div style={{
                    background: 'rgba(239,68,68,0.1)',
                    border: '1px solid rgba(239,68,68,0.3)',
                    borderRadius: 10,
                    padding: '12px 16px',
                    marginBottom: 8,
                    color: '#fca5a5',
                    fontSize: '0.9rem',
                  }}>
                    ⚠ Upload a face photo or select a scene image first — Hedra needs an image to animate
                  </div>
                )}

                {/* ── Phase 2: clips ready — pick voice then compose ──────── */}
                {clipsReady && videoType === 'cinematic' && !isGeneratingVideo && (
                  <div style={{ background: 'rgba(45,10,62,0.9)', border: '1px solid rgba(201,168,76,0.5)', borderRadius: 16, padding: 20, marginBottom: 12 }}>
                    <p style={{ color: '#4ECB8C', fontWeight: 700, margin: '0 0 4px', fontSize: 15 }}>
                      ✓ {pendingClipUrls.length} clips ready
                    </p>
                    <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, margin: '0 0 14px' }}>
                      Pick a voice below then click Add Voiceover &amp; Finish — or skip voice to compose silently.
                    </p>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12 }}>
                      <select
                        value={selectedVoiceId}
                        onChange={e => setSelectedVoiceId(e.target.value)}
                        style={{ flex: 1, background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, color: 'white', padding: '10px 14px', fontSize: '0.95rem', fontFamily: 'inherit', outline: 'none' }}
                      >
                        <option value="">No voice (silent video)</option>
                        {voices.map(v => (
                          <option key={v.voice_id} value={v.voice_id}>
                            {v.name}{v.labels?.gender ? ` · ${v.labels.gender}` : ''}{v.labels?.accent ? ` · ${v.labels.accent}` : ''}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={handlePreviewVoice}
                        disabled={!selectedVoiceId}
                        style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, color: 'white', padding: '10px 14px', cursor: selectedVoiceId ? 'pointer' : 'not-allowed', whiteSpace: 'nowrap', fontFamily: 'inherit', fontSize: '0.9rem' }}
                      >▶ Preview</button>
                    </div>
                    <button
                      onClick={handleComposeWithVoice}
                      className="gold-btn"
                      style={{ width: '100%', padding: '13px 24px', fontSize: 15, fontWeight: 700, fontFamily: 'inherit', borderRadius: 9999, border: 'none', cursor: 'pointer' }}
                    >
                      {selectedVoiceId ? '🎙️ Add Voiceover & Finish →' : '🎬 Compose Silent Video →'}
                    </button>

                    {selectedCharacterId && pendingSourceImages.length > 0 && !savedReferenceId && (
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch(`/api/characters/${selectedCharacterId}/add-reference`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                image_url:    pendingSourceImages[0],
                                source:       'kling_frame',
                                pose_label:   'generated',
                                is_primary:   false,
                                quality_score: 0.8,
                              }),
                            });
                            const d = await res.json();
                            if (d.reference?.id) {
                              setSavedReferenceId(d.reference.id);
                            }
                          } catch { /* non-fatal */ }
                        }}
                        style={{
                          width: '100%', marginTop: 8, padding: '10px 24px',
                          background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.18)',
                          borderRadius: 9999, color: 'rgba(255,255,255,0.75)', fontSize: 13,
                          fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
                        }}
                      >
                        + Save frame as character reference
                      </button>
                    )}
                    {savedReferenceId && (
                      <p style={{ textAlign: 'center', color: '#4ECB8C', fontSize: 13, margin: '8px 0 0', fontWeight: 600 }}>
                        ✓ Frame saved as character reference
                      </p>
                    )}
                  </div>
                )}

                {videoType && !clipsReady && (() => {
                  const avatarMissingImage = videoType === 'avatar' && !avatarImageUrl && !selectedImage;
                  const fastMissingImage   = videoType === 'fast'   && !selectedImage;
                  const avatarMissingVoice = videoType === 'avatar' && !selectedVoiceId;
                  const isBlocked = isGeneratingVideo || avatarMissingImage || fastMissingImage || avatarMissingVoice;
                  return (
                  <>
                    {/* Inline voice selector for avatar mode — must be picked before generating */}
                    {videoType === 'avatar' && (
                      <div style={{ marginBottom: 14, padding: '14px 16px', background: 'rgba(201,168,76,0.08)', border: `1px solid ${selectedVoiceId ? 'rgba(201,168,76,0.4)' : 'rgba(255,80,80,0.5)'}`, borderRadius: 12 }}>
                        <p style={{ color: '#C9A84C', fontWeight: 700, margin: '0 0 8px', fontSize: 13 }}>
                          🎙️ SELECT VOICE {!selectedVoiceId && <span style={{ color: '#FF6B6B', fontWeight: 400 }}>— required</span>}
                        </p>
                        <select
                          value={selectedVoiceId}
                          onChange={e => { console.log('[VOICE_SELECTED]', e.target.value); setSelectedVoiceId(e.target.value); }}
                          style={{ width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 10, color: selectedVoiceId ? 'white' : '#aaa', padding: '10px 14px', fontSize: '0.95rem', fontFamily: 'inherit', outline: 'none' }}
                        >
                          <option value="">Select a voice...</option>
                          {voices.map(v => (
                            <option key={v.voice_id} value={v.voice_id}>
                              {v.name}{v.labels?.gender ? ` · ${v.labels.gender}` : ''}{v.labels?.accent ? ` · ${v.labels.accent}` : ''}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  {/* Lightning Mode toggle — cinematic and avatar only */}
                  {(videoType === 'cinematic' || videoType === 'avatar') && (
                    <button
                      type="button"
                      onClick={() => setLightningMode(prev => !prev)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        width: '100%',
                        padding: '10px 14px',
                        marginBottom: 10,
                        background: lightningMode ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${lightningMode ? 'rgba(201,168,76,0.45)' : 'rgba(255,255,255,0.1)'}`,
                        borderRadius: 10,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        textAlign: 'left',
                        transition: 'border-color 0.2s, background 0.2s',
                      }}
                    >
                      <span style={{ fontSize: 20, lineHeight: 1 }}>⚡</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: lightningMode ? '#C9A84C' : '#8A7D92', fontWeight: 700, fontSize: 13 }}>
                          Lightning Mode {lightningMode ? 'ON' : 'OFF'}
                        </div>
                        <div style={{ color: '#5A5060', fontSize: 11, marginTop: 2 }}>
                          {lightningMode
                            ? '2 clips · 5s each · ~60s total'
                            : videoType === 'avatar' ? 'Normal: full avatar lip-sync' : 'Normal: 3-8 clips · 10s each · 90-180s'}
                        </div>
                      </div>
                      <div style={{
                        flexShrink: 0,
                        width: 36, height: 20, borderRadius: 10,
                        background: lightningMode ? '#C9A84C' : 'rgba(255,255,255,0.1)',
                        position: 'relative', transition: 'background 0.2s',
                      }}>
                        <div style={{
                          position: 'absolute', top: 2,
                          left: lightningMode ? 18 : 2,
                          width: 16, height: 16, borderRadius: '50%',
                          background: 'white', transition: 'left 0.15s',
                        }} />
                      </div>
                    </button>
                  )}
                  <button
                    onClick={() => handleGenerateOutput(videoType)}
                    disabled={isBlocked}
                    className={!isBlocked ? 'gold-btn' : undefined}
                    style={{
                      width: '100%',
                      padding: '13px 24px',
                      fontSize: 15,
                      fontWeight: 700,
                      fontFamily: 'inherit',
                      borderRadius: 9999,
                      border: 'none',
                      cursor: isBlocked ? 'not-allowed' : 'pointer',
                      opacity: (avatarMissingImage || fastMissingImage || avatarMissingVoice) ? 0.5 : 1,
                      ...(isBlocked && { background: 'rgba(255,255,255,0.06)', color: '#8A7D92' }),
                    }}
                  >
                    {isGeneratingVideo
                      ? '🎬 Rendering video...'
                      : videoType === 'avatar' ? (lightningMode ? '⚡ Generate Avatar — Lightning →' : 'Generate Avatar Video →')
                      : videoType === 'cinematic' ? (lightningMode ? '⚡ Generate Clips — Lightning →' : 'Generate Cinematic Clips →')
                      : videoType === 'sequence' ? 'Generate Full Sequence (4 clips) →'
                      : 'Generate Quick Preview →'}
                  </button>
                  </>
                  );
                })()}

                {isGeneratingVideo && (() => {
                  // Stage-step definitions per mode
                  const cinematicSteps = [
                    { label: 'Script',  done: videoProgress > 8  },
                    { label: 'Images',  done: videoProgress > 40 },
                    { label: 'Clips',   done: videoProgress > 87 },
                    { label: 'Voice',   done: videoProgress > 95 },
                    { label: 'Stitch',  done: videoProgress >= 100 },
                  ];
                  const avatarSteps = [
                    { label: 'Prepare', done: videoProgress > 20 },
                    { label: 'Voice',   done: videoProgress > 35 },
                    { label: 'Hedra',   done: videoProgress > 90 },
                    { label: 'Finish',  done: videoProgress >= 100 },
                  ];
                  const steps = videoType === 'cinematic' ? cinematicSteps : videoType === 'avatar' ? avatarSteps : [];
                  // Current active step index
                  const activeIdx = steps.length > 0 ? (steps.findIndex(s => !s.done)) : -1;

                  const etaLabel = genEta && genEta > 0 && videoProgress < 99
                    ? genEta >= 60
                      ? `~${Math.floor(genEta / 60)}m ${Math.round(genEta % 60)}s remaining`
                      : `~${Math.round(genEta)}s remaining`
                    : null;

                  return (
                    <div style={{
                      marginTop: 16,
                      background: 'rgba(10,2,18,0.95)',
                      border: '1px solid rgba(192,132,252,0.2)',
                      borderRadius: 16,
                      padding: '20px 22px',
                    }}>
                      {/* Header */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'white', letterSpacing: '0.01em' }}>
                          {genStage || (hedraResuming ? 'Resuming Hedra...' : 'Rendering...')}
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: videoProgress >= 100 ? '#4ECB8C' : '#C084FC' }}>
                          {videoProgress}%
                        </div>
                      </div>

                      {/* Progress bar */}
                      <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 3, overflow: 'hidden', marginBottom: 12 }}>
                        <div style={{
                          height: '100%',
                          width: `${videoProgress}%`,
                          background: videoProgress >= 100
                            ? 'linear-gradient(90deg,#4ECB8C,#00C896)'
                            : 'linear-gradient(90deg,#7C3AED,#C084FC,#E879F9)',
                          borderRadius: 3,
                          transition: 'width 0.6s cubic-bezier(0.4,0,0.2,1)',
                        }} />
                      </div>

                      {/* Status message */}
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.52)', lineHeight: 1.55, minHeight: 18 }}>
                        {genMessage || (pipelineStatus ? (PIPELINE_STATUS_LABELS[pipelineStatus] ?? pipelineStatus) : '🎬 Rendering video...')}
                      </div>

                      {/* ETA */}
                      {etaLabel && (
                        <div style={{ fontSize: 11, color: '#4ECB8C', fontWeight: 600, marginTop: 4 }}>
                          {etaLabel}
                        </div>
                      )}

                      {/* Step indicators */}
                      {steps.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, marginTop: 16 }}>
                          {steps.map((s, i) => {
                            const isActive = i === activeIdx;
                            const isDone   = s.done;
                            return (
                              <div key={s.label} style={{ display: 'flex', flex: 1, alignItems: 'center' }}>
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 'none', width: 40 }}>
                                  <div style={{
                                    width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
                                    background: isDone ? '#4ECB8C' : isActive ? '#E879F9' : 'rgba(255,255,255,0.14)',
                                    boxShadow: isActive ? '0 0 10px #E879F9' : 'none',
                                    transition: 'all 0.35s ease',
                                  }} />
                                  <span style={{
                                    fontSize: 9, marginTop: 5, fontWeight: isDone || isActive ? 700 : 400,
                                    color: isDone ? '#4ECB8C' : isActive ? '#E879F9' : 'rgba(255,255,255,0.28)',
                                    letterSpacing: '0.03em', textTransform: 'uppercase',
                                  }}>
                                    {s.label}
                                  </span>
                                </div>
                                {i < steps.length - 1 && (
                                  <div style={{
                                    flex: 1, height: 1, marginBottom: 16,
                                    background: isDone ? 'rgba(78,203,140,0.45)' : 'rgba(255,255,255,0.09)',
                                    transition: 'background 0.35s ease',
                                  }} />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ── Inline background-job progress (cinematic / avatar async) ── */}
                {(cinematicJobId || avatarJobId) && !videoUrl && (
                  <div style={{
                    marginTop: 16,
                    background: 'linear-gradient(135deg, rgba(61,7,52,0.7), rgba(18,5,32,0.8))',
                    border: '1px solid rgba(201,168,76,0.4)',
                    borderRadius: 16,
                    padding: '20px 22px',
                    boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                      <div style={{
                        width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                        border: '2.5px solid rgba(201,168,76,0.25)',
                        borderTop: '2.5px solid #C9A84C',
                        animation: 'spin 1s linear infinite',
                      }} />
                      <div>
                        <div style={{ color: 'white', fontWeight: 700, fontSize: 14, lineHeight: 1.3 }}>
                          {cinematicJobId ? '🎬 Cinematic video rendering…' : '🎤 Avatar video rendering…'}
                        </div>
                        <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 3 }}>
                          {cinematicJobId
                            ? (lightningMode ? 'Lightning Mode — ~45 seconds' : 'Cinematic AI — ~2–3 minutes')
                            : 'Hedra lip-sync — ~2–4 minutes'}
                        </div>
                      </div>
                    </div>

                    {/* Step pipeline */}
                    {(() => {
                      const bgSteps = cinematicJobId
                        ? ['Script', 'Images', 'Clips', 'Voice', 'Stitch']
                        : ['Voice', 'Hedra', 'Stitch'];
                      return (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 14 }}>
                          {bgSteps.map((label, i) => (
                            <div key={label} style={{ display: 'flex', flex: 1, alignItems: 'center' }}>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 'none', width: 44 }}>
                                <div style={{
                                  width: 8, height: 8, borderRadius: '50%',
                                  background: i === 0 ? '#C9A84C' : 'rgba(255,255,255,0.13)',
                                  boxShadow: i === 0 ? '0 0 8px #C9A84C' : 'none',
                                  animation: i === 0 ? 'pulseSoft 1.5s ease-in-out infinite' : 'none',
                                }} />
                                <span style={{
                                  fontSize: 9, marginTop: 5, fontWeight: i === 0 ? 700 : 400,
                                  color: i === 0 ? '#C9A84C' : 'rgba(255,255,255,0.28)',
                                  letterSpacing: '0.03em', textTransform: 'uppercase',
                                }}>{label}</span>
                              </div>
                              {i < bgSteps.length - 1 && (
                                <div style={{ flex: 1, height: 1, marginBottom: 16, background: 'rgba(255,255,255,0.08)' }} />
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })()}

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: 0 }}>
                        Video will appear here automatically when ready.
                      </p>
                      <a
                        href="/videos"
                        style={{ color: '#C9A84C', fontWeight: 700, fontSize: 12, textDecoration: 'none', whiteSpace: 'nowrap', marginLeft: 12 }}
                      >
                        My Videos →
                      </a>
                    </div>
                  </div>
                )}

                {videoUrl && (
                  <div ref={videoSectionRef} style={{ marginTop: 20 }}>
                    <p style={{ color: '#4ECB8C', marginBottom: 8, fontWeight: 600 }}>✓ Video ready</p>
                    <video controls src={videoUrl} style={{ maxWidth: 360, borderRadius: 12, border: '2px solid #C9A84C', width: '100%' }} />
                    <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                      <button onClick={() => handleDownload(videoUrl!, `omnyra-video-${Date.now()}.mp4`)} className="gold-btn" style={{ padding: '9px 20px', borderRadius: 9999, border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                        Download Video
                      </button>
                      <button
                        onClick={() => router.push('/videos')}
                        style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 10, color: 'white', padding: '9px 20px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 }}
                      >
                        View in Library
                      </button>
                    </div>

                    {continuityScore && (
                      <div style={{ marginTop: 16, background: 'rgba(124,111,255,0.06)', border: '1px solid rgba(124,111,255,0.25)', borderRadius: 12, padding: '16px 18px' }}>
                        <p style={{ fontSize: 11, color: '#7c6fff', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', margin: '0 0 12px' }}>
                          Visual Continuity
                        </p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
                          {([
                            ['Character', continuityScore.character],
                            ['Environment', continuityScore.environment],
                            ['Objects', continuityScore.object],
                            ['Overall', continuityScore.overall],
                          ] as [string, number][]).map(([label, val]) => (
                            <div key={label}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                                <span style={{ fontSize: 11, color: '#8A7D92' }}>{label}</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: val >= 90 ? '#4ECB8C' : val >= 70 ? '#F0C040' : '#FF6B6B' }}>{val}%</span>
                              </div>
                              <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2 }}>
                                <div style={{ width: `${val}%`, height: '100%', borderRadius: 2, background: val >= 90 ? '#4ECB8C' : val >= 70 ? '#F0C040' : '#FF6B6B', transition: 'width 0.6s ease' }} />
                              </div>
                            </div>
                          ))}
                        </div>
                        {continuityScore.overall < 90 && (
                          <p style={{ fontSize: 11, color: '#8A7D92', margin: '10px 0 0', lineHeight: 1.5 }}>
                            Tip: Upload a consistent character image to improve continuity across scenes.
                          </p>
                        )}
                      </div>
                    )}

                    {/* ── Creator Intelligence Card ─────────────────────── */}
                    {(() => {
                      const cv = briefResponse?.versions[selectedVersion];
                      if (!cv) return null;
                      const score = cv.viral_score ?? 0;
                      const scoreColor = score >= 80 ? '#4ECB8C' : score >= 60 ? '#F0C040' : '#FF6B6B';
                      const tips = [
                        score >= 75
                          ? 'High-performing hook detected — post within 30 min of peak traffic for best reach.'
                          : 'Boost performance: start with a bold question or unexpected statement in the first 2s.',
                        videoType === 'avatar'
                          ? 'Avatar video tip: keep clips under 60s and add captions for silent viewers (+40% retention).'
                          : 'Cinematic tip: the first scene sets the mood — ensure your opening shot is your strongest visual.',
                        cv.best_post_time
                          ? `Optimal posting window: ${cv.best_post_time} — schedule now to hit peak audience.`
                          : 'Schedule consistently: posting 3–5×/week in the same time window builds algorithm momentum.',
                      ];
                      return (
                        <div style={{ marginTop: 14, background: 'rgba(14,4,26,0.97)', border: '1px solid rgba(192,132,252,0.22)', borderRadius: 14, padding: '16px 18px' }}>
                          <p style={{ fontSize: 11, color: '#C084FC', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.15em', margin: '0 0 12px' }}>
                            Creator Intelligence
                          </p>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', marginBottom: 14 }}>
                            {[
                              ['Viral Score', `${score}/100`, scoreColor],
                              ['Hook Strength', cv.hook_strength ?? '—', score >= 80 ? '#4ECB8C' : '#C084FC'],
                              ['Est. Reach', cv.estimated_reach ?? '—', '#E879F9'],
                              ['Best Post Time', cv.best_post_time ?? '—', '#C084FC'],
                            ].map(([label, val, color]) => (
                              <div key={label as string}>
                                <p style={{ fontSize: 10, color: '#6B5B7B', margin: '0 0 2px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{label}</p>
                                <p style={{ fontSize: 13, fontWeight: 700, color: color as string, margin: 0 }}>{val}</p>
                              </div>
                            ))}
                          </div>
                          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 12 }}>
                            <p style={{ fontSize: 10, color: '#6B5B7B', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Next moves</p>
                            {tips.map((tip, i) => (
                              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, alignItems: 'flex-start' }}>
                                <span style={{ color: '#C084FC', fontSize: 12, marginTop: 1, flexShrink: 0 }}>›</span>
                                <p style={{ fontSize: 12, color: '#BBA8C8', margin: 0, lineHeight: 1.5 }}>{tip}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}

            {/* ── VOICE section — standalone voiceover generator ─────────────
                 Hidden for avatar (has its own inline voice picker above the
                 generate button). Hidden for cinematic until clips are ready
                 (Phase 2 handles voice+compose; showing it early causes users
                 to generate a short voiceover before clips exist). */}
            {selectedHookIndex === 0
              && videoType !== 'avatar'
              && (videoType !== 'cinematic' || clipsReady || !!videoUrl)
              && (
              <div style={{
                background: 'rgba(45,10,62,0.8)',
                border: '1px solid rgba(201,168,76,0.3)',
                borderRadius: '16px',
                padding: '20px',
                marginTop: 18,
              }}>
                <p style={{ color: '#C9A84C', fontWeight: 700, margin: '0 0 12px', fontSize: 15 }}>
                  🎙️ SELECT VOICE
                </p>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <select
                    value={selectedVoiceId}
                    onChange={e => setSelectedVoiceId(e.target.value)}
                    style={{
                      flex: 1,
                      background: 'rgba(0,0,0,0.4)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '10px',
                      color: 'white',
                      padding: '10px 14px',
                      fontSize: '0.95rem',
                      fontFamily: 'inherit',
                      outline: 'none',
                    }}
                  >
                    <option value="">Select a voice...</option>
                    {voices.map(v => (
                      <option key={v.voice_id} value={v.voice_id}>
                        {v.name}{v.labels?.gender ? ` · ${v.labels.gender}` : ''}{v.labels?.accent ? ` · ${v.labels.accent}` : ''}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={handlePreviewVoice}
                    disabled={!selectedVoiceId}
                    style={{
                      background: 'rgba(255,255,255,0.1)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '10px',
                      color: 'white',
                      padding: '10px 16px',
                      cursor: selectedVoiceId ? 'pointer' : 'not-allowed',
                      whiteSpace: 'nowrap',
                      fontFamily: 'inherit',
                      fontSize: '0.9rem',
                    }}
                  >▶ Preview</button>
                </div>
                <button
                  onClick={handleGenerateVoice}
                  disabled={!selectedVoiceId || isGeneratingVoice}
                  className={selectedVoiceId && !isGeneratingVoice ? 'gold-btn' : undefined}
                  style={{
                    width: '100%',
                    marginTop: '12px',
                    padding: '12px',
                    borderRadius: 9999,
                    border: 'none',
                    fontFamily: 'inherit',
                    fontSize: 14,
                    fontWeight: 700,
                    cursor: !selectedVoiceId || isGeneratingVoice ? 'not-allowed' : 'pointer',
                    ...(!selectedVoiceId || isGeneratingVoice ? { background: 'rgba(255,255,255,0.06)', color: '#8A7D92' } : {}),
                  }}
                >
                  {isGeneratingVoice ? '🎙️ Generating voiceover...' : '🎙️ Generate Voiceover →'}
                </button>
                {voiceAudioUrl && (
                  <div style={{ marginTop: '12px' }}>
                    <audio controls src={voiceAudioUrl} style={{ width: '100%', borderRadius: 10 }} />
                    <a
                      href={voiceAudioUrl}
                      download="omnyra-voice.mp3"
                      style={{ display: 'block', textAlign: 'center', marginTop: '8px', color: '#C9A84C', fontSize: '0.85rem', textDecoration: 'none' }}
                    >Download MP3</a>
                  </div>
                )}
              </div>
            )}

            {/* ── WAITING STATE: both ready but not merged yet ─────────────── */}
            {videoUrl && voiceAudioUrl && !mergedVideoUrl && !isMerging && (
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <button
                  onClick={handleMergeVideoAudio}
                  className="gold-btn"
                  style={{ padding: '14px 28px', fontSize: '1rem', border: 'none', borderRadius: 9999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}
                >
                  🎬 Combine Video + Voiceover →
                </button>
              </div>
            )}

            {/* ── WHAT TO DO NEXT — only after merge ───────────────────────── */}
            {mergedVideoUrl && (
              <div style={{
                background: 'rgba(201,168,76,0.1)',
                border: '2px solid rgba(201,168,76,0.4)',
                borderRadius: '16px',
                padding: '28px',
                marginTop: 18,
                textAlign: 'center',
              }}>
                <p style={{ color: '#FFD700', fontWeight: 800, fontSize: '1.2rem', marginBottom: '8px' }}>
                  ✦ YOUR CONTENT IS READY
                </p>
                <p style={{ color: 'rgba(255,255,255,0.8)', marginBottom: '24px', fontSize: '0.95rem' }}>
                  Here&apos;s what you can do with it right now:
                </p>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '480px', margin: '0 auto' }}>

                  {/* Merged state */}
                  {mergedVideoUrl && (
                    <>
                      <p style={{ color: '#4ade80', fontWeight: 700, margin: 0 }}>✓ Final video with voiceover ready!</p>
                      <video controls src={mergedVideoUrl} style={{ width: '100%', maxWidth: '360px', borderRadius: '12px', border: '2px solid #C9A84C' }} />
                      <button onClick={() => handleDownload(mergedVideoUrl!, `omnyra-final-${Date.now()}.mp4`)} className="gold-btn" style={{ padding: '14px', fontSize: '1rem', display: 'block', width: '100%', border: 'none', borderRadius: 9999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, textAlign: 'center' }}>
                        ⬇ Download Final Video (with voiceover)
                      </button>
                    </>
                  )}

                  {/* Merging in progress */}
                  {isMerging && !mergedVideoUrl && (
                    <div style={{ padding: '14px', background: 'rgba(255,255,255,0.06)', borderRadius: 12, color: '#8A7D92', textAlign: 'center' }}>
                      ⏳ Combining video + voice — about 30 seconds...
                    </div>
                  )}

                  {/* Individual downloads — shown when not yet merged */}
                  {!mergedVideoUrl && !isMerging && (
                    <>
                      {videoUrl && (
                        <button onClick={() => handleDownload(videoUrl!, `omnyra-video-${Date.now()}.mp4`)} className="gold-btn" style={{ padding: '14px', fontSize: '1rem', display: 'block', width: '100%', border: 'none', borderRadius: 9999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, textAlign: 'center' }}>
                          ⬇ Download Video {voiceAudioUrl ? '(silent)' : ''}
                        </button>
                      )}
                      {voiceAudioUrl && (
                        <button onClick={() => handleDownload(voiceAudioUrl!, `omnyra-voice-${Date.now()}.mp3`)} style={{ padding: '14px', fontSize: '1rem', display: 'block', width: '100%', textAlign: 'center', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 9999, color: 'white', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
                          ⬇ Download Voiceover MP3
                        </button>
                      )}
                      {videoUrl && voiceAudioUrl && (
                        <button
                          onClick={handleMergeVideoAudio}
                          className="gold-btn"
                          style={{ padding: '14px', fontSize: '1rem', width: '100%', border: 'none', borderRadius: 9999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}
                        >
                          🎬 Combine Video + Voiceover →
                        </button>
                      )}
                    </>
                  )}

                  {generatedScript && (
                    <button onClick={() => navigator.clipboard.writeText(
                      generatedScript.replace(/\*\*(.*?)\*\*/g, '$1').replace(/\[.*?\]/g, '')
                    )} style={{
                      background: 'rgba(255,255,255,0.08)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      borderRadius: '10px',
                      color: 'white',
                      padding: '14px',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      fontWeight: 600,
                      fontFamily: 'inherit',
                    }}>
                      📋 Copy Clean Script
                    </button>
                  )}

                  <div style={{
                    background: 'rgba(255,255,255,0.05)',
                    borderRadius: '10px',
                    padding: '16px',
                    marginTop: '8px',
                  }}>
                    <p style={{ color: 'rgba(255,255,255,0.9)', fontWeight: 700, marginBottom: '8px' }}>
                      📱 How to post this:
                    </p>
                    <ol style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'left', paddingLeft: '20px', lineHeight: '1.8', margin: 0 }}>
                      <li>Download the video</li>
                      <li>Open TikTok → + → Upload</li>
                      <li>Add the voiceover as audio if posting silent b-roll</li>
                      <li>Copy the script to use as your caption or for recording</li>
                      <li>Post between {activeVersion.best_post_time || '7pm–9pm'}</li>
                    </ol>
                  </div>

                  <button onClick={() => router.push('/videos')} style={{
                    background: 'none',
                    border: '1px solid rgba(255,255,255,0.2)',
                    borderRadius: '10px',
                    color: 'rgba(255,255,255,0.7)',
                    padding: '12px',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}>
                    View in My Library →
                  </button>

                  <button onClick={resetAllState} style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255,255,255,0.4)',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    fontFamily: 'inherit',
                  }}>
                    Start a new project ↺
                  </button>

                </div>
              </div>
            )}

            {/* ── Continue This Story — shows whenever any video is complete ── */}
            {videoUrl && !isGeneratingVideo && (
              <div style={{ marginTop: 18, textAlign: 'center' }}>
                <button
                  onClick={handleContinueStory}
                  disabled={isLoadingContinuation}
                  style={{
                    width: '100%',
                    padding: '16px 20px',
                    background: isLoadingContinuation
                      ? 'rgba(201,168,76,0.06)'
                      : 'linear-gradient(135deg, rgba(201,168,76,0.2) 0%, rgba(201,168,76,0.06) 100%)',
                    border: '2px solid rgba(201,168,76,0.5)',
                    borderRadius: '14px',
                    color: isLoadingContinuation ? 'rgba(201,168,76,0.45)' : '#FFD700',
                    fontSize: '1.05rem',
                    fontWeight: 800,
                    fontFamily: 'inherit',
                    cursor: isLoadingContinuation ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 10,
                    letterSpacing: '0.02em',
                  }}
                >
                  {isLoadingContinuation ? (
                    <>
                      <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#C9A84C', display: 'inline-block', animation: 'pulseSoft 1.2s ease-in-out infinite' }} />
                      Loading memory...
                    </>
                  ) : (
                    <>✦ Continue This Story</>
                  )}
                </button>
                {!isLoadingContinuation && (
                  <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.8rem', margin: '8px 0 0' }}>
                    Uses your character &amp; brand memory to write the next episode
                  </p>
                )}
              </div>
            )}

            {/* ── Upgrade modal ────────────────────────────────────────────── */}
            {showUpgradeModal && (
              <div
                onClick={() => setShowUpgradeModal(false)}
                style={{
                  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
                  zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  padding: 24,
                }}
              >
                <div
                  onClick={e => e.stopPropagation()}
                  style={{
                    background: 'rgba(20,5,35,0.98)', border: '1px solid rgba(201,168,76,0.4)',
                    borderRadius: 20, padding: '36px 32px', maxWidth: 440, width: '100%', textAlign: 'center',
                  }}
                >
                  <p style={{ fontSize: '2rem', marginBottom: 12 }}>🔒</p>
                  <p style={{ color: '#FFD700', fontWeight: 800, fontSize: '1.2rem', marginBottom: 8 }}>
                    Upgrade to unlock this
                  </p>
                  <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.95rem', marginBottom: 24, lineHeight: 1.6 }}>
                    Cinematic and avatar video generation require Creator or Studio plan.
                    Full Sequence (60s) is Studio only.
                  </p>
                  <button
                    onClick={() => router.push('/dashboard/credits')}
                    className="gold-btn"
                    style={{ width: '100%', padding: '14px', fontSize: '1rem', border: 'none', borderRadius: 9999, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}
                  >
                    View Plans →
                  </button>
                  <button
                    onClick={() => setShowUpgradeModal(false)}
                    style={{
                      marginTop: 12, background: 'none', border: 'none',
                      color: 'rgba(255,255,255,0.4)', cursor: 'pointer',
                      fontSize: '0.85rem', fontFamily: 'inherit',
                    }}
                  >
                    Maybe later
                  </button>
                </div>
              </div>
            )}

            {/* ── Action buttons ────────────────────────────────────────────── */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 12,
                marginTop: 32,
              }}
            >
              <button
                className="btn-ghost"
                onClick={handleExport}
                style={{
                  padding: "11px 32px",
                  borderRadius: 9999,
                  fontSize: 14,
                  fontWeight: 500,
                  fontFamily: "inherit",
                  cursor: "pointer",
                  background: "transparent",
                }}
              >
                {exported ? "✓ Copied to clipboard" : "Export Brief"}
              </button>
              <button
                onClick={resetAllState}
                style={{
                  background: "none",
                  border: "none",
                  color: "#8A7D92",
                  fontSize: 13,
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Start Over
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Success toast (fires when poll completes) ─────────────────────── */}
      {showVideoToast && (
        <div style={{
          position: 'fixed', top: 24, right: 24, zIndex: 99999,
          background: 'linear-gradient(135deg, rgba(8,32,16,0.98), rgba(5,22,12,0.98))',
          border: '1.5px solid rgba(78,203,140,0.65)',
          borderRadius: 14, padding: '14px 20px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 24px rgba(78,203,140,0.12)',
          display: 'flex', alignItems: 'center', gap: 12,
          maxWidth: 320,
          animation: 'slideInRight 0.3s ease-out',
        }}>
          <div style={{ fontSize: 26, lineHeight: 1 }}>🎉</div>
          <div>
            <div style={{ color: '#4ECB8C', fontWeight: 800, fontSize: 14 }}>Video ready!</div>
            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 2 }}>
              Scroll down to preview and download.
            </div>
          </div>
        </div>
      )}

      {/* ── Floating corner spinner (secondary indicator while async job runs) */}
      {(cinematicJobId || avatarJobId) && !showVideoToast && (
        <div style={{
          position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
          background: 'rgba(20,5,35,0.9)',
          border: '1px solid rgba(201,168,76,0.4)',
          borderRadius: 12, padding: '10px 16px',
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        }}>
          <div style={{
            width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
            border: '2px solid rgba(201,168,76,0.25)',
            borderTop: '2px solid #C9A84C',
            animation: 'spin 1s linear infinite',
          }} />
          <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 600 }}>
            {cinematicJobId ? 'Rendering cinematic…' : 'Rendering avatar…'}
          </span>
        </div>
      )}

    </div>
  );
}

export default function CreatePage() {
  return (
    <Suspense>
      <CreatePageInner />
    </Suspense>
  );
}
