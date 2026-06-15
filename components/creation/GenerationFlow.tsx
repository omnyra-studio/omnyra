'use client';

import { useState, useEffect, useRef } from 'react';

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
}

const VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', accent: 'American · Warm' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella',  accent: 'American · Soft' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi',   accent: 'American · Bold' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh',   accent: 'American · Deep' },
];

const STEP_LABELS = ['Prompt', 'Script', 'Scenes', 'Voice'];

export default function GenerationFlow({ toolId, toolName, modelOverride, scriptOnly }: Props) {
  const totalSteps = scriptOnly ? 2 : 4;

  const [step,            setStep]            = useState(1);
  const [prompt,          setPrompt]          = useState('');
  const [lightningMode,   setLightningMode]   = useState(false);
  const [loadingState,    setLoadingState]    = useState('');

  const [scripts,         setScripts]         = useState<VersionResult[]>([]);
  const [selectedScript,  setSelectedScript]  = useState<VersionResult | null>(null);
  const [scriptError,     setScriptError]     = useState('');

  const [concepts,        setConcepts]        = useState<Concept[]>([]);
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(null);

  const [videoUrl,        setVideoUrl]        = useState<string | null>(null);
  const [videoStatus,     setVideoStatus]     = useState('');
  const [videoProgress,   setVideoProgress]   = useState(0);
  const [videoStarted,    setVideoStarted]    = useState(false);
  const [selectedVoice,   setSelectedVoice]   = useState(VOICES[0].id);
  const [favorites,       setFavorites]       = useState<string[]>([]);
  const [stitching,       setStitching]       = useState(false);
  const [finalVideo,      setFinalVideo]      = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('omnyra_voice_favorites');
      if (stored) setFavorites(JSON.parse(stored));
    } catch {}
  }, []);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const toggleFavorite = (id: string) => {
    setFavorites(prev => {
      const next = prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id];
      try { localStorage.setItem('omnyra_voice_favorites', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // ── Step 1 → 2: silent Ghost Test, then generate brief/script ───────────────
  const handleGenerateScript = async () => {
    if (!prompt.trim()) return;
    setLoadingState('Analysing your scene…');

    let ghostEnhanced = prompt;
    try {
      const ghostRes  = await fetch('/api/ghost-test-score', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ prompt }),
      });
      const ghostData = await ghostRes.json();
      ghostEnhanced   = ghostData.enhancedPrompt ?? prompt;
    } catch {}

    setLoadingState('Writing your scripts…');
    try {
      const res  = await fetch('/api/generate-brief-sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ goal: ghostEnhanced, toolId, niche: toolId, lightningMode }),
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
      setStep(2);
    } catch (e) {
      setScriptError('Network error — please try again.');
    }
    setLoadingState('');
  };

  // ── Step 2 → 3: generate scene images from selected script ──────────────────
  const handleGenerateScenes = async () => {
    if (!selectedScript) return;
    setLoadingState('Generating your scenes…');
    try {
      const res  = await fetch('/api/generate-concepts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({
          prompt: `${selectedScript.hook}\n\n${selectedScript.script}`,
          toolId,
          lightningMode,
        }),
      });
      const data = await res.json();
      setConcepts(data.concepts ?? []);
      setSelectedConcept(null);
      setStep(3);
    } catch {}
    setLoadingState('');
  };

  const handleConfirmAndStartVideo = () => {
    setStep(4);
    startVideoGeneration();
  };

  const startVideoGeneration = async () => {
    if (!selectedConcept) return;
    setVideoStarted(true);
    setVideoStatus('Queued');
    setVideoProgress(5);
    try {
      const res  = await fetch('/api/generate-video', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({
          prompt:        selectedConcept.description,
          selectedModel: modelOverride ?? 'kling',
          toolId,
        }),
      });
      const data = await res.json();
      if (data.videoUrl) {
        setVideoUrl(data.videoUrl);
        setVideoStatus('Ready');
        setVideoProgress(100);
      } else if (data.jobId) {
        startPolling(data.jobId);
      }
    } catch {
      setVideoStatus('Error — tap Generate to retry');
    }
  };

  const startPolling = (jobId: string) => {
    const statuses = ['Queued', 'Processing', 'Rendering', 'Almost done…'];
    let tick = 0;
    pollRef.current = setInterval(async () => {
      tick++;
      setVideoStatus(statuses[Math.min(tick, statuses.length - 1)]);
      setVideoProgress(Math.min(10 + tick * 18, 90));
      try {
        const res  = await fetch(`/api/video-status?jobId=${jobId}`);
        const data = await res.json();
        if (data.status === 'complete' && data.videoUrl) {
          clearInterval(pollRef.current!);
          setVideoUrl(data.videoUrl);
          setVideoStatus('Ready');
          setVideoProgress(100);
        }
      } catch {}
    }, 5000);
  };

  const generateFinal = async () => {
    setStitching(true);
    try {
      const res  = await fetch('/api/merge-video-audio', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({
          videoUrl,
          voiceId: selectedVoice,
          script:  selectedScript?.script ?? selectedConcept?.description,
        }),
      });
      const data = await res.json();
      setFinalVideo(data.outputUrl ?? videoUrl);
    } catch { setFinalVideo(videoUrl); }
    finally { setStitching(false); }
  };

  const estTime   = modelOverride === 'hedra' ? '~2 min' : modelOverride === 'pika' ? '~90s' : '~4 min';
  const isLoading = !!loadingState;

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>

      {/* ── Step indicator ────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 40, flexWrap: 'wrap' }}>
        {STEP_LABELS.slice(0, totalSteps).map((label, i) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700,
              background:  step === i + 1 ? '#C084FC' : step > i + 1 ? '#3B1F6A' : '#0D0020',
              color:       step === i + 1 ? '#000' : step > i + 1 ? '#C084FC' : '#9370DB',
              border:      step <= i + 1 ? '1px solid #4C1D95' : 'none',
            }}>
              {step > i + 1 ? '✓' : i + 1}
            </div>
            <span style={{
              fontSize: 12, fontWeight: 500,
              color: step === i + 1 ? '#E8DEFF' : step > i + 1 ? '#C084FC' : '#9370DB',
            }}>
              {label}
            </span>
            {i < totalSteps - 1 && (
              <div style={{ width: 24, height: 1, background: '#2D1B4E', margin: '0 4px' }} />
            )}
          </div>
        ))}
      </div>

      {/* ── STEP 1: Prompt ───────────────────────────────────────────────────── */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <h2 style={{ color: '#F5EFE6', fontWeight: 700, fontSize: '1.5rem', marginBottom: 6 }}>{toolName}</h2>
            <p style={{ color: '#B09FC0', fontSize: '0.875rem' }}>Understand emotion deeply. Show it visually.</p>
          </div>

          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Describe your scene or story..."
            rows={7}
            disabled={isLoading}
            className="omnyra-textarea"
            style={{
              width: '100%', borderRadius: 16, padding: '20px',
              fontSize: '0.875rem', resize: 'vertical',
              border: '1px solid #4C1D95', outline: 'none',
              fontFamily: 'inherit', caretColor: '#C084FC',
              transition: 'border-color 0.2s', boxSizing: 'border-box',
              opacity: isLoading ? 0.6 : 1,
            }}
            onFocus={e => { e.currentTarget.style.borderColor = '#C084FC'; }}
            onBlur={e => { e.currentTarget.style.borderColor = '#4C1D95'; }}
          />

          {/* ⚡ Lightning Mode */}
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
            <div style={{ borderRadius: 12, padding: '12px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#FCA5A5', fontSize: '0.875rem' }}>
              {scriptError}
            </div>
          )}

          {isLoading && (
            <div style={{ borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, background: '#1A0A2E', border: '1px solid #2D1B4E' }}>
              <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #2D1B4E', borderTopColor: '#C084FC', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
              <span style={{ color: '#B09FC0', fontSize: '0.875rem' }}>{loadingState}</span>
            </div>
          )}

          <button
            onClick={handleGenerateScript}
            disabled={!prompt.trim() || isLoading}
            style={{
              width: '100%', padding: '16px', borderRadius: 16,
              background: 'linear-gradient(105deg, #5A3400 0%, #9A7010 20%, #CFA42F 42%, #E8C84A 50%, #CFA42F 58%, #9A7010 80%, #5A3400 100%)',
              backgroundSize: '200% auto',
              animation: 'metalShimmer 3s linear infinite',
              color: '#0D0010', fontWeight: 700, fontSize: '0.875rem',
              border: 'none', cursor: 'pointer',
              boxShadow: '0 0 16px rgba(207,164,47,0.3)',
              opacity: (!prompt.trim() || isLoading) ? 0.4 : 1,
            }}
          >
            {isLoading ? loadingState : 'Generate Script →'}
          </button>
        </div>
      )}

      {/* ── STEP 2: Script version tabs + viral analytics ─────────────────────── */}
      {step === 2 && (
        <div style={{ maxWidth: 760, margin: '0 auto' }}>

          {/* Header */}
          <h1 style={{
            textAlign: 'center', color: '#F0A500', fontWeight: 800,
            fontSize: 'clamp(1.4rem, 4vw, 2.2rem)', letterSpacing: '0.15em',
            textTransform: 'uppercase', marginBottom: 16,
          }}>
            {toolName}
          </h1>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 8 }}>
            <p style={{ color: '#A89BAF', fontSize: '0.9rem', margin: 0 }}>
              Brief for: <span style={{ color: '#C4B5D0' }}>{prompt.length > 60 ? prompt.slice(0, 60) + '…' : prompt}</span>
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setStep(1)}
                style={{
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.3)',
                  color: '#F5EFE6', borderRadius: 999, padding: '6px 16px',
                  fontSize: '0.85rem', cursor: 'pointer',
                }}
              >
                Edit
              </button>
              <button
                onClick={() => { setStep(1); setPrompt(''); setScripts([]); setSelectedScript(null); }}
                style={{
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.3)',
                  color: '#F5EFE6', borderRadius: 999, padding: '6px 16px',
                  fontSize: '0.85rem', cursor: 'pointer',
                }}
              >
                New Project
              </button>
            </div>
          </div>

          {/* Version tabs */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 28 }}>
            {scripts.map((v, i) => (
              <button
                key={i}
                onClick={() => setSelectedScript(v)}
                style={{
                  background:  selectedScript === v ? 'rgba(240,165,0,0.1)' : 'rgba(255,255,255,0.05)',
                  border:      selectedScript === v ? '1px solid #F0A500' : '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 999, padding: '10px 20px',
                  color: '#F5EFE6', cursor: 'pointer', fontSize: '0.9rem',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                <span>Version</span>
                <span style={{ color: '#F0A500', fontWeight: 700 }}>{v.viral_score}/100</span>
              </button>
            ))}
            <button
              onClick={handleGenerateScript}
              style={{
                background: 'transparent', border: 'none',
                color: '#F0A500', fontSize: '0.9rem', cursor: 'pointer',
                textDecoration: 'underline', padding: '10px 8px',
              }}
            >
              Generate 5 more →
            </button>
          </div>

          {/* Loading indicator */}
          {isLoading && (
            <div style={{ borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', marginBottom: 16 }}>
              <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#F0A500', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
              <span style={{ color: '#A89BAF', fontSize: '0.875rem' }}>{loadingState}</span>
            </div>
          )}

          {/* Selected version content */}
          {selectedScript && (
            <>
              {/* Viral Analytics card */}
              <div style={{
                background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16,
                padding: '28px 32px', marginBottom: 16,
              }}>
                <p style={{
                  textAlign: 'center', color: '#F0A500', fontSize: '0.7rem',
                  letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 24,
                }}>
                  Viral Analytics
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, textAlign: 'center' }}>
                  <div>
                    <p style={{ color: '#6B7280', fontSize: '0.65rem', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 8 }}>Viral Potential</p>
                    <p style={{ color: '#F0A500', fontSize: '2.5rem', fontWeight: 800, lineHeight: 1, margin: 0 }}>{selectedScript.viral_score}</p>
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

              {/* Script content card */}
              <div style={{
                background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16,
                padding: '28px 32px', marginBottom: 20,
              }}>
                {selectedScript.title && (
                  <p style={{
                    textAlign: 'center', color: '#F0A500', fontSize: '0.7rem',
                    letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 20,
                  }}>
                    {selectedScript.title}
                  </p>
                )}
                <p style={{
                  color: '#F0A500', fontSize: '1.25rem', fontWeight: 600,
                  lineHeight: 1.6, marginBottom: 16,
                }}>
                  "{selectedScript.hook}"
                </p>
                {selectedScript.script && (
                  <p style={{ color: '#C4B5D0', fontSize: '0.9rem', lineHeight: 1.7, margin: 0 }}>
                    {selectedScript.script}
                  </p>
                )}
              </div>

              {/* CTA */}
              {scriptOnly ? (
                <button style={{
                  width: '100%', padding: '18px',
                  background: '#F0A500', color: '#0D0010',
                  fontWeight: 700, fontSize: '1rem', letterSpacing: '0.05em',
                  border: 'none', borderRadius: 14, cursor: 'pointer',
                }}>
                  ✓ Export Script
                </button>
              ) : (
                <button
                  onClick={handleGenerateScenes}
                  disabled={isLoading}
                  style={{
                    width: '100%', padding: '18px',
                    background: '#F0A500', color: '#0D0010',
                    fontWeight: 700, fontSize: '1rem', letterSpacing: '0.05em',
                    border: 'none', borderRadius: 14, cursor: isLoading ? 'not-allowed' : 'pointer',
                    opacity: isLoading ? 0.6 : 1,
                  }}
                >
                  {isLoading ? loadingState : '✓ Version Selected — Build Scenes →'}
                </button>
              )}
            </>
          )}
        </div>
      )}

      {/* ── STEP 3: Scene image cards (2×2 grid) ─────────────────────────────── */}
      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <h2 style={{ color: '#F5EFE6', fontWeight: 700, fontSize: '1.25rem', marginBottom: 6 }}>Choose your scene</h2>
            <p style={{ color: '#B09FC0', fontSize: '0.875rem' }}>Select one image to build your video from.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {concepts.map((c, i) => (
              <div
                key={i}
                onClick={() => setSelectedConcept(c)}
                style={{
                  position: 'relative', cursor: 'pointer', borderRadius: 16,
                  overflow: 'hidden', aspectRatio: '9/16',
                  outline:    selectedConcept === c ? '3px solid #C084FC' : '2px solid transparent',
                  boxShadow:  selectedConcept === c ? '0 0 24px rgba(192,132,252,0.5)' : 'none',
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

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => { setStep(2); setConcepts([]); setSelectedConcept(null); }}
              style={{
                flex: 1, padding: '12px', borderRadius: 12, fontSize: '0.875rem',
                background: 'transparent', border: '1px solid #2D1B4E', color: '#B09FC0', cursor: 'pointer',
              }}
            >
              ← Back
            </button>
            <button
              onClick={() => { if (selectedConcept) handleConfirmAndStartVideo(); }}
              disabled={!selectedConcept}
              style={{
                flex: 1, padding: '12px', borderRadius: 12, fontSize: '0.875rem',
                fontWeight: 700, background: 'linear-gradient(135deg, #C084FC, #E879F9)',
                color: '#fff', border: 'none',
                cursor: selectedConcept ? 'pointer' : 'not-allowed',
                opacity: selectedConcept ? 1 : 0.4,
              }}
            >
              Add Voice & Generate →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Voice + Final generation ─────────────────────────────────── */}
      {step === 4 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {!videoUrl && (
            <div style={{ borderRadius: 16, border: '1px solid #2D1B4E', padding: 16, background: '#1A0A2E' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ color: '#B09FC0', fontSize: '0.75rem', fontWeight: 500 }}>🎬 Video Rendering</span>
                <span style={{ color: '#C084FC', fontSize: '0.75rem' }}>{videoStatus}</span>
              </div>
              <div style={{ height: 6, borderRadius: 999, overflow: 'hidden', background: '#0D0020' }}>
                <div style={{ height: '100%', borderRadius: 999, width: `${videoProgress}%`, background: 'linear-gradient(90deg, #C084FC, #E879F9)', transition: 'width 1s' }} />
              </div>
              <p style={{ color: '#6B4FA8', fontSize: '0.75rem', marginTop: 8, marginBottom: 0 }}>Estimated: {estTime} — pick your voice while you wait</p>
            </div>
          )}

          {videoUrl && (
            <div style={{ borderRadius: 16, overflow: 'hidden' }}>
              <video src={videoUrl} controls style={{ width: '100%', borderRadius: 16 }} />
            </div>
          )}

          {selectedScript && (
            <div style={{ borderRadius: 12, border: '1px solid #2D1B4E', padding: 16, background: '#1A0A2E' }}>
              <p style={{ color: '#F0A500', fontSize: '0.8rem', fontWeight: 600, marginBottom: 8 }}>"{selectedScript.hook}"</p>
              <p style={{ color: '#B09FC0', fontSize: '0.8rem', lineHeight: 1.6, margin: 0 }}>{selectedScript.script}</p>
            </div>
          )}

          {/* Voice Library */}
          <div style={{ borderRadius: 16, border: '1px solid #2D1B4E', padding: 20, background: '#1A0A2E' }}>
            <h3 style={{ color: '#E8DEFF', fontSize: '0.875rem', fontWeight: 600, marginBottom: 16 }}>Choose your voice</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {VOICES.map(v => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVoice(v.id)}
                  style={{
                    borderRadius: 12, padding: 12, textAlign: 'left', cursor: 'pointer',
                    background:  selectedVoice === v.id ? 'rgba(192,132,252,0.1)' : '#0D0020',
                    border:      `1px solid ${selectedVoice === v.id ? '#C084FC' : '#1A0A2E'}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ color: '#E8DEFF', fontSize: '0.875rem', fontWeight: 500 }}>{v.name}</span>
                    <button
                      onClick={e => { e.stopPropagation(); toggleFavorite(v.id); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.875rem', padding: 0 }}
                    >
                      {favorites.includes(v.id) ? '❤️' : '🤍'}
                    </button>
                  </div>
                  <span style={{ color: '#9370DB', fontSize: '0.75rem' }}>{v.accent}</span>
                </button>
              ))}
            </div>
          </div>

          {finalVideo ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <video src={finalVideo} controls style={{ width: '100%', borderRadius: 16 }} />
              <a
                href={finalVideo}
                download
                style={{
                  display: 'block', width: '100%', padding: '12px', borderRadius: 12,
                  textAlign: 'center', fontSize: '0.875rem', fontWeight: 500, textDecoration: 'none',
                  border: '1px solid #2D1B4E', color: '#B09FC0',
                }}
              >
                Download ↓
              </a>
            </div>
          ) : (
            <button
              onClick={generateFinal}
              disabled={stitching || (!videoUrl && videoStarted)}
              style={{
                width: '100%', padding: '20px', borderRadius: 16,
                background: 'linear-gradient(105deg, #5A3400 0%, #9A7010 20%, #CFA42F 42%, #E8C84A 50%, #CFA42F 58%, #9A7010 80%, #5A3400 100%)',
                backgroundSize: '200% auto',
                animation: (!videoUrl && videoStarted) ? 'none' : 'metalShimmer 3s linear infinite',
                color: '#0D0010', fontWeight: 700, fontSize: '0.875rem',
                border: 'none', cursor: (stitching || (!videoUrl && videoStarted)) ? 'not-allowed' : 'pointer',
                boxShadow: '0 0 24px rgba(207,164,47,0.35)',
                opacity: (stitching || (!videoUrl && videoStarted)) ? 0.5 : 1,
              }}
            >
              {stitching
                ? 'Stitching…'
                : (!videoUrl && videoStarted)
                  ? `Waiting for video… ${videoStatus}`
                  : 'Generate Final Video ✨'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
