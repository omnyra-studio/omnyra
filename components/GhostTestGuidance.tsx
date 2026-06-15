'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle, Lightbulb, ChevronDown, ChevronUp } from 'lucide-react';

export default function GhostTestGuidance() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mb-8 border border-purple-800/80 rounded-3xl overflow-hidden bg-purple-950/40">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-5 flex items-center justify-between hover:bg-purple-950/60 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="text-2xl">👻</div>
          <div className="text-left">
            <h4 className="font-semibold">Ghost Test Guidance</h4>
            <p className="text-xs text-purple-400">Show, don&apos;t tell — write better prompts</p>
          </div>
        </div>
        {isOpen ? <ChevronUp className="w-5 h-5 text-purple-400" /> : <ChevronDown className="w-5 h-5 text-purple-400" />}
      </button>

      {isOpen && (
        <div className="px-6 pb-6 border-t border-purple-800/60">
          <div className="pt-5 text-sm text-purple-300 mb-6">
            A silent ghost should understand the emotion <span className="text-white">purely through visible actions</span>.
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center gap-2 text-red-400 mb-3">
                <AlertTriangle className="w-4 h-4" />
                <strong>Avoid — Telling</strong>
              </div>
              <ul className="space-y-2 text-xs text-purple-400">
                <li>&bull; &ldquo;She was heartbroken&rdquo;</li>
                <li>&bull; &ldquo;He felt furious&rdquo;</li>
                <li>&bull; &ldquo;They were deeply in love&rdquo;</li>
              </ul>
            </div>

            <div>
              <div className="flex items-center gap-2 text-emerald-400 mb-3">
                <CheckCircle className="w-4 h-4" />
                <strong>Use — Showing</strong>
              </div>
              <ul className="space-y-2 text-xs text-purple-300">
                <li>&bull; &ldquo;She stares at the unopened envelope, fingers trembling, then slowly pushes it away&rdquo;</li>
                <li>&bull; &ldquo;He slams the plate down so hard it cracks, chest heaving&rdquo;</li>
                <li>&bull; &ldquo;They sit close, hands almost touching but never meeting&rdquo;</li>
              </ul>
            </div>
          </div>

          <div className="mt-6 pt-5 border-t border-purple-800 flex gap-3 text-xs">
            <Lightbulb className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
            <p className="text-purple-400">
              Focus on body language, object interaction, and environment. Strong physical actions = higher Ghost Test Score.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
