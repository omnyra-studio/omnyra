"use client";

import { useEffect, useState } from "react";
import type { PublicTemplate } from "@/lib/templates";

interface Props {
  selectedId:    string;
  onSelect:      (id: string) => void;
  className?:    string;
}

export default function TemplateSelector({ selectedId, onSelect, className = "" }: Props) {
  const [primary, setPrimary] = useState<PublicTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/templates/list")
      .then(r => r.json())
      .then((data: { primary?: PublicTemplate[] }) => {
        setPrimary(data.primary ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className={`flex gap-2 overflow-x-auto pb-1 ${className}`}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex-shrink-0 w-32 h-20 rounded-xl bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
        {/* "None" option */}
        <button
          onClick={() => onSelect("")}
          className={[
            "flex-shrink-0 flex flex-col items-center justify-center gap-1 px-4 py-3 rounded-xl border text-xs font-medium transition-all",
            selectedId === ""
              ? "bg-white text-black border-white"
              : "bg-white/5 text-white/60 border-white/10 hover:border-white/30 hover:text-white/80",
          ].join(" ")}
        >
          <span className="text-base">✨</span>
          <span>Auto</span>
        </button>

        {primary.map(t => (
          <button
            key={t.id}
            onClick={() => onSelect(t.id === selectedId ? "" : t.id)}
            title={t.description ?? t.name}
            className={[
              "flex-shrink-0 flex flex-col items-start gap-1 px-3 py-2.5 rounded-xl border text-left transition-all min-w-[110px] max-w-[140px]",
              t.id === selectedId
                ? "bg-white text-black border-white"
                : "bg-white/5 text-white/70 border-white/10 hover:border-white/30 hover:text-white",
            ].join(" ")}
          >
            <span className="text-lg leading-none">{t.emoji}</span>
            <span className={[
              "text-[11px] font-semibold leading-tight line-clamp-2",
              t.id === selectedId ? "text-black" : "text-white/90",
            ].join(" ")}>
              {t.name}
            </span>
            <span className={[
              "text-[10px] leading-tight",
              t.id === selectedId ? "text-black/60" : "text-white/40",
            ].join(" ")}>
              {t.default_duration}s · {t.default_energy}
            </span>
          </button>
        ))}
      </div>

      {selectedId && (
        <p className="mt-2 text-[11px] text-white/40">
          {primary.find(t => t.id === selectedId)?.hook_formula ?? ""}
        </p>
      )}
    </div>
  );
}
