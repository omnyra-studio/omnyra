'use client';

import { useState, useRef } from 'react';
import { Search, Heart, Play, Pause, Check } from 'lucide-react';

type Voice = {
  id:          string;
  name:        string;
  accent:      string;
  gender:      string;
  previewText: string;
};

const VOICES: Voice[] = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', accent: 'American', gender: 'Female', previewText: "Hello, I'm Rachel. This is how I sound in emotional cinematic scenes." },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella',  accent: 'American', gender: 'Female', previewText: "Hi there. My voice brings warmth and depth to storytelling." },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Dom',    accent: 'British',  gender: 'Male',   previewText: "Greetings. Ready for some dramatic narration?" },
  { id: 'TX3LP5s5f2v4cY6p6z5G', name: 'Josh',   accent: 'American', gender: 'Male',   previewText: "Hey, this is Josh. Let's create something powerful." },
];

export default function VoiceLibraryBrowser({
  selectedVoice,
  onSelect,
  favorites       = [],
  onToggleFavorite,
  emotionalArc,
}: {
  selectedVoice:     string;
  onSelect:          (id: string) => void;
  favorites?:        string[];
  onToggleFavorite?: (id: string) => void;
  emotionalArc?:     string;
}) {
  const [search,  setSearch]  = useState('');
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const filtered = VOICES.filter(v =>
    v.name.toLowerCase().includes(search.toLowerCase()) ||
    v.accent.toLowerCase().includes(search.toLowerCase()),
  );

  const playPreview = async (voice: Voice) => {
    if (playing === voice.id) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }

    audioRef.current?.pause();

    try {
      const res  = await fetch('/api/voice-preview', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ voiceId: voice.id, text: voice.previewText }),
      });
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setPlaying(null);
      await audio.play();
      setPlaying(voice.id);
    } catch {
      const u = new SpeechSynthesisUtterance(voice.previewText);
      speechSynthesis.speak(u);
    }
  };

  return (
    <div className="mb-8 p-6 bg-purple-950/40 border border-purple-800 rounded-3xl">
      <div className="flex justify-between items-center mb-5">
        <h4 className="font-semibold text-lg">🎙️ Voice Library</h4>
        <div className="relative w-64">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-purple-400" />
          <input
            type="text"
            placeholder="Search voices..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-[#0F0A1F] border border-purple-700 pl-10 py-2.5 rounded-2xl text-sm outline-none focus:border-purple-500"
            style={{ fontFamily: 'inherit' }}
          />
        </div>
      </div>

      {emotionalArc && emotionalArc !== 'neutral' && (
        <p className="text-xs text-purple-500 mb-4">
          Arc: <span className="text-purple-300">{emotionalArc}</span> — voice settings will be tuned automatically.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
        {filtered.map(voice => {
          const isSelected = selectedVoice === voice.id;
          const isFav      = favorites.includes(voice.id);
          const isPlaying  = playing === voice.id;

          return (
            <div
              key={voice.id}
              onClick={() => onSelect(voice.id)}
              className={`p-4 rounded-2xl border cursor-pointer transition-all ${
                isSelected
                  ? 'border-fuchsia-500 bg-fuchsia-950/50'
                  : 'border-purple-900 hover:border-purple-700 bg-purple-950/20'
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-medium text-white">{voice.name}</div>
                  <div className="text-xs text-purple-400 mt-0.5">{voice.accent} &bull; {voice.gender}</div>
                </div>

                <div className="flex gap-1">
                  <button
                    onClick={e => { e.stopPropagation(); playPreview(voice); }}
                    className="p-2 hover:text-fuchsia-400 transition-colors"
                  >
                    {isPlaying
                      ? <Pause className="w-4 h-4 text-fuchsia-400" />
                      : <Play  className="w-4 h-4 text-purple-400" />}
                  </button>
                  {onToggleFavorite && (
                    <button
                      onClick={e => { e.stopPropagation(); onToggleFavorite(voice.id); }}
                      className="p-2 hover:text-fuchsia-400 transition-colors"
                    >
                      <Heart className={`w-4 h-4 ${isFav ? 'fill-fuchsia-500 text-fuchsia-500' : 'text-purple-600'}`} />
                    </button>
                  )}
                </div>
              </div>

              {isSelected && (
                <div className="text-fuchsia-400 text-xs mt-3 flex items-center gap-1">
                  <Check className="w-3.5 h-3.5" /> Selected
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
