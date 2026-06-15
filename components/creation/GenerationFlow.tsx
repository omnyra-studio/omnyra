'use client';

import { useState, useEffect, useRef } from 'react';

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

// Steps: 1=Prompt, 2=Scenes, 3=Confirm, 4=Voice
const STEP_LABELS = ['Prompt', 'Scenes', 'Confirm', 'Voice'];

export default function GenerationFlow({ toolId, toolName, modelOverride, scriptOnly }: Props) {
  const totalSteps = scriptOnly ? 2 : 4;

  const [step,            setStep]            = useState(1);
  const [prompt,          setPrompt]          = useState('');
  const [enhancedPrompt,  setEnhancedPrompt]  = useState('');
  const [loadingState,    setLoadingState]    = useState('');
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

  // ── Step 1 → 2: silent Ghost Test enhancement then concept + image generation ──
  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoadingState('Analysing your scene…');

    // 1. Silent Ghost Test: enhance the prompt
    let ghostEnhanced = prompt;
    try {
      const ghostRes  = await fetch('/api/ghost-test-score', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ prompt }),
      });
      const ghostData = await ghostRes.json();
      ghostEnhanced   = ghostData.enhancedPrompt ?? prompt;
    } catch {}
    setEnhancedPrompt(ghostEnhanced);

    // 2. Generate 4 concepts with images
    setLoadingState('Generating your scenes…');
    try {
      const res  = await fetch('/api/generate-concepts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ prompt: ghostEnhanced, toolId }),
      });
      const data = await res.json();
      setConcepts(data.concepts ?? []);
      setStep(2);
    } catch {
      setLoadingState('');
    }
    setLoadingState('');
  };

  // ── Step 3 → 4: start video generation in background while user picks voice ──
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
          script:  selectedConcept?.description,
        }),
      });
      const data = await res.json();
      setFinalVideo(data.outputUrl ?? videoUrl);
    } catch { setFinalVideo(videoUrl); }
    finally { setStitching(false); }
  };

  const estTime = modelOverride === 'hedra' ? '~2 min' : modelOverride === 'pika' ? '~90s' : '~4 min';
  const isLoading = !!loadingState;

  return (
    <div className="max-w-2xl mx-auto">

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-10 flex-wrap">
        {STEP_LABELS.slice(0, totalSteps).map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all"
              style={{
                background:  step === i + 1 ? '#C084FC' : step > i + 1 ? '#3B1F6A' : '#0D0020',
                color:       step === i + 1 ? '#000' : step > i + 1 ? '#C084FC' : '#6B21A8',
                border:      step <= i + 1 ? '1px solid #3B1F6A' : 'none',
              }}
            >
              {step > i + 1 ? '✓' : i + 1}
            </div>
            <span className="text-xs font-medium" style={{ color: step === i + 1 ? '#C084FC' : '#6B21A8' }}>
              {label}
            </span>
            {i < totalSteps - 1 && <div className="w-6 h-px mx-1" style={{ background: '#1A0A2E' }} />}
          </div>
        ))}
      </div>

      {/* ── STEP 1: Prompt (Ghost Test runs silently) ────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-5">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">{toolName}</h2>
            <p className="text-sm" style={{ color: '#A89BAF' }}>Understand emotion deeply. Show it visually.</p>
          </div>

          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Describe your scene or story..."
            rows={7}
            disabled={isLoading}
            className="w-full rounded-2xl border outline-none p-5 text-sm text-white placeholder:text-purple-800 resize-y transition-colors disabled:opacity-60"
            style={{ background: '#1A0A2E', borderColor: '#2D1B4E', fontFamily: 'inherit' }}
            onFocus={e => { e.currentTarget.style.borderColor = '#C084FC'; }}
            onBlur={e => { e.currentTarget.style.borderColor = '#2D1B4E'; }}
          />

          {isLoading && (
            <div className="rounded-xl px-4 py-3 flex items-center gap-3" style={{ background: '#1A0A2E', border: '1px solid #2D1B4E' }}>
              <div className="w-4 h-4 rounded-full border-2 border-t-[#C084FC] border-[#2D1B4E] animate-spin" />
              <span className="text-sm" style={{ color: '#A89BAF' }}>{loadingState}</span>
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={!prompt.trim() || isLoading}
            className="w-full py-4 rounded-2xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(105deg, #5A3400 0%, #9A7010 20%, #CFA42F 42%, #E8C84A 50%, #CFA42F 58%, #9A7010 80%, #5A3400 100%)',
              backgroundSize: '200% auto',
              animation: 'metalShimmer 3s linear infinite',
              color: '#0D0010',
              fontWeight: 700,
              boxShadow: '0 0 16px rgba(207,164,47,0.3)',
            }}
          >
            {isLoading ? loadingState : 'Generate Scenes →'}
          </button>
        </div>
      )}

      {/* ── STEP 2: Scene image cards (2×2 grid) ────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-white mb-1">Choose your scene</h2>
            <p className="text-sm" style={{ color: '#A89BAF' }}>Select one concept to build your video from.</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {concepts.map((c, i) => (
              <div
                key={i}
                onClick={() => setSelectedConcept(c)}
                className="relative cursor-pointer rounded-2xl overflow-hidden transition-all duration-200"
                style={{
                  aspectRatio:  '9/16',
                  outline:      selectedConcept === c ? '3px solid #C084FC' : '2px solid transparent',
                  boxShadow:    selectedConcept === c ? '0 0 24px rgba(192,132,252,0.5)' : 'none',
                  background:   '#0D0020',
                }}
              >
                {/* Image */}
                {c.imageUrl ? (
                  <img
                    src={c.imageUrl}
                    alt={c.title}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-3xl animate-pulse opacity-30">🎬</div>
                  </div>
                )}

                {/* Gradient overlay */}
                <div className="absolute inset-0" style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.2) 50%, transparent 100%)' }} />

                {/* Ghost Score badge */}
                <div
                  className="absolute top-2 right-2 text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(0,0,0,0.7)', color: '#C084FC', border: '1px solid rgba(192,132,252,0.4)' }}
                >
                  👻 {c.ghostScore}
                </div>

                {/* Selected checkmark */}
                {selectedConcept === c && (
                  <div
                    className="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: '#C084FC', color: '#000' }}
                  >
                    ✓
                  </div>
                )}

                {/* Title */}
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="text-xs font-semibold text-white leading-tight">{c.title}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => { setStep(1); setConcepts([]); setSelectedConcept(null); }}
              className="flex-1 py-3 rounded-xl text-sm transition-colors"
              style={{ background: 'transparent', border: '1px solid #2D1B4E', color: '#A89BAF' }}
            >
              ← Back
            </button>
            {scriptOnly ? (
              <button
                disabled={!selectedConcept}
                className="flex-1 py-3 rounded-xl font-semibold text-sm text-white disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #C084FC, #E879F9)' }}
              >
                Export Script ✓
              </button>
            ) : (
              <button
                onClick={() => { if (selectedConcept) setStep(3); }}
                disabled={!selectedConcept}
                className="flex-1 py-3 rounded-xl font-semibold text-sm text-white disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
                style={{ background: 'linear-gradient(135deg, #C084FC, #E879F9)' }}
              >
                Build This Scene →
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── STEP 3: Confirm selected image ──────────────────────────────────────── */}
      {step === 3 && selectedConcept && (
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-white mb-1">{selectedConcept.title}</h2>
            <p className="text-xs leading-relaxed" style={{ color: '#A89BAF' }}>{selectedConcept.description}</p>
          </div>

          <div
            className="relative mx-auto rounded-2xl overflow-hidden"
            style={{ aspectRatio: '9/16', maxWidth: 260, background: '#0D0020' }}
          >
            {selectedConcept.imageUrl ? (
              <img src={selectedConcept.imageUrl} alt={selectedConcept.title} className="absolute inset-0 w-full h-full object-cover" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-4xl animate-pulse opacity-30">🎬</div>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep(2)}
              className="flex-1 py-3 rounded-xl text-sm transition-colors"
              style={{ background: 'transparent', border: '1px solid #2D1B4E', color: '#A89BAF' }}
            >
              ↺ Choose Different Scene
            </button>
            <button
              onClick={handleConfirmAndStartVideo}
              className="flex-1 py-3 rounded-xl font-semibold text-sm text-white hover:brightness-110 transition-all"
              style={{ background: 'linear-gradient(135deg, #C084FC, #E879F9)' }}
            >
              Add Voice & Generate →
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Voice + Stitch (video generates in background) ─────────────── */}
      {step === 4 && (
        <div className="space-y-6">

          {/* Video status bar */}
          {!videoUrl && (
            <div className="rounded-2xl border p-4" style={{ background: '#1A0A2E', borderColor: '#2D1B4E' }}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium" style={{ color: '#A89BAF' }}>
                  🎬 Video Rendering
                </span>
                <span className="text-xs" style={{ color: '#C084FC' }}>{videoStatus}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: '#0D0020' }}>
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{ width: `${videoProgress}%`, background: 'linear-gradient(90deg, #C084FC, #E879F9)' }}
                />
              </div>
              <p className="text-xs mt-2" style={{ color: '#6B21A8' }}>Estimated: {estTime} — pick your voice while you wait</p>
            </div>
          )}

          {videoUrl && (
            <div className="rounded-2xl overflow-hidden">
              <video src={videoUrl} controls className="w-full rounded-2xl" />
            </div>
          )}

          {/* Voice Library */}
          <div className="rounded-2xl border p-5" style={{ background: '#1A0A2E', borderColor: '#2D1B4E' }}>
            <h3 className="text-sm font-semibold text-white mb-4">Choose your voice</h3>
            <div className="grid grid-cols-2 gap-3">
              {VOICES.map(v => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVoice(v.id)}
                  className="rounded-xl p-3 border text-left transition-all"
                  style={{
                    background:  selectedVoice === v.id ? 'rgba(192,132,252,0.1)' : '#0D0020',
                    borderColor: selectedVoice === v.id ? '#C084FC' : '#1A0A2E',
                  }}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-sm font-medium text-white">{v.name}</span>
                    <button
                      onClick={e => { e.stopPropagation(); toggleFavorite(v.id); }}
                      className="text-sm leading-none"
                    >
                      {favorites.includes(v.id) ? '❤️' : '🤍'}
                    </button>
                  </div>
                  <span className="text-xs" style={{ color: '#6B21A8' }}>{v.accent}</span>
                </button>
              ))}
            </div>
          </div>

          <div
            className="rounded-xl border px-4 py-2.5 flex items-center gap-2"
            style={{ background: '#0D0020', borderColor: '#1A0A2E' }}
          >
            <span className="text-xs" style={{ color: '#6B21A8' }}>Arc:</span>
            <span className="text-xs font-medium" style={{ color: '#A89BAF' }}>rising-tension — voice settings auto-tuned</span>
          </div>

          {finalVideo ? (
            <div className="space-y-4">
              <video src={finalVideo} controls className="w-full rounded-2xl" />
              <a
                href={finalVideo}
                download
                className="block w-full py-3 rounded-xl text-center text-sm font-medium transition-colors"
                style={{ border: '1px solid #2D1B4E', color: '#A89BAF' }}
              >
                Download ↓
              </a>
            </div>
          ) : (
            <button
              onClick={generateFinal}
              disabled={stitching || (!videoUrl && videoStarted)}
              className="w-full py-5 rounded-2xl font-semibold text-sm text-white disabled:opacity-50 transition-all"
              style={{
                background:     'linear-gradient(105deg, #5A3400 0%, #9A7010 20%, #CFA42F 42%, #E8C84A 50%, #CFA42F 58%, #9A7010 80%, #5A3400 100%)',
                backgroundSize: '200% auto',
                animation:      (!videoUrl && videoStarted) ? 'none' : 'metalShimmer 3s linear infinite',
                color:          '#0D0010',
                fontWeight:     700,
                boxShadow:      '0 0 24px rgba(207,164,47,0.35)',
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
