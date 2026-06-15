'use client';

import { useState, useEffect, useRef } from 'react';

interface Concept {
  title: string;
  description: string;
  ghostScore: number;
}

interface Props {
  toolId: string;
  toolName: string;
  modelOverride?: string;
  scriptOnly?: boolean;
}

const VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', accent: 'American' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella',  accent: 'American' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi',   accent: 'American' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh',   accent: 'American' },
];

const STEP_LABELS = ['Prompt', 'Concepts', 'Image', 'Video', 'Voice'];

function scoreColor(s: number) {
  if (s < 40) return '#EF4444';
  if (s < 70) return '#F59E0B';
  return '#22C55E';
}

export default function GenerationFlow({ toolId, toolName, modelOverride, scriptOnly }: Props) {
  const totalSteps = scriptOnly ? 2 : 5;

  const [step,            setStep]            = useState(1);
  const [prompt,          setPrompt]          = useState('');
  const [ghostScore,      setGhostScore]      = useState<number | null>(null);
  const [ghostFeedback,   setGhostFeedback]   = useState('');
  const [scoringPrompt,   setScoringPrompt]   = useState(false);
  const [guidanceOpen,    setGuidanceOpen]    = useState(false);
  const [concepts,        setConcepts]        = useState<Concept[]>([]);
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(null);
  const [loadingConcepts, setLoadingConcepts] = useState(false);
  const [generatedImage,  setGeneratedImage]  = useState<string | null>(null);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [videoUrl,        setVideoUrl]        = useState<string | null>(null);
  const [videoStatus,     setVideoStatus]     = useState('');
  const [videoProgress,   setVideoProgress]   = useState(0);
  const [selectedVoice,   setSelectedVoice]   = useState(VOICES[0].id);
  const [favorites,       setFavorites]       = useState<string[]>([]);
  const [stitching,       setStitching]       = useState(false);
  const [finalVideo,      setFinalVideo]      = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('omnyra_voice_favorites');
      if (stored) setFavorites(JSON.parse(stored));
    } catch {}
  }, []);

  const toggleFavorite = (id: string) => {
    setFavorites(prev => {
      const next = prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id];
      try { localStorage.setItem('omnyra_voice_favorites', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // Ghost Test Score — debounced 500ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!prompt.trim() || prompt.length < 20) { setGhostScore(null); return; }
    debounceRef.current = setTimeout(async () => {
      setScoringPrompt(true);
      try {
        const res  = await fetch('/api/ghost-test-score', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body:   JSON.stringify({ prompt }),
        });
        const data = await res.json();
        setGhostScore(data.score ?? 0);
        setGhostFeedback(data.feedback ?? '');
      } catch {}
      finally { setScoringPrompt(false); }
    }, 500);
  }, [prompt]);

  const generateConcepts = async () => {
    setLoadingConcepts(true);
    try {
      const res  = await fetch('/api/generate-concepts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ prompt, toolId }),
      });
      const data = await res.json();
      setConcepts(data.concepts ?? []);
      setStep(2);
    } catch {}
    finally { setLoadingConcepts(false); }
  };

  const generateImage = async () => {
    if (!selectedConcept) return;
    setGeneratingImage(true);
    setStep(3);
    try {
      const res  = await fetch('/api/generate-image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ prompt: selectedConcept.description, toolId }),
      });
      const data = await res.json();
      setGeneratedImage(data.imageUrl ?? null);
    } catch {}
    finally { setGeneratingImage(false); }
  };

  const generateVideo = async () => {
    if (!selectedConcept) return;
    setStep(4);
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
        setVideoStatus('Complete');
        setVideoProgress(100);
      } else if (data.jobId) {
        startPolling(data.jobId);
      }
    } catch { setVideoStatus('Error'); }
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
          setVideoStatus('Complete');
          setVideoProgress(100);
        }
      } catch {}
    }, 5000);
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const generateFinal = async () => {
    setStitching(true);
    try {
      const res  = await fetch('/api/merge-video-audio', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ videoUrl, voiceId: selectedVoice, script: selectedConcept?.description }),
      });
      const data = await res.json();
      setFinalVideo(data.outputUrl ?? videoUrl);
    } catch { setFinalVideo(videoUrl); }
    finally { setStitching(false); }
  };

  const estTime = modelOverride === 'hedra' ? '~2 min' : modelOverride === 'pika' ? '~90s' : '~4 min';

  return (
    <div className="max-w-2xl mx-auto">
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-10 flex-wrap">
        {STEP_LABELS.slice(0, totalSteps).map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
              step === i + 1
                ? 'bg-[#C084FC] text-black'
                : step > i + 1
                  ? 'bg-purple-900 text-[#C084FC]'
                  : 'border border-purple-800 text-purple-600'
            }`} style={{ background: step === i + 1 ? '#C084FC' : step > i + 1 ? '#3B1F6A' : '#0D0020' }}>
              {step > i + 1 ? '✓' : i + 1}
            </div>
            <span className={`text-xs font-medium ${step === i + 1 ? 'text-[#C084FC]' : 'text-purple-600'}`}>
              {label}
            </span>
            {i < totalSteps - 1 && <div className="w-6 h-px bg-purple-900 mx-1" />}
          </div>
        ))}
      </div>

      {/* ── STEP 1: Prompt ─────────────────────────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-5">
          {/* Ghost Test Guidance accordion */}
          <div className="rounded-2xl border border-purple-900/60" style={{ background: '#1A0A2E' }}>
            <button
              onClick={() => setGuidanceOpen(o => !o)}
              className="w-full flex items-center justify-between px-5 py-4 text-left"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-purple-200">
                👻 Ghost Test Guidance
              </span>
              <span className="text-purple-500 text-xs">{guidanceOpen ? '▲' : '▼'}</span>
            </button>
            {guidanceOpen && (
              <div className="px-5 pb-5 space-y-3 border-t border-purple-900/40 pt-4">
                <p className="text-xs text-purple-400">
                  Reject emotion labels. Every word must describe something a camera can capture.
                </p>
                {[
                  { bad: '❌ She felt overwhelmed with sadness', good: '✅ She pressed her palms flat on the table, eyes fixed on a single point on the floor' },
                  { bad: '❌ He was nervous about the presentation', good: '✅ He uncapped and recapped the marker three times before walking to the whiteboard' },
                  { bad: '❌ The couple felt deeply connected', good: '✅ Their fingers were interlaced, her thumb tracing slow circles on the back of his hand' },
                ].map((ex, i) => (
                  <div key={i} className="rounded-xl p-3 space-y-1.5" style={{ background: '#0D0020' }}>
                    <p className="text-xs text-red-400 font-mono">{ex.bad}</p>
                    <p className="text-xs text-emerald-400 font-mono">{ex.good}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Textarea */}
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Describe your scene or story..."
            rows={6}
            className="w-full rounded-2xl border border-purple-900 focus:border-[#C084FC] outline-none p-5 text-sm text-white placeholder:text-purple-700 resize-y transition-colors"
            style={{ background: '#1A0A2E' }}
          />

          {/* Ghost Test Score meter */}
          {(ghostScore !== null || scoringPrompt) && (
            <div className="rounded-2xl border border-purple-900/50 p-4" style={{ background: '#1A0A2E' }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-purple-300">👻 Ghost Test Score</span>
                {scoringPrompt
                  ? <span className="text-xs text-purple-500">Scoring…</span>
                  : <span className="text-sm font-bold" style={{ color: scoreColor(ghostScore ?? 0) }}>{ghostScore}/100</span>
                }
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: '#0D0020' }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${ghostScore ?? 0}%`, background: scoreColor(ghostScore ?? 0) }}
                />
              </div>
              {ghostFeedback && <p className="text-xs text-purple-400 mt-2">{ghostFeedback}</p>}
            </div>
          )}

          <button
            onClick={generateConcepts}
            disabled={!prompt.trim() || (ghostScore !== null && ghostScore < 30) || loadingConcepts}
            className="w-full py-4 rounded-2xl font-semibold text-sm text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
            style={{ background: 'linear-gradient(135deg, #C084FC, #E879F9)' }}
          >
            {loadingConcepts ? 'Generating concepts…' : 'Generate 5 Concepts →'}
          </button>
        </div>
      )}

      {/* ── STEP 2: Concepts ───────────────────────────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-4">
          <p className="text-sm text-purple-400 mb-2">Select one concept to build from.</p>
          {concepts.map((c, i) => (
            <div
              key={i}
              onClick={() => setSelectedConcept(c)}
              className="rounded-2xl border p-5 cursor-pointer transition-all duration-200"
              style={{
                background:  '#1A0A2E',
                borderColor: selectedConcept === c ? '#C084FC' : 'rgba(88,28,135,0.4)',
                boxShadow:   selectedConcept === c ? '0 0 20px rgba(192,132,252,0.4)' : 'none',
              }}
            >
              <div className="flex items-start justify-between mb-2">
                <span className="text-sm font-semibold text-white">{c.title}</span>
                <span
                  className="text-xs font-bold px-2 py-0.5 rounded-full"
                  style={{
                    color:      scoreColor(c.ghostScore),
                    background: `${scoreColor(c.ghostScore)}20`,
                    border:     `1px solid ${scoreColor(c.ghostScore)}40`,
                  }}
                >
                  👻 {c.ghostScore}
                </span>
              </div>
              <p className="text-xs text-purple-300 leading-relaxed">{c.description}</p>
            </div>
          ))}

          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setStep(1)}
              className="flex-1 py-3 rounded-xl border border-purple-800 text-sm text-purple-300 hover:border-purple-600 transition-colors"
              style={{ background: 'transparent' }}
            >
              ← Back
            </button>
            {scriptOnly ? (
              <button
                disabled={!selectedConcept}
                className="flex-1 py-3 rounded-xl font-semibold text-sm text-white disabled:opacity-40 disabled:cursor-not-allowed"
                style={{ background: 'linear-gradient(135deg, #C084FC, #E879F9)' }}
              >
                Export Script ✓
              </button>
            ) : (
              <button
                onClick={generateImage}
                disabled={!selectedConcept}
                className="flex-1 py-3 rounded-xl font-semibold text-sm text-white disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 transition-all"
                style={{ background: 'linear-gradient(135deg, #C084FC, #E879F9)' }}
              >
                Generate This Scene →
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── STEP 3: Image ──────────────────────────────────────────────────────── */}
      {step === 3 && (
        <div className="space-y-6">
          <div
            className="aspect-[9/16] max-w-xs mx-auto rounded-2xl border border-purple-900 overflow-hidden flex items-center justify-center"
            style={{ background: '#0D0020' }}
          >
            {generatingImage ? (
              <div className="text-center space-y-3 p-6">
                <div className="text-5xl animate-pulse">👻</div>
                <p className="text-sm text-purple-400">Generating your scene…</p>
              </div>
            ) : generatedImage ? (
              <img src={generatedImage} alt="Generated scene" className="w-full h-full object-cover" />
            ) : (
              <p className="text-purple-600 text-sm">No image yet</p>
            )}
          </div>

          {!generatingImage && (
            <div className="flex gap-3">
              <button
                onClick={generateImage}
                className="flex-1 py-3 rounded-xl border border-purple-700 text-sm text-purple-300 hover:border-[#C084FC] transition-colors"
                style={{ background: 'transparent' }}
              >
                Regenerate
              </button>
              <button
                onClick={generateVideo}
                disabled={!generatedImage}
                className="flex-1 py-3 rounded-xl font-semibold text-sm text-white disabled:opacity-40 hover:brightness-110 transition-all"
                style={{ background: 'linear-gradient(135deg, #C084FC, #E879F9)' }}
              >
                Accept & Continue →
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── STEP 4: Video ──────────────────────────────────────────────────────── */}
      {step === 4 && (
        <div className="space-y-6">
          {videoUrl ? (
            <video src={videoUrl} controls className="w-full rounded-2xl" />
          ) : (
            <div className="rounded-2xl border border-purple-900 p-10 text-center" style={{ background: '#1A0A2E' }}>
              <div className="text-5xl mb-4 animate-pulse">🎬</div>
              <p className="text-sm text-purple-300 mb-6">{videoStatus || 'Starting…'}</p>
              <div className="h-2 rounded-full overflow-hidden mb-2" style={{ background: '#0D0020' }}>
                <div
                  className="h-full rounded-full transition-all duration-1000"
                  style={{
                    width:      `${videoProgress}%`,
                    background: 'linear-gradient(90deg, #C084FC, #E879F9)',
                  }}
                />
              </div>
              <p className="text-xs text-purple-500 mt-2">Estimated: {estTime}</p>
            </div>
          )}
          {videoUrl && (
            <button
              onClick={() => setStep(5)}
              className="w-full py-4 rounded-2xl font-semibold text-sm text-white hover:brightness-110 transition-all"
              style={{ background: 'linear-gradient(135deg, #C084FC, #E879F9)' }}
            >
              Add Voice & Stitch →
            </button>
          )}
        </div>
      )}

      {/* ── STEP 5: Voice + Stitch ─────────────────────────────────────────────── */}
      {step === 5 && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-purple-900/60 p-5" style={{ background: '#1A0A2E' }}>
            <h3 className="text-sm font-semibold text-white mb-4">Voice Library</h3>
            <div className="grid grid-cols-2 gap-3">
              {VOICES.map(v => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVoice(v.id)}
                  className="rounded-xl p-3 border text-left transition-all"
                  style={{
                    background:  selectedVoice === v.id ? 'rgba(192,132,252,0.1)' : '#0D0020',
                    borderColor: selectedVoice === v.id ? '#C084FC' : 'rgba(88,28,135,0.4)',
                  }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-white">{v.name}</span>
                    <button
                      onClick={e => { e.stopPropagation(); toggleFavorite(v.id); }}
                      className="text-sm leading-none"
                    >
                      {favorites.includes(v.id) ? '❤️' : '🤍'}
                    </button>
                  </div>
                  <span className="text-xs text-purple-400">{v.accent}</span>
                </button>
              ))}
            </div>
          </div>

          <div
            className="rounded-xl border border-purple-900/40 px-4 py-3 flex items-center gap-2"
            style={{ background: '#0D0020' }}
          >
            <span className="text-xs text-purple-400">Arc:</span>
            <span className="text-xs text-purple-200 font-medium">rising-tension — voice settings auto-tuned</span>
          </div>

          {finalVideo ? (
            <div className="space-y-4">
              <video src={finalVideo} controls className="w-full rounded-2xl" />
              <a
                href={finalVideo}
                download
                className="block w-full py-3 rounded-xl border border-purple-700 text-center text-sm font-medium text-purple-300 hover:border-[#C084FC] transition-colors"
              >
                Download ↓
              </a>
            </div>
          ) : (
            <button
              onClick={generateFinal}
              disabled={stitching}
              className="w-full py-5 rounded-2xl font-semibold text-sm text-white disabled:opacity-50 hover:brightness-110 transition-all"
              style={{ background: 'linear-gradient(135deg, #C084FC, #E879F9)' }}
            >
              {stitching ? 'Stitching…' : 'Generate Final Video ✨'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
