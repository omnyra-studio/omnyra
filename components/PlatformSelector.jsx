'use client';
import { useEffect, useRef, useState } from 'react';

const PLATFORMS = [
  { id: 'tiktok',           label: 'TikTok',               icon: '🎵' },
  { id: 'instagram-reels',  label: 'Instagram Reels',       icon: '📸' },
  { id: 'youtube-shorts',   label: 'YouTube Shorts',         icon: '▶️' },
  { id: 'facebook-reels',   label: 'Facebook Reels',         icon: '👥' },
  { id: 'twitter-x',        label: 'Twitter / X',            icon: '✖️' },
  { id: 'linkedin',         label: 'LinkedIn',               icon: '💼' },
  { id: 'pinterest',        label: 'Pinterest',              icon: '📌' },
  { id: 'snapchat',         label: 'Snapchat',               icon: '👻' },
  { id: 'threads',          label: 'Threads',                icon: '🧵' },
  { id: 'youtube-long',     label: 'YouTube (Long Form)',    icon: '🎬' },
];

export { PLATFORMS };

export default function PlatformSelector({ selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function toggle(id) {
    onChange(selected.includes(id) ? selected.filter(s => s !== id) : [...selected, id]);
  }

  const selectedPlatforms = PLATFORMS.filter(p => selected.includes(p.id));
  const triggerLabel = selected.length === 0
    ? 'Select platforms...'
    : `${selected.length} platform${selected.length > 1 ? 's' : ''} selected`;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      {/* Selected pills */}
      {selectedPlatforms.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {selectedPlatforms.map(p => (
            <span
              key={p.id}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '5px 10px',
                borderRadius: 9999,
                background: 'rgba(207,164,47,0.12)',
                border: '1px solid rgba(207,164,47,0.45)',
                color: '#D4A843',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <span>{p.icon}</span>
              <span>{p.label}</span>
              <button
                type="button"
                onClick={() => toggle(p.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#D4A843',
                  cursor: 'pointer',
                  fontSize: 15,
                  lineHeight: 1,
                  padding: 0,
                  marginLeft: 2,
                  opacity: 0.7,
                  fontFamily: 'inherit',
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Dropdown trigger */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%',
          padding: '12px 16px',
          borderRadius: 12,
          border: open
            ? '1px solid rgba(207,164,47,0.5)'
            : '1px solid rgba(204,171,175,0.25)',
          background: '#0D0010',
          color: selected.length > 0 ? '#C084FC' : '#8A7D92',
          fontSize: 14,
          fontFamily: 'inherit',
          cursor: 'pointer',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxSizing: 'border-box',
          outline: 'none',
        }}
      >
        <span>{triggerLabel}</span>
        <span style={{ fontSize: 10, opacity: 0.5 }}>{open ? '▲' : '▼'}</span>
      </button>

      {/* Dropdown list */}
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          zIndex: 50,
          background: '#1a0030',
          border: '1px solid rgba(207,164,47,0.3)',
          borderRadius: 12,
          overflow: 'hidden',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}>
          {PLATFORMS.map(p => {
            const checked = selected.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => toggle(p.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  width: '100%',
                  padding: '11px 16px',
                  border: 'none',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  background: checked ? 'rgba(207,164,47,0.08)' : 'transparent',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  textAlign: 'left',
                }}
              >
                <span style={{
                  width: 18,
                  height: 18,
                  borderRadius: 4,
                  border: checked
                    ? '1px solid rgba(207,164,47,0.7)'
                    : '1px solid rgba(255,255,255,0.2)',
                  background: checked ? 'rgba(207,164,47,0.2)' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 11,
                  flexShrink: 0,
                }}>
                  {checked && <span style={{ color: '#D4A843', fontWeight: 700 }}>✓</span>}
                </span>
                <span style={{ fontSize: 15 }}>{p.icon}</span>
                <span style={{
                  fontSize: 13,
                  color: checked ? '#D4A843' : '#C084FC',
                  fontWeight: checked ? 600 : 400,
                }}>
                  {p.label}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
