'use client';

interface Props {
  isOpen:   boolean;
  onClose:  () => void;
  feature?: string;
}

export default function UpgradeModal({ isOpen, onClose, feature = '60s videos' }: Props) {
  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, padding: '0 16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#110820', border: '1px solid #2D1B4E', borderRadius: 24,
          padding: '40px 32px', maxWidth: 420, width: '100%', textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '3.5rem', marginBottom: 20 }}>🔒</div>
        <h2 style={{ color: '#E8DEFF', fontSize: '1.6rem', fontWeight: 700, marginBottom: 10 }}>
          Unlock {feature}
        </h2>
        <p style={{ color: '#8B6FA8', fontSize: '0.9rem', lineHeight: 1.6, marginBottom: 32 }}>
          Upgrade to Creator or Studio to create up to 60-second cinematic videos with 6 scenes.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={() => { window.location.href = '/pricing'; }}
            style={{
              width: '100%', padding: '14px 24px', borderRadius: 14, border: 'none',
              background: 'linear-gradient(105deg,#5A3400,#9A7010 20%,#CFA42F 42%,#E8C84A 50%,#CFA42F 58%,#9A7010 80%,#5A3400)',
              backgroundSize: '200% auto', color: '#0D0010',
              fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer',
            }}
          >
            View Plans →
          </button>
          <button
            onClick={onClose}
            style={{
              width: '100%', padding: '12px', borderRadius: 14, border: 'none',
              background: 'transparent', color: '#6B4FA8',
              fontSize: '0.875rem', cursor: 'pointer',
            }}
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
