'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

interface VersionResult {
  title: string;
  hook: string;
  script: string;
  cta: string;
  viral_score: number;
  hook_strength: string;
  best_post_time: string;
  estimated_reach: string;
}

interface Concept {
  title: string;
  description: string;
  ghostScore: number;
  imageUrl: string;
}

interface Props {
  toolId: string;
  toolName: string;
  modelOverride?: string;
  scriptOnly?: boolean;
  nichePrefill?: string;
}

interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  preview_url: string;
  labels?: { accent?: string; description?: string; use_case?: string; gender?: string; age?: string; };
}

type VideoType = 'quick' | 'cinematic' | 'avatar';

const VIDEO_TYPES: Array<{ id: VideoType; label: string; desc: string; duration: string; cr: number; badge: string }> = [
  { id: 'quick',     label: '10s Draft',       desc: 'fal.ai fast gen',    duration: '10s',  cr: 10, badge: '⚡' },
  { id: 'cinematic', label: 'Cinematic Scene',  desc: 'Kling Pro',          duration: '30s',  cr: 40, badge: '🎬' },
  { id: 'avatar',    label: 'Avatar Video',     desc: 'Hedra talking head', duration: '~30s', cr: 40, badge: '👤' },
];

const GoldDivider = () => (
  <div style={{ margin: '48px 0', display: 'flex', alignItems: 'center', gap: 16 }}>
    <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, rgba(212,168,67,0.4))' }} />
    <div style={{ color: 'rgba(212,168,67,0.5)', fontSize: '0.6rem', letterSpacing: '0.2em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>✦</div>
    <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, rgba(212,168,67,0.4), transparent)' }} />
  </div>
);

