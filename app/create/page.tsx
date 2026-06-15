'use client';

import { useState, useEffect, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import GenerationProgress from '@/components/GenerationProgress';
import GhostTestGuidance from '@/components/GhostTestGuidance';
import VoiceLibraryBrowser from '@/components/VoiceLibraryBrowser';
import AuthWrapper from '@/components/AuthWrapper';
import Navbar from '@/components/Navbar';
import { saveBrandMemory, loadBrandMemory } from '@/utils/brandMemory';

const MODELS = [
  { id: 'kling',   label: 'Kling 3.0',     icon: '🎥', bestFor: 'Cinematic Quality' },
  { id: 'hedra',   label: 'Hedra',          icon: '🗣️', bestFor: 'Avatars' },
  { id: 'pika',    label: 'Pika 2.5',       icon: '✨', bestFor: 'Creative Effects' },
  { id: 'runway',  label: 'Runway Gen-4',   icon: '🎨', bestFor: 'Creative Control' },
  { id: 'fal',     label: 'Fal.ai',         icon: '⚡', bestFor: 'Fast Multi-Model' },
  { id: 'getimg',  label: 'GetIMG',         icon: '🖼️', bestFor: 'Image + Video' },
] as const;

type ModelId = (typeof MODELS)[number]['id'];

export default function CreatePage() {
  const supabase = createClient();
  const progressTimers = useRef<ReturnType<typeof setTimeout>[]>([]);

  // ── Core state ──────────────────────────────────────────────────────────────
  const [userPrompt,      setUserPrompt]      = useState('');
  const [selectedModel,   setSelectedModel]   = useState<ModelId>('kling');
  const [campaignMode,    setCampaignMode]    = useState(false);
  const [campaignName,    setCampaignName]    = useState('');
  const [brandGuidelines, setBrandGuidelines] = useState('');
  const [emotionalArc,    setEmotionalArc]    = useState('rising-tension');
  const [microIntensity,  setMicroIntensity]  = useState(65);
  const [activeEmotions,  setActiveEmotions]  = useState<string[]>(['Determination', 'Longing']);
  const [lightningMode,   setLightningMode]   = useState(false);
  const [selectedVoiceId, setSelectedVoiceId] = useState('21m00Tcm4TlvDq8ikWAM');
  const [voiceFavorites,  setVoiceFavorites]  = useState<string[]>([]);
  const [userId,          setUserId]          = useState<string | null>(null);
  const [videoUrl,        setVideoUrl]        = useState<string | null>(null);

  // ── Progress state ──────────────────────────────────────────────────────────
  const [progressData, setProgressData] = useState({
    isGenerating:      false,
    currentStage:      '',
    progress:          0,
    estimatedTimeLeft: 0,
    error:             null as string | null,
    ghostTestScore:    0,
    ghostTestFeedback: '',
  });

  // ── Auth ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Load brand memory on mount ───────────────────────────────────────────────
  useEffect(() => {
    if (!userId || !campaignName) return;
    loadBrandMemory(userId, campaignName).then(data => {
      if (data) {
        setBrandGuidelines(data.brand_guidelines || '');
        setSelectedVoiceId(data.preferred_voice_id || '21m00Tcm4TlvDq8ikWAM');
        setVoiceFavorites(data.voice_favorites || []);
      }
    }).catch(console.error);
  }, [userId, campaignName]);

  // ── Auto-save brand memory (debounced) ───────────────────────────────────────
  useEffect(() => {
    if (!userId || (!brandGuidelines && !campaignName)) return;
    const t = setTimeout(() => {
      saveBrandMemory(userId, {
        campaignName:     campaignName || 'default',
        brandGuidelines,
        preferredVoiceId: selectedVoiceId,
        voiceFavorites,
      }).catch(console.error);
    }, 1500);
    return () => clearTimeout(t);
  }, [brandGuidelines, campaignName, selectedVoiceId, voiceFavorites, userId]);

  // ── Generate ────────────────────────────────────────────────────────────────
  const clearProgressTimers = () => {
    progressTimers.current.forEach(clearTimeout);
    progressTimers.current = [];
  };

  const handleGenerate = async () => {
    if (!userPrompt.trim()) return;

    clearProgressTimers();
    setVideoUrl(null);
    setProgressData({
      isGenerating:      true,
      currentStage:      'Analyze',
      progress:          0,
      estimatedTimeLeft: lightningMode ? 75 : 160,
      error:             null,
      ghostTestScore:    0,
      ghostTestFeedback: '',
    });

    // Simulate stage advancement while the server processes
    const stages = [
      { delay: 2000,  stage: 'Analyze',  progress: 20 },
      { delay: 5000,  stage: 'Script',   progress: 38 },
      { delay: 12000, stage: 'Script',   progress: 52 },
      { delay: 20000, stage: 'Generate', progress: 65 },
      { delay: 40000, stage: 'Generate', progress: 75 },
      { delay: 55000, stage: 'Voice',    progress: 85 },
      { delay: 70000, stage: 'Stitch',   progress: 92 },
    ];
    stages.forEach(({ delay, stage, progress }) => {
      progressTimers.current.push(
        setTimeout(() => {
          setProgressData(prev =>
            prev.isGenerating ? { ...prev, currentStage: stage, progress } : prev,
          );
        }, delay),
      );
    });

    try {
      const res = await fetch('/api/generate-video', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt:          userPrompt,
          campaignMode,
          campaignName:    campaignName || undefined,
          selectedModel:   lightningMode ? 'pika' : selectedModel,
          brandMemory:     brandGuidelines,
          emotionalArc,
          microIntensity,
          activeEmotions,
          selectedVoiceId,
          lightningMode,
        }),
      });

      const data = await res.json();

      if (!data.success) throw new Error(data.error || 'Generation failed');

      clearProgressTimers();
      setVideoUrl(data.videoUrl);
      setProgressData({
        isGenerating:      false,
        currentStage:      'Complete',
        progress:          100,
        estimatedTimeLeft: 0,
        error:             null,
        ghostTestScore:    data.ghostTestScore || 85,
        ghostTestFeedback: lightningMode ? 'Lightning generation complete.' : 'Generation complete.',
      });

    } catch (err: unknown) {
      clearProgressTimers();
      const message = err instanceof Error ? err.message : 'Generation failed';
      setProgressData(prev => ({ ...prev, isGenerating: false, error: message }));
    }
  };

  const cancelGeneration = () => {
    clearProgressTimers();
    setProgressData(prev => ({ ...prev, isGenerating: false, error: null }));
  };

  const toggleEmotion = (e: string) =>
    setActiveEmotions(prev =>
      prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e],
    );

  const toggleFavorite = (id: string) =>
    setVoiceFavorites(prev =>
      prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id],
    );

  // ── UI ──────────────────────────────────────────────────────────────────────
  return (
    <AuthWrapper>
    <div className="min-h-screen bg-[#0F0A1F] text-white">
      <Navbar />
      <div className="max-w-4xl mx-auto px-6 py-12">

        <h1 className="text-5xl font-bold mb-2">Create Video</h1>
        <p className="text-purple-400 mb-10">Understand emotion deeply. Show it visually.</p>

        {/* Ghost Test Guidance */}
        <GhostTestGuidance />

        {/* Main Prompt */}
        <div className="mb-8">
          <label className="block text-sm text-purple-300 mb-2">Describe your scene or story</label>
          <textarea
            value={userPrompt}
            onChange={e => setUserPrompt(e.target.value)}
            placeholder="A woman sits at a wooden table. She stares at an unopened envelope for a long time, fingers trembling slightly, then slowly pushes it away..."
            rows={5}
            className="w-full bg-purple-950/30 border border-purple-700 focus:border-purple-500 rounded-3xl p-6 text-base placeholder:text-purple-700 outline-none resize-y transition-colors"
            style={{ fontFamily: 'inherit' }}
          />
        </div>

        {/* Generation Engine */}
        <div className="mb-8 p-6 bg-purple-950/40 border border-purple-800 rounded-3xl">
          <label className="block text-sm text-purple-300 mb-4">Generation Engine</label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {MODELS.map(model => (
              <button
                key={model.id}
                type="button"
                onClick={() => setSelectedModel(model.id)}
                className={`p-5 rounded-2xl border transition-all text-left hover:scale-105 ${
                  selectedModel === model.id
                    ? 'border-fuchsia-500 bg-fuchsia-950/60 shadow-lg shadow-fuchsia-500/20'
                    : 'border-purple-900/70 hover:border-purple-700 bg-purple-950/30'
                }`}
              >
                <div className="text-3xl mb-3">{model.icon}</div>
                <div className="font-semibold text-white">{model.label}</div>
                <div className="text-xs text-purple-400 mt-1">{model.bestFor}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Campaign Mode */}
        <div className="mb-8 p-5 bg-purple-950/40 border border-purple-900/50 rounded-2xl">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="font-medium text-white text-sm">Campaign Mode</p>
              <p className="text-xs text-purple-400">Generate a series with consistent characters</p>
            </div>
            <button
              type="button"
              onClick={() => setCampaignMode(m => !m)}
              className={`relative w-12 h-6 rounded-full transition-all duration-300 ${
                campaignMode ? 'bg-fuchsia-500' : 'bg-purple-900'
              }`}
            >
              <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-300 ${
                campaignMode ? 'translate-x-7' : 'translate-x-1'
              }`} />
            </button>
          </div>
          {campaignMode && (
            <input
              type="text"
              value={campaignName}
              onChange={e => setCampaignName(e.target.value)}
              placeholder="Campaign / Series Name"
              className="w-full bg-purple-950 border border-purple-800 focus:border-fuchsia-500 rounded-xl px-4 py-3 text-sm text-white placeholder:text-purple-600 outline-none transition-colors"
              style={{ fontFamily: 'inherit' }}
            />
          )}
        </div>

        {/* Brand Memory */}
        <div className="mb-8 p-5 bg-purple-950/40 border border-purple-800/70 rounded-2xl">
          <h4 className="font-semibold text-sm text-white mb-3">🧠 Brand Memory</h4>
          <textarea
            value={brandGuidelines}
            onChange={e => setBrandGuidelines(e.target.value)}
            placeholder="Brand voice, colors, character descriptions, forbidden elements…"
            rows={3}
            className="w-full bg-[#0F0A1F] border border-purple-900 focus:border-purple-600 rounded-xl p-4 text-sm text-white placeholder:text-purple-700 outline-none resize-y"
            style={{ fontFamily: 'inherit' }}
          />
        </div>

        {/* Emotional Intelligence */}
        <div className="mb-8 p-5 bg-purple-950/40 border border-purple-800/70 rounded-2xl">
          <h4 className="font-semibold text-sm text-white mb-4">🎭 Emotional Intelligence</h4>

          <div className="mb-4">
            <label className="block text-xs text-purple-300 mb-2">Overall Emotional Arc</label>
            <select
              value={emotionalArc}
              onChange={e => setEmotionalArc(e.target.value)}
              className="w-full bg-[#0F0A1F] border border-purple-700 rounded-xl px-3 py-2.5 text-sm text-white outline-none"
              style={{ fontFamily: 'inherit' }}
            >
              <option value="rising-tension">Rising Tension → Catharsis</option>
              <option value="heartfelt-journey">Heartfelt Journey</option>
              <option value="triumphant">Triumphant / Inspirational</option>
              <option value="melancholic-hope">Melancholic → Hope</option>
              <option value="intense-drama">Intense Drama</option>
              <option value="neutral">Neutral</option>
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-xs text-purple-300 mb-2">
              Micro-Expression Intensity — {microIntensity}%
            </label>
            <input
              type="range"
              min={0}
              max={100}
              value={microIntensity}
              onChange={e => setMicroIntensity(Number(e.target.value))}
              className="w-full accent-fuchsia-500"
            />
            <div className="flex justify-between text-[10px] text-purple-500 mt-1">
              <span>Subtle</span><span>Intense</span>
            </div>
          </div>

          <div>
            <label className="block text-xs text-purple-300 mb-2">Active Emotions</label>
            <div className="flex flex-wrap gap-2">
              {['Longing', 'Determination', 'Grief', 'Joy', 'Fear', 'Hope', 'Rage', 'Tenderness'].map(e => (
                <button
                  key={e}
                  type="button"
                  onClick={() => toggleEmotion(e)}
                  className={`px-3 py-1.5 rounded-full text-xs border transition-all ${
                    activeEmotions.includes(e)
                      ? 'border-fuchsia-500 bg-fuchsia-950/60 text-fuchsia-300'
                      : 'border-purple-800 text-purple-400 hover:border-purple-600'
                  }`}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Voice Library */}
        <VoiceLibraryBrowser
          selectedVoice={selectedVoiceId}
          onSelect={setSelectedVoiceId}
          favorites={voiceFavorites}
          onToggleFavorite={toggleFavorite}
          emotionalArc={emotionalArc}
        />

        {/* Lightning Mode Toggle */}
        <div className="mb-8 p-6 bg-purple-950/40 border border-purple-800 rounded-3xl">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold text-lg flex items-center gap-3">
                ⚡ Lightning Mode
              </div>
              <p className="text-sm text-purple-400 mt-1">
                Faster generation • Still strong quality (uses Pika when Kling is selected)
              </p>
            </div>
            <button
              type="button"
              onClick={() => setLightningMode(m => !m)}
              className={`px-8 py-3 rounded-2xl font-medium transition-all ${
                lightningMode
                  ? 'bg-amber-500 text-black'
                  : 'bg-transparent border border-purple-600 hover:border-purple-400 text-purple-300'
              }`}
            >
              {lightningMode ? 'ON — ~45s' : 'OFF — Max Quality'}
            </button>
          </div>
          {lightningMode && (
            <div className="text-xs text-amber-400 bg-amber-950/50 border border-amber-800 rounded-2xl p-3 mt-3">
              ⚡ Using faster model (Pika). Expected ~45–90 seconds.
              Turn off for maximum cinematic quality with Kling.
            </div>
          )}
        </div>

        {/* Generate Button */}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!userPrompt.trim() || progressData.isGenerating}
          className="w-full py-5 bg-gradient-to-r from-purple-600 to-fuchsia-600 rounded-2xl text-xl font-semibold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {progressData.isGenerating ? 'Generating…' : 'Generate Video ✨'}
        </button>

        {/* Result */}
        {videoUrl && (
          <div className="mt-8 p-6 bg-emerald-950/30 border border-emerald-800/50 rounded-2xl text-center">
            <p className="text-emerald-400 font-semibold mb-3">✓ Video generated</p>
            <a
              href={videoUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-purple-300 underline break-all"
            >
              {videoUrl}
            </a>
          </div>
        )}

      </div>

      {/* Progress overlay */}
      <GenerationProgress
        isGenerating={progressData.isGenerating}
        currentStage={progressData.currentStage}
        progress={progressData.progress}
        estimatedTimeLeft={progressData.estimatedTimeLeft}
        error={progressData.error}
        ghostTestScore={progressData.ghostTestScore}
        ghostTestFeedback={progressData.ghostTestFeedback}
        onCancel={cancelGeneration}
      />
    </div>
    </AuthWrapper>
  );
}
