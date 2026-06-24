'use client';

// Keys MUST exactly match NICHE_SETTINGS keys in lib/config/nicheSettings.ts
const NICHES: ReadonlyArray<{ key: string; emoji: string; label: string }> = [
  { key: 'motivation_success',   emoji: '🔥', label: 'Motivation / Success' },
  { key: 'finance_investing',    emoji: '💰', label: 'Personal Finance & Investing' },
  { key: 'side_hustles',         emoji: '🚀', label: 'Side Hustles & Money Making' },
  { key: 'health_fitness',       emoji: '💪', label: 'Health & Fitness' },
  { key: 'beauty_skincare',      emoji: '✨', label: 'Beauty / Skincare / Makeup' },
  { key: 'food_recipes',         emoji: '🍳', label: 'Food & Recipes' },
  { key: 'product_reviews',      emoji: '📦', label: 'Product Reviews & Launches' },
  { key: 'faceless_stoic',       emoji: '🪨', label: 'Faceless Motivation / Stoic Content' },
  { key: 'luxury_lifestyle',     emoji: '🌟', label: 'Luxury Lifestyle' },
  { key: 'tech_ai',              emoji: '🤖', label: 'Technology & AI' },
  { key: 'relationships_dating', emoji: '❤️', label: 'Relationships & Dating' },
  { key: 'mental_health',        emoji: '🧠', label: 'Mental Health & Wellness' },
  { key: 'gaming',               emoji: '🎮', label: 'Gaming' },
  { key: 'pets',                 emoji: '🐾', label: 'Pets' },
  { key: 'animation_3d',         emoji: '🎨', label: '3D Animation' },
];

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
        {NICHES.map((n) => {
          const isSelected = selected === n.key;
          return (
            <button
              key={n.key}
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
