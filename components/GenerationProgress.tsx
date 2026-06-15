'use client';

import { X } from 'lucide-react';
import { useEffect, useState } from 'react';

const STAGES = [
  { label: 'Analyze',  progressRange: [0, 20]   },
  { label: 'Script',   progressRange: [20, 40]  },
  { label: 'Generate', progressRange: [40, 65]  },
  { label: 'Voice',    progressRange: [65, 80]  },
  { label: 'Stitch',   progressRange: [80, 100] },
] as const;

type GenerationProgressProps = {
  isGenerating:       boolean;
  currentStage?:      string;
  progress:           number;
  estimatedTimeLeft?: number;
  error?:             string | null;
  ghostTestScore?:    number;
  ghostTestFeedback?: string;
  onCancel:           () => void;
};

export default function GenerationProgress({
  isGenerating,
  currentStage,
  progress,
  estimatedTimeLeft,
  error,
  ghostTestScore    = 0,
  ghostTestFeedback = '',
  onCancel,
}: GenerationProgressProps) {
  const [displayProgress, setDisplayProgress] = useState(0);

  const currentStageIndex = STAGES.findIndex(
    (s) => s.label.toLowerCase() === currentStage?.toLowerCase()
  );

  useEffect(() => {
    if (!isGenerating) { setDisplayProgress(0); return; }
    if (progress > displayProgress) {
      const t = setTimeout(() => setDisplayProgress(Math.min(progress, 100)), 50);
      return () => clearTimeout(t);
    } else {
      setDisplayProgress(Math.max(5, progress));
    }
  }, [progress, isGenerating]);

  if (!isGenerating) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 transition-opacity duration-300">
      <div
        className="bg-[#0F0A1F] border border-purple-900/50 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl animate-in fade-in-50 zoom-in-95 duration-300"
        style={{ background: '#0F0A1F' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-purple-900/30">
          <h3 className="text-xl font-semibold text-white">Generating Video</h3>
          <button
            onClick={onCancel}
            className="text-purple-400 hover:text-white p-2 -mr-2 transition-all hover:rotate-90 duration-200"
            aria-label="Cancel"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-8">
          {/* Ghost Test Score — shown once analysis completes */}
          {ghostTestScore > 0 && (
            <div className="mb-6 p-4 bg-purple-950/70 border border-purple-700 rounded-2xl">
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-xs font-bold tracking-widest uppercase text-purple-400">Ghost Test Score</span>
                <span className={`text-xl font-mono font-bold ${
                  ghostTestScore >= 80 ? 'text-emerald-400' : ghostTestScore >= 60 ? 'text-amber-400' : 'text-red-400'
                }`}>
                  {ghostTestScore}/100
                </span>
              </div>
              {ghostTestFeedback && (
                <p className="text-xs text-purple-400 leading-snug">{ghostTestFeedback}</p>
              )}
            </div>
          )}

          {/* Progress Bar */}
          <div className="h-2.5 bg-purple-950 rounded-full overflow-hidden mb-8 relative">
            <div
              className="h-full bg-gradient-to-r from-purple-400 via-purple-300 to-purple-400 transition-all duration-700 ease-out relative"
              style={{ width: `${displayProgress}%` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
            </div>
          </div>

          {/* Status */}
          <div className="flex justify-between text-sm mb-8 text-purple-300">
            <span className="font-medium tabular-nums">{displayProgress}% complete</span>
            <span className="tabular-nums">
              {estimatedTimeLeft
                ? `${Math.ceil(estimatedTimeLeft / 60)} min remaining`
                : 'Almost done...'}
            </span>
          </div>

          {/* Stage Dots */}
          <div className="flex justify-between px-1 mb-6">
            {STAGES.map((stage, index) => {
              const isActive   = index === currentStageIndex;
              const isComplete = index < currentStageIndex;
              const isNext     = index === currentStageIndex + 1;

              return (
                <div key={index} className="flex flex-col items-center gap-3">
                  <div
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-500 ease-out ${
                      isComplete
                        ? 'bg-purple-400 border-purple-400'
                        : isActive
                        ? 'bg-purple-400 border-white scale-125 shadow-[0_0_20px_#c084fc] ring-4 ring-purple-500/40'
                        : isNext
                        ? 'bg-purple-950 border-purple-700 scale-110'
                        : 'bg-purple-950 border-purple-800'
                    }`}
                  >
                    {isComplete && (
                      <span className="text-[10px] text-black font-bold">✓</span>
                    )}
                  </div>
                  <span className={`text-xs font-medium transition-all duration-300 ${
                    isActive || isComplete ? 'text-purple-200' : 'text-purple-700'
                  }`}>
                    {stage.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Emotional Pulse */}
          <div className="pt-5 border-t border-purple-900/50">
            <div className="flex items-center gap-3">
              <div className="flex-1 h-1.5 bg-purple-950 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-fuchsia-400 to-purple-400 transition-all duration-1000"
                  style={{ width: `${Math.min(100, displayProgress * 1.1)}%` }}
                />
              </div>
              <span className="font-mono text-fuchsia-400 tabular-nums text-xs">
                EI: {Math.floor(displayProgress * 0.92)}%
              </span>
            </div>
            <p className="text-[10px] text-purple-600 mt-2">
              Emotional Intelligence Active — analyzing beats · brand memory · micro-expressions
            </p>
          </div>

          {error && (
            <div className="mt-5 text-center text-red-400 text-sm bg-red-950/50 border border-red-900/50 rounded-xl p-3 animate-in fade-in">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
