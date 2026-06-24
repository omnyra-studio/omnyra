'use client';

const NICHES = [
  // Tier 1 — Recommended
  { key: 'motivation',                    emoji: '🔥', label: 'Motivation / Success',        tier: 1 },
  { key: 'personal-finance-side-hustles', emoji: '💰', label: 'Personal Finance & Investing', tier: 1 },
  { key: 'personal-finance-side-hustles', emoji: '🚀', label: 'Side Hustles & Money',         tier: 1 },
  { key: 'fitness',                       emoji: '💪', label: 'Health & Fitness',             tier: 1 },
  { key: 'beauty-skincare',               emoji: '✨', label: 'Beauty / Skincare',            tier: 1 },
  { key: 'food-recipes',                  emoji: '🍳', label: 'Food & Recipes',               tier: 1 },
  { key: 'product-reviews',               emoji: '📦', label: 'Product Reviews',              tier: 1 },
  { key: 'faceless-stoic',                emoji: '🪨', label: 'Faceless / Stoic',             tier: 1 },
  // Tier 2
  { key: 'luxury',                        emoji: '🌟', label: 'Luxury Lifestyle',             tier: 2 },
  { key: 'technology-ai',                 emoji: '🤖', label: 'Technology & AI',              tier: 2 },
  { key: 'relationships',                 emoji: '❤️', label: 'Relationships / Dating',       tier: 2 },
  { key: 'mental-health',                 emoji: '🧠', label: 'Mental Health',                tier: 2 },
  { key: 'gaming',                        emoji: '🎮', label: 'Gaming',                       tier: 2 },
  { key: 'pet-care',                      emoji: '🐾', label: 'Pets',                         tier: 2 },
  // Tier 3
  { key: 'animation-3d',                  emoji: '🎥', label: '3D Animation',                 tier: 3 },
] as const;

interface Props {
  selected:  string;
  onSelect:  (key: string) => void;
  disabled?: boolean;
}

export default function NicheCardSelector({ selected, onSelect, disabled }: Props) {
  return (
    <div>
      <p style={{ color: '#C4B5D0', fontSize: '0.72rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>
        What type of video do you want to create?
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {NICHES.map((n, idx) => {
          const isSelected = selected === n.key;
          return (
            <button
              key={`${n.key}-${idx}`}
              disabled={disabled}
              onClick={() => onSelect(n.key)}
              style={{
                display:        'flex',
                flexDirection:  'column',
                alignItems:     'center',
                gap:            6,
                padding:        '12px 6px',
                borderRadius:   12,
                border:         isSelected ? '2px solid #C9A84C' : '1px solid #2D1B4E',
                background:     isSelected ? 'rgba(201,168,76,0.12)' : '#0D0020',
                color:          isSelected ? '#F5EFE6' : '#9B72CF',
                cursor:         disabled   ? 'not-allowed' : 'pointer',
                opacity:        disabled   ? 0.6 : 1,
                transition:     'all 0.15s',
                boxShadow:      isSelected ? '0 0 12px rgba(201,168,76,0.25)' : 'none',
                fontSize:       '0.7rem',
                fontWeight:     isSelected ? 700 : 400,
                textAlign:      'center',
                lineHeight:     1.2,
              }}
            >
              <span style={{ fontSize: '1.5rem' }}>{n.emoji}</span>
              <span>{n.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
