"use client";

import { useState } from "react";

const ENERGY_OPTIONS = ["Calm", "Natural", "High-energy", "Hype"];
const CAMERA_OPTIONS = ["Selfie", "UGC", "Cinematic", "Documentary"];
const STYLE_OPTIONS = [
  "Girl-talk",
  "Founder",
  "Storytime",
  "Luxury",
  "Alex Hormozi",
  "Faceless drama",
  "Apple minimal",
];

function toKey(label) {
  return label.toLowerCase().replace(/\s+/g, "-");
}

function PillGroup({ options, selected, onChange }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const key = toKey(option);
        const active = selected === key;
        return (
          <button
            key={key}
            onClick={() => onChange(active ? null : key)}
            className={[
              "px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 cursor-pointer",
              active
                ? "bg-violet-600 text-white shadow-[0_0_20px_rgba(139,92,246,0.4)]"
                : "border border-white/10 bg-white/5 text-white/60 hover:border-white/20 hover:bg-white/10 hover:text-white/80",
            ].join(" ")}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <p className="text-xs uppercase tracking-widest text-white/40 mb-3">
      {children}
    </p>
  );
}

export function DirectorMode({ onChange }) {
  const [energy, setEnergy] = useState(null);
  const [camera, setCamera] = useState(null);
  const [style, setStyle] = useState(null);

  function handleChange(field, value) {
    const next = { energy, camera, style, [field]: value };
    if (field === "energy") setEnergy(value);
    if (field === "camera") setCamera(value);
    if (field === "style") setStyle(value);
    onChange?.(next);
  }

  return (
    <div
      className="rounded-2xl p-6 space-y-8"
      style={{ background: "#0a0a0f", border: "1px solid rgba(255,255,255,0.06)" }}
    >
      <div>
        <SectionLabel>Energy</SectionLabel>
        <PillGroup
          options={ENERGY_OPTIONS}
          selected={energy}
          onChange={(v) => handleChange("energy", v)}
        />
      </div>

      <div>
        <SectionLabel>Camera</SectionLabel>
        <PillGroup
          options={CAMERA_OPTIONS}
          selected={camera}
          onChange={(v) => handleChange("camera", v)}
        />
      </div>

      <div>
        <SectionLabel>Style</SectionLabel>
        <PillGroup
          options={STYLE_OPTIONS}
          selected={style}
          onChange={(v) => handleChange("style", v)}
        />
      </div>
    </div>
  );
}

export function useDirectorSettings() {
  const [directorSettings, setDirectorSettings] = useState({
    energy: null,
    camera: null,
    style: null,
  });

  return { directorSettings, setDirectorSettings };
}
