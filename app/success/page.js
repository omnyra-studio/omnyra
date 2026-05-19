'use client'
import { useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

const C = {
  bg: '#070710',
  text: '#f5f3ff',
  sub: 'rgba(245,243,255,0.55)',
  violet: '#8b5cf6',
  cyan: '#22d3ee',
}

const PLAN_DETAILS = {
  Creator: { credits: '200', emoji: '⚡', color: '#8b5cf6' },
  Pro:     { credits: '500', emoji: '🔥', color: '#22d3ee' },
  Studio:  { credits: '1,500', emoji: '🚀', color: '#fbbf24' },
}

function SuccessContent() {
  const params = useSearchParams()
  const plan = params.get('plan') || 'Pro'
  const details = PLAN_DETAILS[plan] || PLAN_DETAILS.Pro

  useEffect(() => {
    localStorage.setItem("omnyra_onboarded", "1")
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      background: C.bg,
      color: C.text,
      fontFamily: '"Instrument Sans","Inter",-apple-system,sans-serif',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Background glow */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', top: '-20%', left: '-10%', width: '70%', height: '60%', background: 'radial-gradient(circle,rgba(139,92,246,0.35) 0%,transparent 60%)', filter: 'blur(80px)' }} />
        <div style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: '70%', height: '60%', background: 'radial-gradient(circle,rgba(34,211,238,0.28) 0%,transparent 60%)', filter: 'blur(80px)' }} />
      </div>

      <div style={{ maxWidth: 420, width: '100%', textAlign: 'center', position: 'relative', zIndex: 1 }}>
        {/* Checkmark */}
        <div style={{
          width: 80, height: 80, borderRadius: '50%',
          background: `linear-gradient(135deg, ${details.color}33, ${details.color}11)`,
          border: `2px solid ${details.color}66`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 28px',
          fontSize: 36,
        }}>
          {details.emoji}
        </div>

        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '5px 14px', borderRadius: 100,
          background: 'rgba(139,92,246,0.15)',
          border: '1px solid rgba(139,92,246,0.3)',
          fontSize: 11, fontWeight: 600, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: '#a78bfa', marginBottom: 20,
        }}>
          ✦ Payment confirmed
        </div>

        <h1 style={{ fontSize: 32, fontWeight: 300, letterSpacing: '-0.03em', margin: '0 0 12px' }}>
          Welcome to {plan}
        </h1>
        <p style={{ fontSize: 15, color: C.sub, margin: '0 0 32px', lineHeight: 1.6 }}>
          Your subscription is active. You now have{' '}
          <span style={{ color: C.text, fontWeight: 500 }}>{details.credits} credits/month</span>{' '}
          and full access to all {plan} features.
        </p>

        {/* Feature pills */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 36 }}>
          {['No watermark', 'HD exports', 'Commercial rights', 'Priority queue'].map(f => (
            <div key={f} style={{
              padding: '6px 14px', borderRadius: 100,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              fontSize: 12, color: C.sub,
            }}>
              ✓ {f}
            </div>
          ))}
        </div>

        <a
          href="/"
          style={{
            display: 'block', width: '100%', padding: '15px 20px',
            borderRadius: 100, textAlign: 'center', textDecoration: 'none',
            background: 'linear-gradient(135deg,#8b5cf6,#22d3ee)',
            color: '#fff', fontSize: 15, fontWeight: 600,
            boxShadow: '0 8px 24px -8px rgba(139,92,246,0.6)',
            boxSizing: 'border-box',
          }}
        >
          Start creating →
        </a>

        <div style={{ marginTop: 16, fontSize: 12, color: C.sub }}>
          A receipt has been sent to your email · Cancel anytime
        </div>
      </div>
    </div>
  )
}

export default function SuccessPage() {
  return (
    <Suspense>
      <SuccessContent />
    </Suspense>
  )
}
