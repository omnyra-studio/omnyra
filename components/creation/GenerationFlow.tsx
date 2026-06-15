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
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel',    accent: 'American',      style: 'Warm' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella',     accent: 'American',      style: 'Soft' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi',      accent: 'American',      style: 'Bold' },
  { id: 'TX3LP5s5f2v4cY6p6z5G',  name: 'Josh',      accent: 'American',      style: 'Deep' },
  { id: 'pNInz6obpgDQGcFmaJgB',  name: 'Adam',      accent: 'American',      style: 'Narrative' },
  { id: 'yoZ06aMxZJJ28mfd3POQ',  name: 'Sam',       accent: 'American',      style: 'Raspy' },
  { id: 'jBpfuIE2acCo8z3wKNLl',  name: 'Gigi',      accent: 'American',      style: 'Childlike' },
  { id: 'oWAxZDx7w5VEj9dCyTzz',  name: 'Grace',     accent: 'American',      style: 'Southern' },
  { id: 'z9fAnlkpzviPz146aGWa',  name: 'Giovanni',  accent: 'Italian',       style: 'Foreigner' },
  { id: 'Zlb1dXrM653N07WRdFW3',  name: 'Lily',      accent: 'British',       style: 'Warm' },
  { id: 'nPczCjzI2devNBz1zQrb',  name: 'Brian',     accent: 'American',      style: 'Deep' },
  { id: 'N2lVS1w4EtoT3dr4eOWO',  name: 'Callum',    accent: 'Transatlantic', style: 'Intense' },
  { id: 'CYw3kZ02Hs0563khs1Fj',  name: 'Dave',      accent: 'British',       style: 'Conversational' },
  { id: 'IKne3meq5aSn9XLyUdCD',  name: 'Charlie',   accent: 'Australian',    style: 'Natural' },
  { id: 'XB0fDUnXU5powFXDhCwa',  name: 'Charlotte', accent: 'Swedish',       style: 'Seductive' },
  { id: 'flq6f7yk4E4fJM5XTYuZ',  name: 'Mimi',      accent: 'Swedish',       style: 'Childlike' },
  { id: 'g5CIjZEefAph4nQFvHAz',  name: 'Ethan',     accent: 'American',      style: 'Whisper' },
  { id: 'onwK4e9ZLuTAKqWW03F9',  name: 'Daniel',    accent: 'British',       style: 'Authoritative' },
  { id: 'piTKgcLEGmPE4e6mEKli',  name: 'Nicole',    accent: 'American',      style: 'Whisper' },
  { id: 'ThT5KcBeYPX3keUQqHPh',  name: 'Dorothy',   accent: 'British',       style: 'Pleasant' },
  { id: 'TxGEqnHWrfWFTfGW9XjX',  name: 'Josh',      accent: 'American',      style: 'Young' },
  { id: 'VR6AewLTigWG4xSOukaG',  name: 'Arnold',    accent: 'American',      style: 'Crisp' },
  { id: 'bVMeCyTHy58xNoL34h3p',  name: 'Jeremy',    accent: 'American',      style: 'Excited' },
  { id: 'SOYHLrjzK2X1ezoPC6cr',  name: 'Harry',     accent: 'American',      style: 'Anxious' },
  { id: 'GBv7mTt0atIp3Br8iCZy',  name: 'Thomas',    accent: 'American',      style: 'Calm' },
  { id: 'LcfcDJNUP1GQjkzn1xUU',  name: 'Emily',     accent: 'American',      style: 'Calm' },
];

const STEP_LABELS = ['Brief', 'Script', 'Scenes', 'Voice'];

type VideoType = 'preview' | 'cinematic' | 'avatar';

const VIDEO_TYPES: Array<{ id: VideoType; label: string; desc: string; duration: string; cr: number; badge: string }> = [
  { id: 'preview',   label: 'Quick Preview',   desc: 'fal.ai fast gen',    duration: '10s',  cr: 10, badge: '⚡' },
  { id: 'cinematic', label: 'Cinematic Scene',  desc: 'Kling Pro',          duration: '30s',  cr: 40, badge: '🎬' },
  { id: 'avatar',    label: 'Avatar Video',     desc: 'Hedra talking head', duration: '~30s', cr: 40, badge: '👤' },
];