export default function GenerationFlow({ toolId, toolName, modelOverride, scriptOnly, nichePrefill }: Props) {
  const [prompt,         setPrompt]         = useState('');
  const [niche,          setNiche]          = useState('');
  const [platform,       setPlatform]       = useState('TikTok');
  const [targetAudience, setTargetAudience] = useState('');
  const [pastWins,       setPastWins]       = useState('');
  const [competitors,    setCompetitors]    = useState('');
  const [uniqueAngle,    setUniqueAngle]    = useState('');
  const [mediaFile,      setMediaFile]      = useState<File | null>(null);
  const [lightningMode,  setLightningMode]  = useState(false);
  const [loadingState,   setLoadingState]   = useState('');

  const [scripts,        setScripts]        = useState<VersionResult[]>([]);
  const [selectedScript, setSelectedScript] = useState<VersionResult | null>(null);
  const [scriptError,    setScriptError]    = useState('');
  const [editingScript,  setEditingScript]  = useState(false);
  const [editedScript,   setEditedScript]   = useState('');

  const [concepts,        setConcepts]        = useState<Concept[]>([]);
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(null);
  const [regenerating,    setRegenerating]    = useState(false);
  const [visualStyle,     setVisualStyle]     = useState('Lifestyle');
  const [aspectRatio,     setAspectRatio]     = useState('9:16');
  const [quality,         setQuality]         = useState('fast');
  const [imagesGenerated, setImagesGenerated] = useState(false);
  const [imagePrompt,    setImagePrompt]    = useState('');
  const [showImagePrompt, setShowImagePrompt] = useState(false);

  const [videoType,     setVideoType]     = useState<VideoType>('cinematic');
  const [videoUrl,      setVideoUrl]      = useState<string | null>(null);
  const [clipUrls,      setClipUrls]      = useState<string[]>([]);
  const [videoStatus,   setVideoStatus]   = useState('');
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoStarted,  setVideoStarted]  = useState(false);
  const [videoModel,    setVideoModel]    = useState<string | null>(null);
  const [selectedVoice, setSelectedVoice] = useState('');
  const [favorites,     setFavorites]     = useState<string[]>([]);
  const [stitching,     setStitching]     = useState(false);
  const [finalVideo,    setFinalVideo]    = useState<string | null>(null);

  const [voices,          setVoices]          = useState<ElevenLabsVoice[]>([]);
  const [voicesLoading,   setVoicesLoading]   = useState(false);
  const [voiceSearch,     setVoiceSearch]     = useState('');
  const [voiceDropOpen,   setVoiceDropOpen]   = useState(false);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);

  // Separate voice generation state
  const [voiceAudioBase64, setVoiceAudioBase64] = useState<string | null>(null);
  const [voiceGenerating,  setVoiceGenerating]  = useState(false);
  const [voiceReady,       setVoiceReady]       = useState(false);
  const [combining,        setCombining]        = useState(false);

  const pollRef           = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef      = useRef<HTMLInputElement>(null);
  const audioRef          = useRef<HTMLAudioElement | null>(null);
  const voiceDropRef      = useRef<HTMLDivElement>(null);
  const scriptsSectionRef = useRef<HTMLDivElement>(null);
  const visualsSectionRef = useRef<HTMLDivElement>(null);
  const voiceSectionRef   = useRef<HTMLDivElement>(null);
  const finalVideoRef     = useRef<HTMLDivElement>(null);
  const prevScriptsLen    = useRef(0);
  const prevConcept       = useRef<Concept | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('omnyra_voice_favorites');
      if (stored) setFavorites(JSON.parse(stored));
    } catch {}
  }, []);

  useEffect(() => {
    setVoicesLoading(true);
    fetch('/api/voices')
      .then(r => r.json())
      .then(d => {
        const vs = (d.voices ?? []) as ElevenLabsVoice[];
        setVoices(vs);
        if (vs.length > 0 && !selectedVoice) setSelectedVoice(vs[0].voice_id);
      })
      .catch(() => {})
      .finally(() => setVoicesLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (voiceDropRef.current && !voiceDropRef.current.contains(e.target as Node)) {
        setVoiceDropOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
  }, []);

  useEffect(() => {
    if (scripts.length > 0 && prevScriptsLen.current === 0) {
      setTimeout(() => scriptsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    }
    prevScriptsLen.current = scripts.length;
  }, [scripts.length]);

  useEffect(() => {
    if (selectedConcept && !prevConcept.current) {
      setTimeout(() => voiceSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
    }
    prevConcept.current = selectedConcept;
  }, [selectedConcept]);

  // Auto-populate imagePrompt with a visual scene brief when script is selected
  useEffect(() => {
    if (!selectedScript) return;
    const rawScript = editedScript || selectedScript.script || '';
    const hook = selectedScript.hook || '';

    // Extract [SCENE: ...] stage directions as visual cues
    const sceneMatches = rawScript.match(/\[SCENE:[^\]]+\]/gi) ?? [];
    const sceneLines = sceneMatches
      .map(s => s.replace(/^\[SCENE:\s*/i, '').replace(/\]$/, '').trim())
      .filter(Boolean);

    // Identify setting/era from first scene or hook
    const settingHint = sceneLines[0] || hook;

    // Build a visual brief — character + camera + lighting, NOT the script dialogue
    let brief = '';
    if (sceneLines.length > 0) {
      brief = sceneLines.map((s, i) => {
        const angle = i === 0 ? 'Wide establishing shot' : i === sceneLines.length - 1 ? 'Close-up detail shot' : 'Medium shot';
        return `Scene ${i + 1}: ${s}. ${angle}, cinematic lighting, sharp focus.`;
      }).join('\n\n');
    } else {
      // No scene directions — build from hook + setting keywords
      brief = `Visual brief for: ${settingHint}\n\nScene 1: Establish the setting — wide shot, natural ambient light, real environment.\nScene 2: Mid shot showing subject in action, authentic movement, warm cinematic colour grade.\nScene 3: Close detail — key prop, expression, or texture that carries emotional weight.\nScene 4: Resolution beat — pull back slightly, subject at peace or in motion, golden hour.`;
    }

    setImagePrompt(brief);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedScript?.script]);

  // Auto-scroll to final video when it's ready + save to My Videos (client-side backup)
  useEffect(() => {
    if (!finalVideo) return;
    setTimeout(() => finalVideoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 200);
    // Fire-and-forget save to My Videos library (server already does this in compose-video,
    // but we do it here too as a client-side safety net in case the server path was skipped)
    (async () => {
      try {
        await fetch('/api/save-render', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ video_url: finalVideo, template: toolId }),
        });
      } catch { /* non-fatal */ }
    })();
  }, [finalVideo]);

  const toggleFavorite = (id: string) => {
    setFavorites(prev => {
      const next = prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id];
      try { localStorage.setItem('omnyra_voice_favorites', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const playPreview = (url: string, voiceId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      if (previewingVoice === voiceId) { setPreviewingVoice(null); return; }
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    setPreviewingVoice(voiceId);
    audio.play().catch(() => {});
    audio.onended = () => { setPreviewingVoice(null); audioRef.current = null; };
  };

  const handleGenerateScript = async () => {
    if (!prompt.trim()) return;
    setLoadingState('Writing your scripts…');
    setScriptError('');
    setEditingScript(false);
    setEditedScript('');

    try {
      const res = await fetch('/api/generate-brief-sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: nichePrefill ? `${nichePrefill}\n\n${prompt}` : prompt,
          toolId,
          niche: niche || toolId,
          platform,
          targetAudience,
          pastWins,
          competitors,
          uniqueAngle,
          lightningMode,
        }),
      });
      const data = await res.json();
      const versions = (data.versions ?? []) as VersionResult[];
      if (!res.ok || data.error || versions.length === 0) {
        setScriptError(data.error ?? 'Script generation failed — check your API key or try again.');
        setLoadingState('');
        return;
      }
      setScriptError('');
      setScripts(versions);
      setSelectedScript(versions[0]);
    } catch {
      setScriptError('Network error — please try again.');
    }
    setLoadingState('');
  };

  const handleGenerateScenes = async () => {
    if (!selectedScript) return;
    setLoadingState('Generating your scenes…');
    try {
      const res = await fetch('/api/generate-concepts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: imagePrompt || `${selectedScript.hook}\n\n${editedScript || selectedScript.script}`,
          toolId,
          nichePrefill: nichePrefill ?? '',
          lightningMode,
          visualStyle,
          aspectRatio,
          quality,
        }),
      });
      const data = await res.json();
      setConcepts(data.concepts ?? []);
      setSelectedConcept(null);
      setImagesGenerated(true);
    } catch {}
    setLoadingState('');
  };

  const handleRegenerateImages = async () => {
    setConcepts([]);
    setSelectedConcept(null);
    await handleGenerateScenes();
  };

  const startVideoGeneration = async () => {
    if (!selectedConcept) return;
    setVideoStarted(true);
    setVideoStatus('Queued');
    setVideoProgress(5);
    setVideoUrl(null);
    setClipUrls([]);
    setFinalVideo(null);

    try {
      if (videoType === 'avatar') {
        // Avatar: single clip → Hedra lipsync
        const scriptText = editedScript || selectedScript?.script || selectedConcept.description;
        const scriptWordCount = scriptText.trim().split(/\s+/).filter(Boolean).length;
        if (scriptWordCount < 20) {
          setVideoStatus('Please generate a script first — the concept description is too short for avatar video (need 20+ words)');
          setVideoStarted(false);
          return;
        }
        const res = await fetch('/api/generate-avatar', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            script:           scriptText,
            voice_id:         selectedVoice || voices[0]?.voice_id || '',
            background_image: selectedConcept.imageUrl,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setVideoStatus('Error — ' + (data.error ?? `HTTP ${res.status}`));
          setVideoStarted(false);
          return;
        }
        if (data.status === 'completed' && (data.animated_video_url ?? data.result_url)) {
          setVideoUrl(data.animated_video_url ?? data.result_url);
          setVideoStatus('Ready');
          setVideoProgress(100);
        } else if (data.jobId) {
          startHedraPolling(data.jobId);
        } else {
          setVideoStatus('Error — Failed to queue avatar job');
          setVideoStarted(false);
        }
      } else {
        // Cinematic / Quick: 3 × 10s clips via generate-cinematic-sequence
        // Prompts are ACTION-driven from the script, not just camera angles.
        const sceneDesc = selectedConcept.description;
        const scriptFull = (editedScript || selectedScript?.script || '').trim();
        const hook = selectedScript?.hook || '';

        // Split script into 3 timed beats so each clip depicts the actual action
        const sentences = scriptFull.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 2);
        const n = sentences.length;
        const beat1 = sentences.slice(0, Math.ceil(n / 3)).join(' ') || hook;
        const beat2 = sentences.slice(Math.ceil(n / 3), Math.ceil(2 * n / 3)).join(' ') || beat1;
        const beat3 = sentences.slice(Math.ceil(2 * n / 3)).join(' ') || beat2;

        // Clip 1: opening action from hook/beat1 — wide shot to establish scene
        // Clip 2: mid action from beat2 — medium shot showing movement
        // Clip 3: closing action from beat3 — close detail or resolution
        const cameraVariations = [
          `${sceneDesc}. ${beat1}. Opening scene, subjects actively doing the described action, wide shot, natural authentic movement, camera slowly pushing in`,
          `${sceneDesc}. ${beat2}. Mid scene action continues, subjects clearly performing the action, medium shot, genuine motion not posed, fluid natural movement`,
          `${sceneDesc}. ${beat3}. Closing beat, action resolving or completing, close detail shot showing the key prop or expression, camera gently pulling back`,
        ];

        setVideoStatus('Generating cinematic sequence…');
        setVideoProgress(10);

        const res = await fetch('/api/generate-cinematic-sequence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompts:     cameraVariations,
            imageUrl:    selectedConcept.imageUrl || null,
            clipDuration: 10,
            goal:        selectedConcept.description,
            videoType,
          }),
        });
        const data = await res.json();

        if (!res.ok || data.error) {
          setVideoStatus('Error — ' + (data.error ?? `HTTP ${res.status}`));
          setVideoStarted(false);
          return;
        }

        const urls: string[] = data.clip_urls ?? (data.stitched_url ? [data.stitched_url] : []);
        if (urls.length > 0) {
          setClipUrls(urls);
          setVideoStatus('Scenes ready');
          setVideoProgress(100);
        } else {
          setVideoStatus('Error — No clips returned');
          setVideoStarted(false);
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Generation failed';
      setVideoStatus('Error — ' + msg);
      setVideoStarted(false);
    }
  };

  const startMultiClipPolling = (jobs: { jobId: string; model: string }[]) => {
    const labels = ['Generating scenes…', 'Rendering clips…', 'Almost done…'];
    let tick = 0;
    const resolved = new Map<string, string>(); // jobId → videoUrl

    pollRef.current = setInterval(async () => {
      tick++;
      if (tick > 36) {
        clearInterval(pollRef.current!);
        setVideoStatus('Timed out — please retry');
        setVideoStarted(false);
        return;
      }
      setVideoStatus(labels[Math.min(tick - 1, labels.length - 1)]);

      // Poll any unresolved jobs
      await Promise.all(
        jobs
          .filter(j => !resolved.has(j.jobId))
          .map(async ({ jobId, model }) => {
            try {
              const res = await fetch(`/api/fal-poll?jobId=${jobId}&model=${encodeURIComponent(model)}`);
              const data = await res.json();
              if (data.status === 'complete' && data.videoUrl) resolved.set(jobId, data.videoUrl);
              else if (data.status === 'failed') resolved.set(jobId, '');
            } catch {}
          })
      );

      const done   = resolved.size;
      const total  = jobs.length;
      const failed = [...resolved.values()].filter(u => !u).length;
      setVideoProgress(Math.round((done / total) * 80));
      setVideoStatus(`${done}/${total} scenes ready${failed ? ` (${failed} failed)` : ''}…`);

      if (done < total) return;

      // All jobs settled
      clearInterval(pollRef.current!);
      const urls = jobs.map(j => resolved.get(j.jobId) ?? '').filter(Boolean);
      if (!urls.length) {
        setVideoStatus('All clips failed — please retry');
        setVideoStarted(false);
        return;
      }
      setClipUrls(urls);
      setVideoProgress(100);
      setVideoStatus('Ready');
    }, 5000);
  };

  const startHedraPolling = (jobId: string) => {
    const labels = ['Queued', 'Processing', 'Rendering', 'Almost done…'];
    let tick = 0;
    pollRef.current = setInterval(async () => {
      tick++;
      // Hedra can take 5–10 min for longer videos; inline worker only covers 90s,
      // then the cron completes it — give the frontend 10 min before timing out.
      if (tick > 120) {
        clearInterval(pollRef.current!);
        setVideoStatus('Timed out — please retry');
        setVideoStarted(false);
        return;
      }
      setVideoStatus(labels[Math.min(tick, labels.length - 1)]);
      setVideoProgress(Math.min(10 + tick * 18, 90));
      try {
        const res = await fetch(`/api/job-status?id=${jobId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'completed') {
          clearInterval(pollRef.current!);
          const url = data.animated_video_url ?? data.result_url;
          if (url) {
            setVideoUrl(url);
            setVideoStatus('Ready');
            setVideoProgress(100);
          } else {
            setVideoStatus('Error — Completed but no video URL');
            setVideoStarted(false);
          }
        } else if (data.status === 'failed') {
          clearInterval(pollRef.current!);
          setVideoStatus('Failed — ' + (data.error ?? 'Avatar generation failed'));
          setVideoStarted(false);
        }
      } catch {}
    }, 5000);
  };

  // ── Step A: Generate voice only ────────────────────────────────────────────
  const generateVoice = async () => {
    const scriptText = (editedScript || selectedScript?.script) ?? selectedConcept?.description ?? '';
    const voiceToUse = selectedVoice || (voices.length > 0 ? voices[0].voice_id : '');
    if (!voiceToUse || !scriptText) return;
    setVoiceGenerating(true);
    setVoiceReady(false);
    setVoiceAudioBase64(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const authHeader = session?.access_token ? { 'Authorization': `Bearer ${session.access_token}` } : {} as Record<string, string>;

      const ttsRes = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ voiceId: voiceToUse, text: scriptText }),
      });
      if (!ttsRes.ok) { console.warn('[generateVoice] TTS status:', ttsRes.status); return; }
      const buf = await ttsRes.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = '';
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      setVoiceAudioBase64(btoa(binary));
      setVoiceReady(true);
    } catch (e) { console.warn('[generateVoice] threw:', e); }
    finally { setVoiceGenerating(false); }
  };

  // ── Step B: Stitch clips + merge voice → final video ───────────────────────
  const combineVideoVoice = async () => {
    setCombining(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const authHeader: Record<string, string> = session?.access_token
        ? { 'Authorization': `Bearer ${session.access_token}` }
        : {};
      const jsonHeaders = { 'Content-Type': 'application/json', ...authHeader };

      // ── 1. Stitch clips (auth required by compose-video) ──────────────────
      let stitchedUrl: string | null = null;
      if (clipUrls.length > 0) {
        try {
          const composeRes = await fetch('/api/compose-video', {
            method: 'POST',
            headers: jsonHeaders,
            body: JSON.stringify({ clipUrls, clipDuration: 10 }),
          });
          if (composeRes.ok) {
            const d = await composeRes.json();
            stitchedUrl = d.video_url ?? null;
            console.log('[combineVideoVoice] stitched:', stitchedUrl?.substring(0, 80));
          } else {
            const errText = await composeRes.text().catch(() => '');
            console.warn('[combineVideoVoice] compose failed', composeRes.status, errText.substring(0, 200));
          }
        } catch (e) { console.warn('[combineVideoVoice] compose threw:', e); }
      } else {
        stitchedUrl = videoUrl;
      }

      const baseUrl = stitchedUrl ?? videoUrl ?? clipUrls[0] ?? null;
      if (!baseUrl) { console.error('[combineVideoVoice] no base video URL'); return; }

      // ── 2. Merge voiceover ─────────────────────────────────────────────────
      let finalUrl = baseUrl;
      if (voiceAudioBase64) {
        try {
          const mergeRes = await fetch('/api/merge-video-audio', {
            method: 'POST',
            headers: jsonHeaders,
            body: JSON.stringify({ video_url: baseUrl, audio_base64: voiceAudioBase64 }),
          });
          if (mergeRes.ok) {
            const d = await mergeRes.json();
            if (d.video_url) {
              finalUrl = d.video_url;
              console.log('[combineVideoVoice] merged:', finalUrl.substring(0, 80));
            } else {
              console.warn('[combineVideoVoice] merge ok but no video_url in response');
            }
          } else {
            const errText = await mergeRes.text().catch(() => '');
            console.warn('[combineVideoVoice] merge failed', mergeRes.status, errText.substring(0, 200));
          }
        } catch (e) { console.warn('[combineVideoVoice] merge threw:', e); }
      }

      // ── 3. Save to My Videos (cookie auth — no header needed) ─────────────
      try {
        const scriptText = (editedScript || selectedScript?.script) ?? selectedConcept?.description ?? '';
        await fetch('/api/save-render', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ video_url: finalUrl, script: scriptText, template: videoType }),
        });
      } catch (e) { console.warn('[combineVideoVoice] save-render threw:', e); }

      setFinalVideo(finalUrl);
    } catch (e) { console.error('[combineVideoVoice] outer catch:', e); }
    finally { setCombining(false); }
  };

  // ── Legacy generateFinal kept for compatibility (avatar mode uses it) ────────
  const generateFinal = async () => {
    setStitching(true);
    try {
      const scriptText = (editedScript || selectedScript?.script) ?? selectedConcept?.description ?? '';

      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const authHeader = session?.access_token
        ? { 'Authorization': `Bearer ${session.access_token}` }
        : {} as Record<string, string>;

      // ── Step 1: TTS voiceover (run in parallel with stitching) ──────────────
      // Generate audio first so it's ready by the time stitching finishes.
      // Voiceover uses the auto-selected first voice if none explicitly chosen.
      const toBase64 = (buf: ArrayBuffer): string => {
        const bytes = new Uint8Array(buf);
        let binary = '';
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        return btoa(binary);
      };

      const ttsPromise: Promise<string | null> = (async () => {
        const voiceToUse = selectedVoice || (voices.length > 0 ? voices[0].voice_id : '');
        if (!voiceToUse || !scriptText) return null;
        try {
          const ttsRes = await fetch('/api/voice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader },
            body: JSON.stringify({ voiceId: voiceToUse, text: scriptText }),
          });
          if (!ttsRes.ok) { console.warn('[generateFinal] TTS status:', ttsRes.status); return null; }
          return toBase64(await ttsRes.arrayBuffer());
        } catch (e) { console.warn('[generateFinal] TTS threw:', e); return null; }
      })();

      // ── Step 2: Stitch clips → get full-length video URL ─────────────────────
      let stitchedUrl: string | null = null;
      if (clipUrls.length > 0) {
        try {
          const composeRes = await fetch('/api/compose-video', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clipUrls, clipDuration: 10 }),
          });
          if (composeRes.ok) {
            const composeData = await composeRes.json();
            stitchedUrl = composeData.video_url ?? null;
            if (!stitchedUrl) console.warn('[generateFinal] compose-video ok but no video_url:', composeData);
          } else {
            const errBody = await composeRes.text();
            console.warn('[generateFinal] compose-video failed', composeRes.status, errBody.substring(0, 200));
          }
        } catch (e) { console.warn('[generateFinal] compose-video threw:', e); }
      } else {
        stitchedUrl = videoUrl;
      }

      // Fallback: if compose failed, use best available clip (still add voiceover below)
      const baseVideoUrl = stitchedUrl ?? videoUrl ?? clipUrls[0] ?? null;
      if (!baseVideoUrl) { setFinalVideo(null); return; }

      // ── Step 3: Merge voiceover onto video (wait for both) ───────────────────
      const audioBase64 = await ttsPromise;
      if (audioBase64) {
        try {
          const mergeRes = await fetch('/api/merge-video-audio', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader },
            body: JSON.stringify({ video_url: baseVideoUrl, audio_base64: audioBase64 }),
          });
          if (mergeRes.ok) {
            const mergeData = await mergeRes.json();
            if (mergeData.video_url) { setFinalVideo(mergeData.video_url); return; }
          } else {
            console.warn('[generateFinal] merge status:', mergeRes.status, await mergeRes.text().catch(() => ''));
          }
        } catch (e) { console.warn('[generateFinal] merge threw:', e); }
      }

      // Voiceover failed or not available — return best video we have
      setFinalVideo(baseVideoUrl);
    } catch (e) {
      console.error('[generateFinal] outer catch:', e);
      setFinalVideo(videoUrl ?? clipUrls[0] ?? null);
    } finally {
      setStitching(false);
    }
  };

  const estTime = videoType === 'avatar' ? '~2 min' : videoType === 'quick' ? '~60s' : '~4 min';
  const isLoading = !!loadingState;

  const inputStyle: React.CSSProperties = {
    width: '100%', borderRadius: 12, padding: '12px 16px',
    fontSize: '0.875rem',
    background: '#0D0020', color: '#F5EFE6',
    border: '1px solid #4C1D95', outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    color: '#B09FC0', fontSize: '0.8rem', fontWeight: 500, marginBottom: 6, display: 'block',
  };

  return (
    <div style={{ maxWidth: 672, margin: '0 auto' }}>

      {/* ── Page title (gold gradient) ─────────────────────────────────── */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{
          fontSize: '1.5rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
          background: 'linear-gradient(105deg,#CFA42F,#F7D96B,#CFA42F)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
          marginBottom: 8,
        }}>
          {toolName}
        </div>
      </div>

      {/* ── SECTION 1: Brief Form ──────────────────────────────────────── */}
      <div className="glass-card" style={{ borderRadius: 24, padding: 'clamp(24px, 5vw, 40px)', marginBottom: 8 }}>
        {/* "New Project" section tag */}
        <span style={{
          display: 'block', color: '#E879F9', fontSize: 11, fontWeight: 700,
          letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 16, textAlign: 'center',
        }}>
          New Project
        </span>
        <h1 style={{
          fontWeight: 700, fontSize: 'clamp(1.6rem, 4vw, 2.1rem)', color: '#C084FC',
          margin: '0 0 12px', lineHeight: 1.2, textAlign: 'center',
        }}>
          What should Omnyra create?
        </h1>
        <p style={{ color: '#BBA8C8', fontSize: 14, lineHeight: 1.65, margin: '0 0 30px', textAlign: 'center' }}>
          Describe your goal. Omnyra analyzes trends, audience patterns, and your creative
          history to build strategy versions with hooks, viral scores, and predictions.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Main goal */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={{ ...labelStyle, marginBottom: 0 }}>What do you want to create? *</label>
            {scripts.length > 0 && (
              <span style={{ color: '#6B4FA8', fontSize: '0.72rem' }}>Edit &amp; click ↺ Regenerate to get new scripts</span>
            )}
          </div>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="e.g. A viral skincare ad for a new moisturizer launch targeting women 25–34..."
            rows={3}
            disabled={isLoading}
            className="omnyra-textarea"
            style={{
              width: '100%', borderRadius: 16, padding: '16px',
              fontSize: '0.875rem', resize: 'vertical',
              border: '1px solid rgba(204,171,175,0.25)', outline: 'none',
              fontFamily: 'inherit', caretColor: '#C084FC',
              boxSizing: 'border-box', opacity: isLoading ? 0.6 : 1,
              background: '#0D0010', color: '#C084FC',
            }}
          />
        </div>

        {/* Niche + Platform row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ color: '#C4B5D0', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
              Niche / Industry
            </label>
            <select
              value={niche}
              onChange={e => setNiche(e.target.value)}
              disabled={isLoading}
              style={{
                width: '100%', background: '#0D0020', border: '1px solid #2D1B4E',
                borderRadius: 10, padding: '12px 16px',
                color: niche ? '#F5EFE6' : '#9B72CF', fontSize: '0.9rem',
                fontFamily: 'inherit', cursor: isLoading ? 'not-allowed' : 'pointer',
                appearance: 'none' as const,
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%239B72CF' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center',
                opacity: isLoading ? 0.6 : 1, boxSizing: 'border-box' as const,
              }}
            >
              <option value="" disabled>Select your niche...</option>
              <option value="PSYCHOLOGY, KINDNESS, HONESTY">Psychology · Kindness · Honesty</option>
              <option value="HISTORY, TRUE STORIES, DOCUMENTARY">History · True Stories · Documentary</option>
              <option value="GAMING">Gaming</option>
              <option value="SELF IMPROVEMENT, MINDSET">Self Improvement · Mindset</option>
              <option value="RELATIONSHIPS, DATING, LOVE">Relationships · Dating · Love</option>
              <option value="FRIENDSHIPS, SOCIAL LIFE">Friendships · Social Life</option>
              <option value="SPIRITUALITY, FAITH, WELLNESS">Spirituality · Faith · Wellness</option>
              <option value="LIFESTYLE, DAILY LIFE, VLOG">Lifestyle · Daily Life · Vlog</option>
              <option value="BEAUTY, SKINCARE, MAKEUP">Beauty · Skincare · Makeup</option>
              <option value="FITNESS, HEALTH, BODY">Fitness · Health · Body</option>
              <option value="FOOD, RECIPES, COOKING">Food · Recipes · Cooking</option>
              <option value="FASHION, STYLE, TRENDS">Fashion · Style · Trends</option>
              <option value="BUSINESS, FINANCE, ENTREPRENEURSHIP">Business · Finance · Entrepreneurship</option>
              <option value="TRAVEL, ADVENTURE, CULTURE">Travel · Adventure · Culture</option>
              <option value="PARENTING, FAMILY, MOM LIFE">Parenting · Family · Mom Life</option>
              <option value="ANIMATION">Animation</option>
              <option value="MOTIVATION, HUSTLE, SUCCESS">Motivation · Hustle · Success</option>
              <option value="COMEDY, ENTERTAINMENT, POP CULTURE">Comedy · Entertainment · Pop Culture</option>
            </select>
          </div>
          <div>
            <label style={{ color: '#C4B5D0', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
              Target Platform
            </label>
            <select
              value={platform}
              onChange={e => setPlatform(e.target.value)}
              disabled={isLoading || toolId === 'tiktok-story'}
              style={{
                width: '100%', background: '#0D0020', border: '1px solid #2D1B4E',
                borderRadius: 10, padding: '12px 16px',
                color: '#F5EFE6', fontSize: '0.9rem',
                fontFamily: 'inherit',
                cursor: (isLoading || toolId === 'tiktok-story') ? 'not-allowed' : 'pointer',
                appearance: 'none' as const,
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%239B72CF' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center',
                opacity: (isLoading || toolId === 'tiktok-story') ? 0.7 : 1,
                boxSizing: 'border-box' as const,
              }}
            >
              <option value="TikTok">🎵 TikTok</option>
              <option value="Instagram Reels">📸 Instagram Reels</option>
              <option value="YouTube Shorts">▶️ YouTube Shorts</option>
              <option value="Facebook Reels">👤 Facebook Reels</option>
              <option value="Pinterest">📌 Pinterest</option>
            </select>
          </div>
        </div>

        {/* Target Audience */}
        <div>
          <label style={labelStyle}>Target Audience</label>
          <input
            value={targetAudience}
            onChange={e => setTargetAudience(e.target.value)}
            placeholder="e.g. Women 25–35 interested in wellness"
            disabled={isLoading}
            style={{ ...inputStyle, opacity: isLoading ? 0.6 : 1 }}
          />
        </div>

        {/* Past Wins */}
        <div>
          <label style={labelStyle}>Past Wins (optional)</label>
          <textarea
            value={pastWins}
            onChange={e => setPastWins(e.target.value)}
            placeholder="What content has worked well for you before?"
            rows={2}
            disabled={isLoading}
            className="omnyra-textarea"
            style={{
              width: '100%', borderRadius: 12, padding: '12px 16px',
              fontSize: '0.875rem', resize: 'vertical',
              border: '1px solid #4C1D95', outline: 'none',
              fontFamily: 'inherit', boxSizing: 'border-box',
              opacity: isLoading ? 0.6 : 1,
            }}
          />
        </div>

        {/* Competitors */}
        <div>
          <label style={labelStyle}>Competitors (optional)</label>
          <input
            value={competitors}
            onChange={e => setCompetitors(e.target.value)}
            placeholder="e.g. Brand A, Creator B"
            disabled={isLoading}
            style={{ ...inputStyle, opacity: isLoading ? 0.6 : 1 }}
          />
        </div>

        {/* Unique Angle */}
        <div>
          <label style={labelStyle}>Your Unique Angle (optional)</label>
          <textarea
            value={uniqueAngle}
            onChange={e => setUniqueAngle(e.target.value)}
            placeholder="What makes your brand or story different?"
            rows={2}
            disabled={isLoading}
            className="omnyra-textarea"
            style={{
              width: '100%', borderRadius: 12, padding: '12px 16px',
              fontSize: '0.875rem', resize: 'vertical',
              border: '1px solid #4C1D95', outline: 'none',
              fontFamily: 'inherit', boxSizing: 'border-box',
              opacity: isLoading ? 0.6 : 1,
            }}
          />
        </div>

        {/* Media Upload */}
        <div>
          <label style={labelStyle}>Reference Media (optional)</label>
          <div
            onClick={() => !isLoading && fileInputRef.current?.click()}
            style={{
              borderRadius: 12, border: '2px dashed rgba(212,168,67,0.3)',
              padding: '20px', textAlign: 'center',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              background: 'rgba(212,168,67,0.04)',
              opacity: isLoading ? 0.6 : 1,
            }}
          >
            {mediaFile ? (
              <span style={{ color: '#D4A843', fontSize: '0.875rem' }}>📎 {mediaFile.name}</span>
            ) : (
              <>
                <p style={{ color: '#D4A843', fontSize: '0.875rem', margin: 0 }}>Click to upload</p>
                <p style={{ color: '#7C3AED', fontSize: '0.75rem', margin: '4px 0 0' }}>Image or video reference</p>
              </>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*"
            style={{ display: 'none' }}
            onChange={e => setMediaFile(e.target.files?.[0] ?? null)}
          />
        </div>

        {/* Lightning Mode */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'rgba(192,132,252,0.08)',
          border: '1px solid rgba(192,132,252,0.3)',
          borderRadius: 12, padding: '10px 16px',
        }}>
          <span style={{ fontSize: 16 }}>⚡</span>
          <span style={{ color: '#E8DEFF', fontSize: 14, fontWeight: 500 }}>Lightning Mode</span>
          <button
            type="button"
            onClick={() => setLightningMode(v => !v)}
            style={{
              marginLeft: 'auto',
              width: 44, height: 24, borderRadius: 12,
              background: lightningMode ? 'linear-gradient(90deg, #C084FC, #E879F9)' : '#2D1B4E',
              border: '1px solid #4C1D95',
              cursor: 'pointer', position: 'relative', transition: 'all 0.2s',
            }}
          >
            <span style={{
              position: 'absolute', top: 3,
              left: lightningMode ? 22 : 3,
              width: 16, height: 16, borderRadius: '50%',
              background: '#fff', transition: 'left 0.2s',
            }} />
          </button>
          <span style={{ color: lightningMode ? '#C084FC' : '#9370DB', fontSize: 12 }}>
            {lightningMode ? 'ON' : 'OFF — Max Quality'}
          </span>
        </div>

        {scriptError && (
          <div style={{ borderRadius: 12, padding: '12px 16px', background: 'rgba(196,122,90,0.08)', border: '1px solid rgba(196,122,90,0.35)', color: '#CCABAF', fontSize: 13 }}>
            ⚠ {scriptError}
          </div>
        )}

        {isLoading && (
          <>
            {/* Gold progress bar */}
            <div style={{ width: '100%', height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2, marginBottom: 8 }}>
              <div style={{ width: '60%', height: '100%', background: 'linear-gradient(90deg, #C9A84C, #FFD700)', borderRadius: 2, animation: 'progressPulse 1.5s ease-in-out infinite' }} />
            </div>
            <p style={{ textAlign: 'center', fontSize: 13, color: '#F0C040', margin: '0 0 8px' }}>
              {loadingState}
            </p>
          </>
        )}

        <button
          onClick={handleGenerateScript}
          disabled={!prompt.trim() || isLoading}
          className={!isLoading && prompt.trim() ? 'gold-btn' : undefined}
          style={{
            width: '100%', marginTop: 8, padding: '16px 24px', borderRadius: 9999,
            border: 'none', fontSize: 16, fontWeight: 600, fontFamily: 'inherit',
            cursor: !prompt.trim() || isLoading ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            ...(!prompt.trim() || isLoading ? { background: 'rgba(255,255,255,0.06)', color: '#8A7D92' } : {}),
          }}
        >
          {isLoading
            ? <><span style={{ width: 7, height: 7, borderRadius: '50%', background: '#D4A843', display: 'inline-block', animation: 'pulseSoft 1.1s ease-in-out infinite' }} /> Building scripts…</>
            : scripts.length > 0 ? '↺ Regenerate Scripts' : 'Generate Strategy Versions →'}
        </button>

        </div>{/* end flex column */}
      </div>{/* end glass-card */}

      {/* ── SECTION 2: Scripts ─────────────────────────────────────────── */}
      {scripts.length > 0 && (
        <>
          <GoldDivider />
          <div ref={scriptsSectionRef} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h2 style={{ color: '#D4A843', fontWeight: 800, fontSize: 'clamp(1.1rem, 3vw, 1.5rem)', letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>
                  Your Scripts
                </h2>
                <p style={{ color: '#C4B5D0', fontSize: '0.85rem', margin: '4px 0 0' }}>
                  Brief: <span style={{ color: '#D4C5E2' }}>{prompt.length > 60 ? prompt.slice(0, 60) + '…' : prompt}</span>
                </p>
              </div>
            </div>

            {/* Version tabs + regenerate */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {scripts.map((v, i) => (
                <button
                  key={i}
                  onClick={() => { setSelectedScript(v); setEditingScript(false); setEditedScript(''); }}
                  style={{
                    background: selectedScript === v ? 'rgba(212,168,67,0.1)' : 'rgba(255,255,255,0.05)',
                    border: selectedScript === v ? '1px solid #D4A843' : '1px solid rgba(255,255,255,0.15)',
                    borderRadius: 999, padding: '10px 20px',
                    color: '#F5EFE6', cursor: 'pointer', fontSize: '0.9rem',
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}
                >
                  <span>Version</span>
                  <span style={{ color: '#D4A843', fontWeight: 700 }}>{v.viral_score}/100</span>
                </button>
              ))}
              <button
                onClick={handleGenerateScript}
                disabled={isLoading}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(212,168,67,0.4)',
                  color: isLoading ? '#8B6FA8' : '#D4A843',
                  borderRadius: 10, padding: '8px 18px',
                  fontSize: '0.85rem', cursor: isLoading ? 'default' : 'pointer',
                  marginLeft: 4,
                }}
              >
                {isLoading ? 'Regenerating…' : '↺ Regenerate Scripts'}
              </button>
            </div>

            {isLoading && (
              <div style={{ borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)' }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#D4A843', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                <span style={{ color: '#C4B5D0', fontSize: '0.875rem' }}>{loadingState}</span>
              </div>
            )}

            {selectedScript && (
              <>
                {/* Viral Analytics */}
                <div style={{
                  background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255,255,255,0.2)', borderRadius: 16,
                  padding: '28px 32px',
                }}>
                  <p style={{ textAlign: 'center', color: '#D4A843', fontSize: '0.7rem', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 24 }}>
                    Viral Analytics
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, textAlign: 'center' }}>
                    <div>
                      <p style={{ color: '#6B7280', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Viral Potential</p>
                      <p style={{ color: '#D4A843', fontSize: '2.5rem', fontWeight: 800, lineHeight: 1, margin: 0 }}>{selectedScript.viral_score}</p>
                      <p style={{ color: '#6B7280', fontSize: '0.75rem', margin: 0 }}>/ 100</p>
                    </div>
                    <div>
                      <p style={{ color: '#6B7280', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Hook Strength</p>
                      <p style={{ color: '#4ADE80', fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>{selectedScript.hook_strength || 'Strong'}</p>
                    </div>
                    <div>
                      <p style={{ color: '#6B7280', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Estimated Reach</p>
                      <p style={{ color: '#C084FC', fontSize: '1rem', fontWeight: 600, margin: 0 }}>{selectedScript.estimated_reach || '10K-50K views'}</p>
                    </div>
                    <div>
                      <p style={{ color: '#6B7280', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Best Post Time</p>
                      <p style={{ color: '#C084FC', fontSize: '1rem', fontWeight: 600, margin: 0 }}>{selectedScript.best_post_time || '7pm-9pm Tue-Thu'}</p>
                    </div>
                  </div>
                </div>

                {/* Script content + inline edit */}
                <div style={{
                  background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255,255,255,0.2)', borderRadius: 16,
                  padding: '28px 32px',
                }}>
                  {selectedScript.title && (
                    <p style={{ textAlign: 'center', color: '#D4A843', fontSize: '0.7rem', letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 20 }}>
                      {selectedScript.title}
                    </p>
                  )}
                  <p style={{ color: '#D4A843', fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.6, marginBottom: 16 }}>
                    &quot;{selectedScript.hook}&quot;
                  </p>

                  {/* Inline edit toggle */}
                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
                    <button
                      onClick={() => {
                        if (editingScript) {
                          setEditingScript(false);
                        } else {
                          setEditingScript(true);
                          setEditedScript(editedScript || selectedScript.script);
                        }
                      }}
                      style={{
                        background: editingScript ? 'rgba(212,168,67,0.15)' : 'transparent',
                        border: `1px solid ${editingScript ? '#D4A843' : 'rgba(255,255,255,0.2)'}`,
                        color: editingScript ? '#D4A843' : '#B09FC0',
                        borderRadius: 8, padding: '5px 14px',
                        fontSize: '0.78rem', cursor: 'pointer',
                      }}
                    >
                      {editingScript ? '✓ Done' : '✏️ Edit Script'}
                    </button>
                  </div>

                  {editingScript ? (
                    <textarea
                      value={editedScript}
                      onChange={e => setEditedScript(e.target.value)}
                      rows={6}
                      className="omnyra-textarea"
                      style={{
                        width: '100%', borderRadius: 12, padding: '14px 16px',
                        fontSize: '0.9rem', lineHeight: 1.7, resize: 'vertical',
                        border: '1px solid rgba(212,168,67,0.4)', outline: 'none',
                        fontFamily: 'inherit', caretColor: '#D4A843',
                        boxSizing: 'border-box',
                      }}
                    />
                  ) : (
                    <p style={{ color: '#C4B5D0', fontSize: '0.9rem', lineHeight: 1.7, margin: 0 }}>
                      {editedScript || selectedScript.script}
                    </p>
                  )}
                </div>

                {scriptOnly ? (
                  <button style={{
                    width: '100%', padding: '18px',
                    background: '#D4A843', color: '#0D0010',
                    fontWeight: 700, fontSize: '1rem', letterSpacing: '0.05em',
                    border: 'none', borderRadius: 14, cursor: 'pointer',
                  }}>
                    ✓ Export Script
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      const scriptText = editedScript || selectedScript!.script;
                      const combined = `${selectedScript!.hook}\n\n${scriptText}`;
                      setImagePrompt(combined);
                      setTimeout(() => {
                        visualsSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }, 100);
                    }}
                    style={{
                      width: '100%', padding: '16px',
                      background: 'linear-gradient(135deg, #D4A843 0%, #F0C855 50%, #C8922A 100%)',
                      color: '#0D0010', fontWeight: 800, fontSize: '1rem',
                      letterSpacing: '0.04em', border: 'none', borderRadius: 14,
                      cursor: 'pointer', boxShadow: '0 4px 20px rgba(212,168,67,0.35)',
                    }}
                  >
                    ✓ Choose This Script →
                  </button>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* ── SECTION 3: Visuals ─────────────────────────────────────────── */}
      {selectedScript && !scriptOnly && (
        <>
          <GoldDivider />
          <div ref={visualsSectionRef} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h2 style={{ color: '#F5EFE6', fontWeight: 700, fontSize: '1.25rem', marginBottom: 6 }}>Generate Visuals</h2>
                <p style={{ color: '#B09FC0', fontSize: '0.875rem' }}>Configure your style, then generate scene images.</p>
              </div>
              {imagesGenerated && (
                <button
                  onClick={handleRegenerateImages}
                  style={{
                    background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.4)',
                    color: '#D4A843', borderRadius: 10, padding: '8px 16px',
                    fontSize: '0.825rem', fontWeight: 600, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}
                >
                  ↺ Regenerate Images
                </button>
              )}
            </div>

            {/* Config panel */}
            {!imagesGenerated && (
              <>
                {/* Visual Style */}
                <div>
                  <p style={{ color: '#E8DEFF', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10, fontWeight: 600 }}>
                    Visual Style
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {['Lifestyle', 'Product', 'Thumbnail', 'Avatar Scene', 'UGC'].map(s => (
                      <button
                        key={s}
                        onClick={() => setVisualStyle(s)}
                        style={{
                          padding: '7px 16px', borderRadius: 999,
                          border: visualStyle === s ? '1px solid #D4A843' : '1px solid rgba(255,255,255,0.25)',
                          background: visualStyle === s ? 'rgba(212,168,67,0.15)' : 'rgba(255,255,255,0.05)',
                          color: visualStyle === s ? '#D4A843' : '#BBA8C8',
                          fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.15s',
                        }}
                      >
                        {s === 'Lifestyle' ? '✦ ' : ''}{s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Aspect Ratio */}
                <div>
                  <p style={{ color: '#E8DEFF', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10, fontWeight: 600 }}>
                    Aspect Ratio
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[
                      { value: '9:16', label: '9:16 TikTok/Reels' },
                      { value: '1:1',  label: '1:1 Square' },
                      { value: '16:9', label: '16:9 YouTube' },
                    ].map(r => (
                      <button
                        key={r.value}
                        onClick={() => setAspectRatio(r.value)}
                        style={{
                          padding: '7px 16px', borderRadius: 999,
                          border: aspectRatio === r.value ? '1px solid #D4A843' : '1px solid rgba(255,255,255,0.25)',
                          background: aspectRatio === r.value ? 'rgba(212,168,67,0.15)' : 'rgba(255,255,255,0.05)',
                          color: aspectRatio === r.value ? '#D4A843' : '#BBA8C8',
                          fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.15s',
                        }}
                      >
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Generation Type */}
                <div style={{ marginBottom: 4 }}>
                  <p style={{ color: '#E8DEFF', fontSize: '0.7rem', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12, fontWeight: 600 }}>
                    Generation Type
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {([
                      { id: 'quick'     as VideoType, icon: '⚡', label: '10s Draft',       sub: 'fal.ai · Fast preview',  credits: '10 credits', tier: 'All tiers', fullWidth: false },
                      { id: 'cinematic' as VideoType, icon: '🎬', label: 'Cinematic Scene',  sub: '30s · Kling Pro',         credits: '40 credits', tier: 'Creator+',  fullWidth: false },
                      { id: 'avatar'    as VideoType, icon: '👤', label: 'Avatar Video',     sub: '30s · Hedra lip-sync',    credits: '40 credits', tier: 'Creator+',  fullWidth: true  },
                    ]).map(type => (
                      <div
                        key={type.id}
                        onClick={() => setVideoType(type.id)}
                        style={{
                          gridColumn: type.fullWidth ? 'span 2' : 'span 1',
                          background: videoType === type.id ? 'rgba(212,168,67,0.12)' : 'rgba(255,255,255,0.05)',
                          border: videoType === type.id ? '2px solid #D4A843' : '1px solid rgba(255,255,255,0.2)',
                          borderRadius: 14, padding: '16px 18px', cursor: 'pointer', transition: 'all 0.2s',
                        }}
                      >
                        <div style={{ fontSize: 22, marginBottom: 8 }}>{type.icon}</div>
                        <div style={{ color: videoType === type.id ? '#D4A843' : '#E8DEFF', fontWeight: 700, fontSize: '0.95rem', marginBottom: 4 }}>
                          {type.label}
                        </div>
                        <div style={{ color: '#D4C5E2', fontSize: '0.78rem', marginBottom: 4 }}>{type.sub}</div>
                        <div style={{ color: '#D4A843', fontSize: '0.75rem', fontWeight: 600 }}>
                          {type.credits}
                          <span style={{ color: '#8B6FA8', marginLeft: 6, fontWeight: 400 }}>· {type.tier}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Upload own scene */}
                <div style={{ border: '1px dashed rgba(255,255,255,0.25)', borderRadius: 12, padding: '20px', textAlign: 'center', cursor: 'pointer' }}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>📁</div>
                  <p style={{ color: '#D4C5E2', fontSize: '0.85rem', margin: 0 }}>Upload your own scene or avatar photo</p>
                  <p style={{ color: '#8B6FA8', fontSize: '0.75rem', margin: '4px 0 0' }}>JPG, PNG, WebP · Max 10MB</p>
                </div>

                {/* Editable Image Prompt — collapsed by default */}
                <div>
                  <button
                    onClick={() => setShowImagePrompt(v => !v)}
                    style={{
                      background: 'none', border: '1px solid rgba(212,168,67,0.25)',
                      borderRadius: 8, padding: '5px 12px',
                      color: '#8B6FA8', fontSize: '0.72rem', letterSpacing: '0.06em',
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    <span style={{ fontSize: '0.65rem', opacity: 0.8 }}>{showImagePrompt ? '▲' : '▼'}</span>
                    {showImagePrompt ? 'Hide scene brief' : 'Edit scene brief'}
                  </button>
                  {showImagePrompt && (
                    <textarea
                      value={imagePrompt}
                      onChange={e => setImagePrompt(e.target.value)}
                      placeholder="Visual scene brief — describe camera angles, lighting, character and setting for each scene..."
                      rows={6}
                      style={{
                        width: '100%', boxSizing: 'border-box', marginTop: 8,
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(212,168,67,0.3)',
                        borderRadius: 10, padding: '12px 14px',
                        color: '#E8DEFF', fontSize: '0.82rem', lineHeight: 1.6,
                        resize: 'vertical', fontFamily: 'inherit', outline: 'none',
                      }}
                    />
                  )}
                </div>

                {/* Generate scenes button */}
                {isLoading ? (
                  <div style={{ borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, background: '#1A0A2E', border: '1px solid #2D1B4E' }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #2D1B4E', borderTopColor: '#D4A843', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                    <span style={{ color: '#B09FC0', fontSize: '0.875rem' }}>{loadingState}</span>
                  </div>
                ) : (
                  <button
                    onClick={async () => { await handleGenerateScenes(); setImagesGenerated(true); }}
                    style={{
                      width: '100%', padding: '16px',
                      background: 'linear-gradient(105deg, #5A3400 0%, #9A7010 20%, #CFA42F 42%, #E8C84A 50%, #CFA42F 58%, #9A7010 80%, #5A3400 100%)',
                      backgroundSize: '200% auto', animation: 'metalShimmer 3s linear infinite',
                      color: '#0D0010', fontWeight: 700, fontSize: '1rem',
                      border: 'none', borderRadius: 14, cursor: 'pointer', marginBottom: 4,
                    }}
                  >
                    ✦ Generate Scene Images →
                  </button>
                )}
              </>
            )}

            {/* Image grid */}
            {imagesGenerated && (
              <>
                {isLoading && (
                  <div style={{ borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, background: '#1A0A2E', border: '1px solid #2D1B4E' }}>
                    <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #2D1B4E', borderTopColor: '#D4A843', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
                    <span style={{ color: '#B09FC0', fontSize: '0.875rem' }}>{loadingState}</span>
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {concepts.map((c, i) => (
                    <div
                      key={i}
                      onClick={() => setSelectedConcept(c)}
                      style={{
                        position: 'relative', cursor: 'pointer', borderRadius: 16,
                        overflow: 'hidden', aspectRatio: aspectRatio === '16:9' ? '16/9' : aspectRatio === '1:1' ? '1/1' : '9/16',
                        outline: selectedConcept === c ? '3px solid #C084FC' : '2px solid transparent',
                        boxShadow: selectedConcept === c ? '0 0 24px rgba(192,132,252,0.5)' : 'none',
                        background: '#0D0020',
                      }}
                    >
                      {c.imageUrl ? (
                        <img src={c.imageUrl} alt={c.title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <div style={{ fontSize: '2rem', opacity: 0.3 }}>🎬</div>
                        </div>
                      )}
                      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)' }} />
                      <div style={{
                        position: 'absolute', top: 8, right: 8, fontSize: 11, fontWeight: 700,
                        padding: '2px 8px', borderRadius: 999,
                        background: 'rgba(0,0,0,0.7)', color: '#C084FC', border: '1px solid rgba(192,132,252,0.4)',
                      }}>
                        👻 {c.ghostScore}
                      </div>
                      {selectedConcept === c && (
                        <div style={{
                          position: 'absolute', top: 8, left: 8, width: 24, height: 24,
                          borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                          fontSize: 12, fontWeight: 700, background: '#C084FC', color: '#000',
                        }}>
                          ✓
                        </div>
                      )}
                      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 12 }}>
                        <p style={{ fontSize: 11, fontWeight: 600, color: '#fff', margin: 0, lineHeight: 1.4 }}>{c.title}</p>
                      </div>
                    </div>
                  ))}
                </div>
                {!selectedConcept && (
                  <p style={{ color: '#6B4FA8', fontSize: '0.82rem', textAlign: 'center', margin: 0 }}>
                    Select a scene above to continue to Voice &amp; Video ↓
                  </p>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* ── SECTION 4: Generate Video ─────────────────────────────────── */}
      {selectedConcept && !scriptOnly && (
        <>
          <GoldDivider />
          <div ref={voiceSectionRef} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            <div>
              <h2 style={{ color: '#F5EFE6', fontWeight: 700, fontSize: '1.25rem', marginBottom: 4 }}>Generate Video</h2>
              <p style={{ color: '#B09FC0', fontSize: '0.875rem', margin: 0 }}>Choose your video type, generate, then add a voice.</p>
            </div>

            {/* ── 1. Video Type Selector (only before generation starts) ── */}
            {!videoStarted && !finalVideo && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {VIDEO_TYPES.map(vt => (
                  <button
                    key={vt.id}
                    onClick={() => setVideoType(vt.id)}
                    style={{
                      borderRadius: 14, padding: '14px 10px', textAlign: 'left',
                      background: videoType === vt.id ? 'rgba(212,168,67,0.1)' : '#0D0020',
                      border: `1px solid ${videoType === vt.id ? '#D4A843' : '#2D1B4E'}`,
                      cursor: 'pointer', transition: 'all 0.15s',
                      boxShadow: videoType === vt.id ? '0 0 12px rgba(212,168,67,0.2)' : 'none',
                    }}
                  >
                    <div style={{ fontSize: '1.3rem', marginBottom: 6 }}>{vt.badge}</div>
                    <p style={{ color: '#F5EFE6', fontSize: '0.8rem', fontWeight: 700, margin: '0 0 3px' }}>{vt.label}</p>
                    <p style={{ color: '#9370DB', fontSize: '0.7rem', margin: '0 0 6px' }}>{vt.desc}</p>
                    <span style={{ color: '#D4A843', fontSize: '0.68rem', background: 'rgba(212,168,67,0.08)', borderRadius: 6, padding: '2px 7px' }}>{vt.cr}cr</span>
                  </button>
                ))}
              </div>
            )}

            {/* ── 2a. Avatar: voice selector shown BEFORE generation ── */}
            {!videoStarted && !finalVideo && videoType === 'avatar' && (
              <div style={{ borderRadius: 14, border: '1px solid #2D1B4E', padding: 16, background: '#1A0A2E' }}>
                <p style={{ color: '#E8DEFF', fontWeight: 600, fontSize: '0.85rem', margin: '0 0 10px' }}>
                  🎙 Choose voice <span style={{ color: '#6B4FA8', fontWeight: 400, fontSize: '0.78rem' }}> — baked into avatar lip-sync</span>
                </p>
                <div style={{ position: 'relative' }} ref={voiceDropRef}>
                  <div
                    onClick={() => !voicesLoading && setVoiceDropOpen(v => !v)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0D0020', border: `1px solid ${voiceDropOpen ? '#D4A843' : '#2D1B4E'}`, borderRadius: 10, padding: '10px 14px', cursor: 'pointer' }}
                  >
                    <div style={{ flex: 1 }}>
                      {voicesLoading ? (
                        <span style={{ color: '#6B4FA8', fontSize: '0.875rem' }}>Loading voices…</span>
                      ) : (() => {
                        const v = voices.find(v => v.voice_id === selectedVoice);
                        return v ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ color: '#E8DEFF', fontWeight: 600 }}>{v.name}</span>
                            {v.labels?.accent && <span style={{ color: '#6B4FA8', fontSize: '0.75rem' }}>{v.labels.accent}</span>}
                          </div>
                        ) : <span style={{ color: '#6B4FA8', fontSize: '0.875rem' }}>Select a voice…</span>;
                      })()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {(() => {
                        const v = voices.find(v => v.voice_id === selectedVoice);
                        return v?.preview_url ? (
                          <button onClick={e => playPreview(v.preview_url, v.voice_id, e)}
                            style={{ background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.4)', borderRadius: 6, color: '#D4A843', fontSize: '0.72rem', padding: '3px 10px', cursor: 'pointer' }}>
                            {previewingVoice === v.voice_id ? '■ Stop' : '▶ Preview'}
                          </button>
                        ) : null;
                      })()}
                      <span style={{ color: '#4A3060', fontSize: '0.7rem' }}>{voiceDropOpen ? '▲' : '▼'}</span>
                    </div>
                  </div>
                  {voiceDropOpen && !voicesLoading && (
                    <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50, background: '#0A0018', border: '1px solid #2D1B4E', borderRadius: 12, overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,0.6)' }}>
                      <div style={{ padding: '8px 12px', borderBottom: '1px solid #1A0A2E' }}>
                        <input type="text" value={voiceSearch} onChange={e => setVoiceSearch(e.target.value)} placeholder="Search voices…" autoFocus
                          style={{ width: '100%', background: 'transparent', border: 'none', outline: 'none', color: '#E8DEFF', fontSize: '0.875rem', fontFamily: 'inherit' }} />
                      </div>
                      <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                        {voices.filter(v => {
                          if (!voiceSearch) return true;
                          const q = voiceSearch.toLowerCase();
                          return v.name.toLowerCase().includes(q) || (v.labels?.accent ?? '').toLowerCase().includes(q);
                        }).map(v => (
                          <div key={v.voice_id} onClick={() => { setSelectedVoice(v.voice_id); setVoiceDropOpen(false); setVoiceSearch(''); }}
                            style={{ display: 'flex', alignItems: 'center', padding: '9px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.03)', background: selectedVoice === v.voice_id ? 'rgba(212,168,67,0.08)' : 'transparent' }}>
                            <div style={{ flex: 1 }}>
                              <span style={{ color: selectedVoice === v.voice_id ? '#D4A843' : '#E8DEFF', fontSize: '0.875rem', fontWeight: 500 }}>{v.name}</span>
                              {v.labels?.accent && <span style={{ color: '#D4A843', fontSize: '0.68rem', background: 'rgba(212,168,67,0.08)', borderRadius: 4, padding: '1px 5px', marginLeft: 8 }}>{v.labels.accent}</span>}
                            </div>
                            {v.preview_url && (
                              <button onClick={e => playPreview(v.preview_url, v.voice_id, e)}
                                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, color: '#6B4FA8', fontSize: '0.7rem', padding: '2px 7px', cursor: 'pointer' }}>
                                {previewingVoice === v.voice_id ? '■' : '▶'}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── 2. Generate Video button ── */}
            {!videoStarted && !finalVideo && (
              <button
                onClick={startVideoGeneration}
                disabled={videoType === 'avatar' && !selectedVoice}
                style={{
                  width: '100%', padding: '20px', borderRadius: 16, border: 'none',
                  cursor: videoType === 'avatar' && !selectedVoice ? 'not-allowed' : 'pointer',
                  background: videoType === 'avatar' && !selectedVoice
                    ? 'rgba(212,168,67,0.3)'
                    : 'linear-gradient(105deg,#5A3400,#9A7010 20%,#CFA42F 42%,#E8C84A 50%,#CFA42F 58%,#9A7010 80%,#5A3400)',
                  backgroundSize: '200% auto', animation: 'metalShimmer 3s linear infinite',
                  color: '#0D0010', fontWeight: 800, fontSize: '1rem', letterSpacing: '0.04em',
                  boxShadow: videoType === 'avatar' && !selectedVoice ? 'none' : '0 0 24px rgba(207,164,47,0.35)',
                }}
              >
                {videoType === 'avatar' && !selectedVoice ? 'Select a voice above first' : 'Generate Video →'}
              </button>
            )}

            {/* ── 3. Video rendering progress ── */}
            {videoStarted && !finalVideo && (clipUrls.length === 0 && !videoUrl) && (
              <div style={{ borderRadius: 16, border: '1px solid #2D1B4E', padding: 18, background: '#1A0A2E' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <span style={{ color: '#C084FC', fontSize: '0.8rem', fontWeight: 600 }}>🎬 Cinematic video rendering…</span>
                  <span style={{ color: '#6B4FA8', fontSize: '0.75rem' }}>{videoStatus || 'Processing'}</span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: '#0D0020', overflow: 'hidden', marginBottom: 10 }}>
                  <div style={{ height: '100%', borderRadius: 999, width: `${videoProgress}%`, background: 'linear-gradient(90deg,#C084FC,#E879F9)', transition: 'width 1s' }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: '#4A3060' }}>
                  {['Script','Images','Clips','Voice','Stitch'].map((s, i) => (
                    <span key={s} style={{ color: videoProgress > i * 20 ? '#C084FC' : '#4A3060' }}>{s}</span>
                  ))}
                </div>
                <p style={{ color: '#4A3060', fontSize: '0.72rem', margin: '10px 0 0', textAlign: 'right' }}>
                  Cinematic AI — ~2–3 minutes &nbsp;
                  <a href="/my-videos" style={{ color: '#D4A843', textDecoration: 'none' }}>My Videos →</a>
                </p>
              </div>
            )}

            {/* ── 4. Video preview (clips ready, before combine) ── */}
            {!finalVideo && (clipUrls.length > 0 || videoUrl) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <video
                  src={clipUrls[0] ?? videoUrl ?? ''}
                  controls playsInline muted
                  style={{ width: '100%', borderRadius: 14, background: '#000', maxHeight: 500 }}
                />
                <div style={{ borderRadius: 10, padding: '10px 14px', background: 'rgba(212,168,67,0.07)', border: '1px solid rgba(212,168,67,0.2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ color: '#D4A843', fontSize: 14 }}>✓</span>
                  <span style={{ color: '#D4A843', fontSize: '0.8rem', fontWeight: 600 }}>
                    {clipUrls.length > 1 ? `${clipUrls.length} scenes ready` : 'Scene ready'} — add a voice below to create your final video
                  </span>
                </div>
              </div>
            )}

            {/* ── 5. Voice section — only shown after video starts generating ── */}
            {videoStarted && !finalVideo && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14, borderRadius: 16, border: '1px solid #2D1B4E', padding: 20, background: '#1A0A2E' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <h3 style={{ color: '#E8DEFF', fontWeight: 700, fontSize: '0.95rem', margin: 0 }}>Choose Voice</h3>
                  {voices.length > 0 && <span style={{ color: '#4A3060', fontSize: '0.72rem' }}>{voices.length} voices</span>}
                </div>

                {/* Voice dropdown */}
                <div style={{ position: 'relative' }} ref={voiceDropRef}>
                  <div
                    onClick={() => !voicesLoading && setVoiceDropOpen(v => !v)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      background: '#0D0020', border: `1px solid ${voiceDropOpen ? '#D4A843' : '#2D1B4E'}`,
                      borderRadius: 12, padding: '12px 16px', cursor: 'pointer', transition: 'border-color 0.15s',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      {voicesLoading ? (
                        <span style={{ color: '#6B4FA8', fontSize: '0.875rem' }}>Loading voices…</span>
                      ) : (() => {
                        const v = voices.find(v => v.voice_id === selectedVoice);
                        return v ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span style={{ color: '#E8DEFF', fontWeight: 600 }}>{v.name}</span>
                            {v.labels?.accent && <span style={{ color: '#6B4FA8', fontSize: '0.75rem' }}>{v.labels.accent}</span>}
                            {v.labels?.description && <span style={{ color: '#4A3060', fontSize: '0.72rem' }}>· {v.labels.description}</span>}
                          </div>
                        ) : <span style={{ color: '#6B4FA8', fontSize: '0.875rem' }}>Select a voice…</span>;
                      })()}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {(() => {
                        const v = voices.find(v => v.voice_id === selectedVoice);
                        return v?.preview_url ? (
                          <button
                            onClick={e => playPreview(v.preview_url, v.voice_id, e)}
                            style={{ background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.4)', borderRadius: 8, color: '#D4A843', fontSize: '0.75rem', padding: '4px 12px', cursor: 'pointer' }}
                          >
                            {previewingVoice === v.voice_id ? '■ Stop' : '▶ Preview'}
                          </button>
                        ) : null;
                      })()}
                      <span style={{ color: '#4A3060', fontSize: '0.7rem' }}>{voiceDropOpen ? '▲' : '▼'}</span>
                    </div>
                  </div>

                  {voiceDropOpen && !voicesLoading && (
                    <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 50, background: '#0A0018', border: '1px solid #2D1B4E', borderRadius: 12, overflow: 'hidden', boxShadow: '0 12px 40px rgba(0,0,0,0.6)' }}>
                      <div style={{ padding: '10px 14px', borderBottom: '1px solid #1A0A2E', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <input type="text" value={voiceSearch} onChange={e => setVoiceSearch(e.target.value)} placeholder="Search voices…" autoFocus
                          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: '#E8DEFF', fontSize: '0.875rem', fontFamily: 'inherit' }} />
                        {voiceSearch && <button onClick={() => setVoiceSearch('')} style={{ background: 'none', border: 'none', color: '#4A3060', cursor: 'pointer' }}>✕</button>}
                      </div>
                      <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                        {voices.filter(v => {
                          if (!voiceSearch) return true;
                          const q = voiceSearch.toLowerCase();
                          return v.name.toLowerCase().includes(q) || (v.labels?.accent ?? '').toLowerCase().includes(q) || (v.labels?.description ?? '').toLowerCase().includes(q);
                        }).map(v => (
                          <div key={v.voice_id} onClick={() => { setSelectedVoice(v.voice_id); setVoiceDropOpen(false); setVoiceSearch(''); setVoiceReady(false); setVoiceAudioBase64(null); }}
                            style={{ display: 'flex', alignItems: 'center', padding: '10px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.03)', background: selectedVoice === v.voice_id ? 'rgba(212,168,67,0.08)' : 'transparent' }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ color: selectedVoice === v.voice_id ? '#D4A843' : '#E8DEFF', fontSize: '0.875rem', fontWeight: 500 }}>{v.name}</span>
                                {favorites.includes(v.voice_id) && <span style={{ color: '#D4A843', fontSize: '0.75rem' }}>♥</span>}
                              </div>
                              <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                                {v.labels?.accent && <span style={{ color: '#D4A843', fontSize: '0.68rem', background: 'rgba(212,168,67,0.08)', borderRadius: 4, padding: '1px 5px' }}>{v.labels.accent}</span>}
                                {v.labels?.description && <span style={{ color: '#8B6FA8', fontSize: '0.68rem', background: 'rgba(255,255,255,0.04)', borderRadius: 4, padding: '1px 5px' }}>{v.labels.description}</span>}
                              </div>
                            </div>
                            <div style={{ display: 'flex', gap: 8 }}>
                              {v.preview_url && (
                                <button onClick={e => playPreview(v.preview_url, v.voice_id, e)}
                                  style={{ background: previewingVoice === v.voice_id ? 'rgba(212,168,67,0.2)' : 'rgba(255,255,255,0.04)', border: `1px solid ${previewingVoice === v.voice_id ? '#D4A843' : 'rgba(255,255,255,0.1)'}`, borderRadius: 6, color: previewingVoice === v.voice_id ? '#D4A843' : '#6B4FA8', fontSize: '0.7rem', padding: '3px 8px', cursor: 'pointer' }}>
                                  {previewingVoice === v.voice_id ? '■' : '▶'}
                                </button>
                              )}
                              <button onClick={e => { e.stopPropagation(); toggleFavorite(v.voice_id); }}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', padding: 0, color: favorites.includes(v.voice_id) ? '#D4A843' : '#2D1B4E' }}>
                                {favorites.includes(v.voice_id) ? '♥' : '♡'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Generate Voice button */}
                {!voiceReady ? (
                  <button
                    onClick={generateVoice}
                    disabled={voiceGenerating || !selectedVoice}
                    style={{
                      width: '100%', padding: '16px', borderRadius: 12,
                      border: '1px solid #2D1B4E',
                      background: voiceGenerating || !selectedVoice ? '#1A0A2E' : 'linear-gradient(135deg,#3B1A6B,#6B2FA0)',
                      color: voiceGenerating || !selectedVoice ? '#4A3060' : '#E8DEFF',
                      fontWeight: 700, fontSize: '0.9rem', cursor: voiceGenerating || !selectedVoice ? 'not-allowed' : 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    {voiceGenerating ? '⏳ Generating voice…' : '🎙 Generate Voice →'}
                  </button>
                ) : (
                  <div style={{ borderRadius: 10, padding: '10px 14px', background: 'rgba(192,132,252,0.08)', border: '1px solid rgba(192,132,252,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ color: '#C084FC', fontWeight: 600, fontSize: '0.875rem' }}>✓ Voice ready</span>
                    <button onClick={() => { setVoiceReady(false); setVoiceAudioBase64(null); }}
                      style={{ background: 'none', border: 'none', color: '#6B4FA8', fontSize: '0.75rem', cursor: 'pointer' }}>
                      Change
                    </button>
                  </div>
                )}

                {/* Combine button — shown when clips/video AND voice are both ready */}
                {(clipUrls.length > 0 || videoUrl) && voiceReady && (
                  <button
                    onClick={combineVideoVoice}
                    disabled={combining}
                    style={{
                      width: '100%', padding: '20px', borderRadius: 16, border: 'none',
                      background: combining ? 'rgba(212,168,67,0.3)' : 'linear-gradient(135deg,#D4A843 0%,#F0C855 50%,#C8922A 100%)',
                      color: '#0D0010', fontWeight: 800, fontSize: '1rem', letterSpacing: '0.04em',
                      cursor: combining ? 'not-allowed' : 'pointer',
                      boxShadow: combining ? 'none' : '0 4px 24px rgba(212,168,67,0.45)',
                      animation: combining ? 'none' : 'metalShimmer 3s linear infinite',
                      backgroundSize: '200% auto',
                    }}
                  >
                    {combining ? '⏳ Combining…' : '✦ Combine Video + Voice →'}
                  </button>
                )}
              </div>
            )}

            {/* ── 6. Final combined video ── */}
            {finalVideo ? (
              <div ref={finalVideoRef} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {/* Success banner */}
                <div style={{
                  borderRadius: 12, padding: '12px 16px',
                  background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.35)',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <span style={{ fontSize: 18 }}>✓</span>
                  <div>
                    <p style={{ color: '#D4A843', fontWeight: 700, fontSize: '0.9rem', margin: 0 }}>Your video is ready!</p>
                    <p style={{ color: '#8B6FA8', fontSize: '0.75rem', margin: '2px 0 0' }}>Saved to My Videos automatically</p>
                  </div>
                </div>

                {/* Video player */}
                <video
                  src={finalVideo}
                  controls
                  autoPlay
                  playsInline
                  style={{ width: '100%', borderRadius: 16, background: '#000', maxHeight: 600 }}
                />

                {/* Gold download button */}
                <a
                  href={finalVideo}
                  download={`omnyra-${toolId}-${Date.now()}.mp4`}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                    width: '100%', padding: '18px', borderRadius: 14, textDecoration: 'none',
                    background: 'linear-gradient(135deg, #D4A843 0%, #F0C855 50%, #C8922A 100%)',
                    color: '#0D0010', fontWeight: 800, fontSize: '1rem', letterSpacing: '0.04em',
                    boxShadow: '0 4px 24px rgba(212,168,67,0.4)',
                  }}
                >
                  ⬇ Download Video
                </a>

                {/* Create another */}
                <button
                  onClick={() => {
                    setFinalVideo(null);
                    setClipUrls([]);
                    setVideoUrl(null);
                    setVideoStarted(false);
                    setVideoStatus('');
                    setVideoProgress(0);
                    setStitching(false);
                  }}
                  style={{
                    width: '100%', padding: '14px', borderRadius: 12,
                    background: 'transparent', border: '1px solid #2D1B4E',
                    color: '#8B6FA8', fontSize: '0.875rem', cursor: 'pointer',
                  }}
                >
                  ↺ Generate Another Video
                </button>
              </div>
            ) : (clipUrls.length > 0 || videoUrl) ? (
              <button
                onClick={generateFinal}
                disabled={stitching}
                style={{
                  width: '100%', padding: '20px', borderRadius: 16,
                  background: 'linear-gradient(105deg, #5A3400 0%, #9A7010 20%, #CFA42F 42%, #E8C84A 50%, #CFA42F 58%, #9A7010 80%, #5A3400 100%)',
                  backgroundSize: '200% auto',
                  animation: stitching ? 'none' : 'metalShimmer 3s linear infinite',
                  color: '#0D0010', fontWeight: 700, fontSize: '0.875rem',
                  border: 'none', cursor: stitching ? 'not-allowed' : 'pointer',
                  boxShadow: '0 0 24px rgba(207,164,47,0.35)',
                  opacity: stitching ? 0.5 : 1,
                }}
              >
                {stitching ? 'Stitching with Railway…' : 'Generate Final Video ✨'}
              </button>
            ) : videoStarted ? (
              <button
                disabled
                style={{
                  width: '100%', padding: '20px', borderRadius: 16,
                  background: 'linear-gradient(105deg, #5A3400 0%, #9A7010 20%, #CFA42F 42%, #E8C84A 50%, #CFA42F 58%, #9A7010 80%, #5A3400 100%)',
                  backgroundSize: '200% auto',
                  color: '#0D0010', fontWeight: 700, fontSize: '0.875rem',
                  border: 'none', cursor: 'not-allowed',
                  boxShadow: '0 0 24px rgba(207,164,47,0.35)',
                  opacity: 0.5,
                }}
              >
                Rendering… {videoStatus}
              </button>
            ) : (
              <button
                onClick={startVideoGeneration}
                style={{
                  width: '100%', padding: '20px', borderRadius: 16,
                  background: 'linear-gradient(105deg, #5A3400 0%, #9A7010 20%, #CFA42F 42%, #E8C84A 50%, #CFA42F 58%, #9A7010 80%, #5A3400 100%)',
                  backgroundSize: '200% auto',
                  animation: 'metalShimmer 3s linear infinite',
                  color: '#0D0010', fontWeight: 700, fontSize: '0.875rem',
                  border: 'none', cursor: 'pointer',
                  boxShadow: '0 0 24px rgba(207,164,47,0.35)',
                }}
              >
                Generate Video →
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