export default function GenerationFlow({ toolId, toolName, modelOverride, scriptOnly }: Props) {
  const totalSteps = scriptOnly ? 2 : 4;

  const [step,           setStep]           = useState(1);
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

  const [concepts,        setConcepts]        = useState<Concept[]>([]);
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(null);
  const [regenerating,    setRegenerating]    = useState(false);

  const [videoType,     setVideoType]     = useState<VideoType>('cinematic');
  const [videoUrl,      setVideoUrl]      = useState<string | null>(null);
  const [videoStatus,   setVideoStatus]   = useState('');
  const [videoProgress, setVideoProgress] = useState(0);
  const [videoStarted,  setVideoStarted]  = useState(false);
  const [videoJobId,    setVideoJobId]    = useState<string | null>(null);
  const [videoModel,    setVideoModel]    = useState<string | null>(null);
  const [selectedVoice, setSelectedVoice] = useState(VOICES[0].id);
  const [favorites,     setFavorites]     = useState<string[]>([]);
  const [stitching,     setStitching]     = useState(false);
  const [finalVideo,    setFinalVideo]    = useState<string | null>(null);

  const pollRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleGenerateScript = async () => {
    if (!prompt.trim()) return;
    setLoadingState('Analysing your scene…');
    setScriptError('');

    let ghostEnhanced = prompt;
    try {
      const ghostRes = await fetch('/api/ghost-test-score', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const ghostData = await ghostRes.json();
      ghostEnhanced = ghostData.enhancedPrompt ?? prompt;
    } catch {}

    setLoadingState('Writing your scripts…');
    try {
      const res = await fetch('/api/generate-brief-sync', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goal: ghostEnhanced,
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
      setStep(2);
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

  const handleRegenerateImages = async () => {
    if (!selectedScript) return;
    setRegenerating(true);
    setSelectedConcept(null);
    try {
      const res = await fetch('/api/generate-concepts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `${selectedScript.hook}\n\n${selectedScript.script}`,
          toolId,
          lightningMode,
        }),
      });
      const data = await res.json();
      setConcepts(data.concepts ?? []);
    } catch {}
    setRegenerating(false);
  };

  const startVideoGeneration = async () => {
    if (!selectedConcept) return;
    setVideoStarted(true);
    setVideoStatus('Queued');
    setVideoProgress(5);
    setVideoUrl(null);
    setFinalVideo(null);

    try {
      if (videoType === 'avatar') {
        const res = await fetch('/api/generate-video', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: selectedConcept.description,
            selectedModel: modelOverride ?? 'hedra',
            toolId,
          }),
        });
        const data = await res.json();
        if (data.videoUrl) {
          setVideoUrl(data.videoUrl);
          setVideoStatus('Ready');
          setVideoProgress(100);
        } else if (data.jobId) {
          startHedraPolling(data.jobId);
        }
      } else {
        const res = await fetch('/api/generate-video-clip', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: selectedConcept.description,
            imageUrl: selectedConcept.imageUrl,
            model: videoType,
          }),
        });
        const data = await res.json();
        if (data.error) {
          setVideoStatus('Error — ' + data.error);
          setVideoStarted(false);
          return;
        }
        if (data.jobId) {
          setVideoJobId(data.jobId);
          setVideoModel(data.model);
          startFalPolling(data.jobId, data.model);
        }
      }
    } catch {
      setVideoStatus('Error — tap Generate to retry');
      setVideoStarted(false);
    }
  };

  const startFalPolling = (jobId: string, model: string) => {
    const labels = ['Queued', 'Processing', 'Rendering', 'Almost done…'];
    let tick = 0;
    pollRef.current = setInterval(async () => {
      tick++;
      setVideoStatus(labels[Math.min(tick, labels.length - 1)]);
      setVideoProgress(Math.min(10 + tick * 15, 90));
      try {
        const res = await fetch(`/api/fal-poll?jobId=${jobId}&model=${encodeURIComponent(model)}`);
        const data = await res.json();
        if (data.status === 'complete' && data.videoUrl) {
          clearInterval(pollRef.current!);
          setVideoUrl(data.videoUrl);
          setVideoStatus('Ready');
          setVideoProgress(100);
        } else if (data.status === 'failed') {
          clearInterval(pollRef.current!);
          setVideoStatus('Failed — please retry');
          setVideoStarted(false);
        }
      } catch {}
    }, 5000);
  };

  const startHedraPolling = (jobId: string) => {
    const labels = ['Queued', 'Processing', 'Rendering', 'Almost done…'];
    let tick = 0;
    pollRef.current = setInterval(async () => {
      tick++;
      setVideoStatus(labels[Math.min(tick, labels.length - 1)]);
      setVideoProgress(Math.min(10 + tick * 18, 90));
      try {
        const res = await fetch(`/api/video-status?jobId=${jobId}`);
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
      const res = await fetch('/api/merge-video-audio', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          video_url: videoUrl,
          voiceId: selectedVoice,
          script: selectedScript?.script ?? selectedConcept?.description,
        }),
      });
      const data = await res.json();
      setFinalVideo(data.outputUrl ?? videoUrl);
    } catch { setFinalVideo(videoUrl); }
    finally { setStitching(false); }
  };

  const estTime = videoType === 'avatar' ? '~2 min' : videoType === 'preview' ? '~60s' : '~4 min';
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
    <div style={{ maxWidth: 800, margin: '0 auto' }}>

      {/* ── Step indicator ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 40, flexWrap: 'wrap' }}>
        {STEP_LABELS.slice(0, totalSteps).map((label, i) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700,
              background: step === i + 1 ? '#C084FC' : step > i + 1 ? '#3B1F6A' : '#0D0020',
              color: step === i + 1 ? '#000' : step > i + 1 ? '#C084FC' : '#9370DB',
              border: step <= i + 1 ? '1px solid #4C1D95' : 'none',
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

      {/* ── STEP 1: Brief Form ──────────────────────────────────────────── */}
      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <h2 style={{ color: '#F5EFE6', fontWeight: 700, fontSize: '1.5rem', marginBottom: 6 }}>{toolName}</h2>
            <p style={{ color: '#B09FC0', fontSize: '0.875rem' }}>Understand emotion deeply. Show it visually.</p>
          </div>

          {/* Main goal */}
          <div>
            <label style={labelStyle}>What&apos;s your video about? *</label>
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="Describe your scene or story..."
              rows={5}
              disabled={isLoading}
              className="omnyra-textarea"
              style={{
                width: '100%', borderRadius: 16, padding: '16px',
                fontSize: '0.875rem', resize: 'vertical',
                border: '1px solid #4C1D95', outline: 'none',
                fontFamily: 'inherit', caretColor: '#C084FC',
                boxSizing: 'border-box', opacity: isLoading ? 0.6 : 1,
              }}
            />
          </div>

          {/* Niche + Platform row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ color: '#A89BAF', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
                Niche / Industry
              </label>
              <select
                value={niche}
                onChange={e => setNiche(e.target.value)}
                disabled={isLoading}
                style={{
                  width: '100%', background: '#0D0020', border: '1px solid #2D1B4E',
                  borderRadius: 10, padding: '12px 16px',
                  color: niche ? '#F5EFE6' : '#6B21A8', fontSize: '0.9rem',
                  fontFamily: 'inherit', cursor: isLoading ? 'not-allowed' : 'pointer',
                  appearance: 'none' as const,
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236B21A8' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
                  backgroundRepeat: 'no-repeat', backgroundPosition: 'right 14px center',
                  opacity: isLoading ? 0.6 : 1, boxSizing: 'border-box' as const,
                }}
              >
                <option value="" disabled>Select your niche...</option>
                <option value="PSYCHOLOGY, KINDNESS, HONESTY">Psychology · Kindness · Honesty</option>
                <option value="BEAUTY, SKINCARE, MAKEUP">Beauty · Skincare · Makeup</option>
                <option value="FITNESS, WELLNESS, HEALTH">Fitness · Wellness · Health</option>
                <option value="FOOD, RECIPES, COOKING">Food · Recipes · Cooking</option>
                <option value="FASHION, STYLE, LIFESTYLE">Fashion · Style · Lifestyle</option>
                <option value="BUSINESS, FINANCE, ENTREPRENEURSHIP">Business · Finance · Entrepreneurship</option>
                <option value="TRAVEL, ADVENTURE, CULTURE">Travel · Adventure · Culture</option>
                <option value="PARENTING, FAMILY, RELATIONSHIPS">Parenting · Family · Relationships</option>
                <option value="EDUCATION, LEARNING, SELF IMPROVEMENT">Education · Learning · Self Improvement</option>
                <option value="TECHNOLOGY, AI, GAMING">Technology · AI · Gaming</option>
                <option value="PETS, ANIMALS">Pets · Animals</option>
                <option value="REAL ESTATE, PROPERTY">Real Estate · Property</option>
                <option value="TRADES, CONSTRUCTION, DIY">Trades · Construction · DIY</option>
                <option value="CAFE, HOSPITALITY, FOOD BUSINESS">Cafe · Hospitality · Food Business</option>
                <option value="HISTORY, TRUE STORIES, DOCUMENTARY">History · True Stories · Documentary</option>
                <option value="MOTIVATION, MINDSET, PERSONAL GROWTH">Motivation · Mindset · Personal Growth</option>
                <option value="COMEDY, ENTERTAINMENT, POP CULTURE">Comedy · Entertainment · Pop Culture</option>
                <option value="LUXURY, LIFESTYLE, ASPIRATIONAL">Luxury · Lifestyle · Aspirational</option>
                <option value="MEDICAL, HEALTH PROFESSIONAL">Medical · Health Professional</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label style={{ color: '#A89BAF', fontSize: '0.75rem', letterSpacing: '0.08em', textTransform: 'uppercase', display: 'block', marginBottom: 8 }}>
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
                  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236B21A8' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
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

      {/* ── STEP 2: Script version tabs + viral analytics ───────────────── */}
      {step === 2 && (
        <div style={{ maxWidth: 760, margin: '0 auto' }}>

          <h1 style={{
            textAlign: 'center', color: '#D4A843', fontWeight: 800,
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
              style={{
                background: 'transparent', border: 'none',
                color: '#D4A843', fontSize: '0.9rem', cursor: 'pointer',
                textDecoration: 'underline', padding: '10px 8px',
              }}
            >
              Generate 5 more →
            </button>
          </div>

          {isLoading && (
            <div style={{ borderRadius: 12, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', marginBottom: 16 }}>
              <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#D4A843', animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />
              <span style={{ color: '#A89BAF', fontSize: '0.875rem' }}>{loadingState}</span>
            </div>
          )}

          {selectedScript && (
            <>
              {/* Viral Analytics card */}
              <div style={{
                background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16,
                padding: '28px 32px', marginBottom: 16,
              }}>
                <p style={{
                  textAlign: 'center', color: '#D4A843', fontSize: '0.7rem',
                  letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 24,
                }}>
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

              {/* Script content card */}
              <div style={{
                background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(10px)',
                border: '1px solid rgba(255,255,255,0.1)', borderRadius: 16,
                padding: '28px 32px', marginBottom: 20,
              }}>
                {selectedScript.title && (
                  <p style={{
                    textAlign: 'center', color: '#D4A843', fontSize: '0.7rem',
                    letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 20,
                  }}>
                    {selectedScript.title}
                  </p>
                )}
                <p style={{ color: '#D4A843', fontSize: '1.25rem', fontWeight: 600, lineHeight: 1.6, marginBottom: 16 }}>
                  &quot;{selectedScript.hook}&quot;
                </p>
                {selectedScript.script && (
                  <p style={{ color: '#C4B5D0', fontSize: '0.9rem', lineHeight: 1.7, margin: 0 }}>
                    {selectedScript.script}
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
                  onClick={handleGenerateScenes}
                  disabled={isLoading}
                  style={{
                    width: '100%', padding: '18px',
                    background: '#D4A843', color: '#0D0010',
                    fontWeight: 700, fontSize: '1rem', letterSpacing: '0.05em',
                    border: 'none', borderRadius: 14,
                    cursor: isLoading ? 'not-allowed' : 'pointer',
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

      {/* ── STEP 3: Scene image cards (2×2 grid) ───────────────────────── */}
      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h2 style={{ color: '#F5EFE6', fontWeight: 700, fontSize: '1.25rem', marginBottom: 6 }}>Choose your scene</h2>
              <p style={{ color: '#B09FC0', fontSize: '0.875rem' }}>Select one image to build your video from.</p>
            </div>
            <button
              onClick={handleRegenerateImages}
              disabled={regenerating}
              style={{
                background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.4)',
                color: '#D4A843', borderRadius: 10, padding: '8px 16px',
                fontSize: '0.825rem', fontWeight: 600,
                cursor: regenerating ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                opacity: regenerating ? 0.6 : 1,
              }}
            >
              {regenerating ? (
                <>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid rgba(212,168,67,0.3)', borderTopColor: '#D4A843', animation: 'spin 0.8s linear infinite' }} />
                  Regenerating…
                </>
              ) : '↺ Regenerate Images'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {concepts.map((c, i) => (
              <div
                key={i}
                onClick={() => setSelectedConcept(c)}
                style={{
                  position: 'relative', cursor: 'pointer', borderRadius: 16,
                  overflow: 'hidden', aspectRatio: '9/16',
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
              onClick={() => { if (selectedConcept) { setStep(4); setVideoStarted(false); setVideoUrl(null); setFinalVideo(null); } }}
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

      {/* ── STEP 4: Video Type + Voice + Final generation ───────────────── */}
      {step === 4 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Video progress bar */}
          {videoStarted && !videoUrl && (
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

          {/* Video player */}
          {videoUrl && (
            <div style={{ borderRadius: 16, overflow: 'hidden' }}>
              <video src={videoUrl} controls style={{ width: '100%', borderRadius: 16 }} />
            </div>
          )}

          {/* Video Type cards — shown before video starts */}
          {!videoStarted && (
            <div>
              <h3 style={{ color: '#E8DEFF', fontSize: '0.875rem', fontWeight: 600, marginBottom: 12 }}>Choose video type</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                {VIDEO_TYPES.map(vt => (
                  <button
                    key={vt.id}
                    onClick={() => setVideoType(vt.id)}
                    style={{
                      borderRadius: 14, padding: '16px 12px',
                      background: videoType === vt.id ? 'rgba(212,168,67,0.1)' : '#0D0020',
                      border: `1px solid ${videoType === vt.id ? '#D4A843' : '#2D1B4E'}`,
                      cursor: 'pointer', textAlign: 'left',
                      boxShadow: videoType === vt.id ? '0 0 12px rgba(212,168,67,0.2)' : 'none',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>{vt.badge}</div>
                    <p style={{ color: '#F5EFE6', fontSize: '0.875rem', fontWeight: 600, margin: '0 0 4px' }}>{vt.label}</p>
                    <p style={{ color: '#9370DB', fontSize: '0.75rem', margin: '0 0 8px' }}>{vt.desc}</p>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ color: '#B09FC0', fontSize: '0.7rem', background: '#1A0A2E', borderRadius: 6, padding: '2px 8px' }}>{vt.duration}</span>
                      <span style={{ color: '#D4A843', fontSize: '0.7rem', background: 'rgba(212,168,67,0.08)', borderRadius: 6, padding: '2px 8px' }}>{vt.cr}cr</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Script preview */}
          {selectedScript && (
            <div style={{ borderRadius: 12, border: '1px solid #2D1B4E', padding: 16, background: '#1A0A2E' }}>
              <p style={{ color: '#D4A843', fontSize: '0.8rem', fontWeight: 600, marginBottom: 8 }}>
                &quot;{selectedScript.hook}&quot;
              </p>
              <p style={{ color: '#B09FC0', fontSize: '0.8rem', lineHeight: 1.6, margin: 0 }}>{selectedScript.script}</p>
            </div>
          )}

          {/* Voice Library */}
          <div style={{ borderRadius: 16, border: '1px solid #2D1B4E', padding: 20, background: '#1A0A2E' }}>
            <h3 style={{ color: '#E8DEFF', fontSize: '0.875rem', fontWeight: 600, marginBottom: 16 }}>Choose your voice</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxHeight: 400, overflowY: 'auto', paddingRight: 4 }}>
              {VOICES.map(v => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVoice(v.id)}
                  style={{
                    borderRadius: 12, padding: 12, textAlign: 'left', cursor: 'pointer',
                    background: selectedVoice === v.id ? 'rgba(192,132,252,0.1)' : '#0D0020',
                    border: `1px solid ${selectedVoice === v.id ? '#C084FC' : '#2D1B4E'}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ color: '#E8DEFF', fontSize: '0.875rem', fontWeight: 500 }}>{v.name}</span>
                    <button
                      onClick={e => { e.stopPropagation(); toggleFavorite(v.id); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.875rem', padding: 0 }}
                    >
                      {favorites.includes(v.id) ? '❤️' : '🤍'}
                    </button>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ color: '#9370DB', fontSize: '0.7rem', background: '#1A0A2E', borderRadius: 4, padding: '1px 6px' }}>{v.accent}</span>
                    <span style={{ color: '#B09FC0', fontSize: '0.7rem', background: 'rgba(255,255,255,0.04)', border: '1px solid #2D1B4E', borderRadius: 4, padding: '1px 6px' }}>{v.style}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Final Video / buttons */}
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
          ) : videoUrl ? (
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
              {stitching ? 'Stitching…' : 'Generate Final Video ✨'}
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
      )}
    </div>
  );
}
