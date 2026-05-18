'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

const C = {
  bg:     '#070710',
  surface:'rgba(255,255,255,0.04)',
  border: 'rgba(255,255,255,0.08)',
  text:   '#f5f3ff',
  sub:    'rgba(245,243,255,0.5)',
  violet: '#8b5cf6',
  cyan:   '#22d3ee',
  gold:   '#fbbf24',
}

const PLAN_META = {
  free:    { label: 'Free',    color: C.sub,    emoji: '✦' },
  creator: { label: 'Creator', color: C.violet, emoji: '⚡' },
  pro:     { label: 'Pro',     color: C.cyan,   emoji: '🔥' },
  studio:  { label: 'Studio',  color: C.gold,   emoji: '🚀' },
}

const ACTION_LABELS = {
  image_standard:  'Image',
  image_hd:        'HD Image',
  image_variations:'Image ×4',
  voice_30s:       'Voice clip',
  voice_1min:      'Voice 1 min',
  voice_clone:     'Voice clone',
  video_30s:       'Video 30s',
  video_1min:      'Video 1 min',
  video_2min:      'Video 2 min',
  video_3min:      'Video 3 min',
  video_5min:      'Video 5 min',
  video_regen:     'Video redo',
  avatar_30s:      'Avatar 30s',
  avatar_60s:      'Avatar 60s',
  sync_regen:      'Lip sync redo',
  rewrite:         'Script redo',
}

const CATEGORY_META = {
  image: { label: 'Images',    emoji: '🖼',  color: C.violet },
  voice: { label: 'Voice',     emoji: '🎙',  color: C.cyan   },
  video: { label: 'Video',     emoji: '🎬',  color: C.gold   },
  other: { label: 'Other',     emoji: '✦',   color: C.sub    },
}

function timeAgo(iso) {
  if (!iso) return ''
  const secs  = Math.floor((Date.now() - new Date(iso)) / 1000)
  if (secs < 60)   return 'just now'
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`
  if (secs < 86400)return `${Math.floor(secs / 3600)}h ago`
  if (secs < 172800) return 'yesterday'
  return `${Math.floor(secs / 86400)}d ago`
}

function Card({ children, style }) {
  return (
    <div style={{
      padding: '20px',
      borderRadius: 20,
      background: C.surface,
      border: `1px solid ${C.border}`,
      ...style,
    }}>
      {children}
    </div>
  )
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
      textTransform: 'uppercase', color: C.sub, marginBottom: 14,
    }}>
      {children}
    </div>
  )
}

export default function DashboardPage() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { window.location.replace('/login'); return }

      const res = await fetch('/api/dashboard', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      if (!res.ok) { setError('Failed to load dashboard'); setLoading(false); return }
      setData(await res.json())
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(139,92,246,0.2)', borderTopColor: C.violet, animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.text, fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>⚠</div>
        <div style={{ color: C.sub }}>{error}</div>
        <a href="/" style={{ display: 'inline-block', marginTop: 20, color: C.violet, fontSize: 14 }}>← Back to app</a>
      </div>
    </div>
  )

  const plan       = PLAN_META[data.plan] ?? PLAN_META.free
  const pct        = data.planCredits > 0 ? Math.min(100, Math.round((data.balance / data.planCredits) * 100)) : 0
  const usedPct    = data.planCredits > 0 ? Math.min(100, Math.round((data.usedThisMonth / data.planCredits) * 100)) : 0
  const usageKeys  = ['image', 'voice', 'video', 'other'].filter(k => data.usage[k]?.count > 0)

  return (
    <div style={{
      minHeight: '100vh', background: C.bg, color: C.text,
      fontFamily: '"Instrument Sans","Inter",-apple-system,sans-serif',
      padding: '0 0 60px',
    }}>
      {/* Background glow */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-20%', left: '-10%', width: '60%', height: '50%', background: 'radial-gradient(circle,rgba(139,92,246,0.25) 0%,transparent 60%)', filter: 'blur(80px)' }} />
        <div style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: '60%', height: '50%', background: 'radial-gradient(circle,rgba(34,211,238,0.2) 0%,transparent 60%)', filter: 'blur(80px)' }} />
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 20px', position: 'relative', zIndex: 1 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '52px 0 28px' }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 300, letterSpacing: '-0.02em' }}>Dashboard</div>
            <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{data.email}</div>
          </div>
          <a
            href="/"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 100,
              background: C.surface, border: `1px solid ${C.border}`,
              color: C.text, textDecoration: 'none', fontSize: 13,
            }}
          >
            ← App
          </a>
        </div>

        {/* Plan badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '7px 16px', borderRadius: 100, marginBottom: 20,
          background: `${plan.color}18`, border: `1px solid ${plan.color}40`,
          fontSize: 13, fontWeight: 500, color: plan.color,
        }}>
          {plan.emoji} {plan.label} plan
          {data.plan === 'free' && (
            <a href="/" style={{ color: C.cyan, fontSize: 11, textDecoration: 'none', marginLeft: 4 }}>
              Upgrade →
            </a>
          )}
        </div>

        {/* Credits card */}
        <Card style={{ marginBottom: 14 }}>
          <SectionLabel>Credits</SectionLabel>
          <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
            {/* Remaining */}
            <div style={{
              flex: 1, padding: '16px', borderRadius: 14,
              background: `${C.violet}18`, border: `1px solid ${C.violet}30`,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 32, fontWeight: 300, color: C.violet, lineHeight: 1 }}>
                {data.balance.toLocaleString()}
              </div>
              <div style={{ fontSize: 11, color: C.sub, marginTop: 6 }}>remaining</div>
            </div>
            {/* Used this month */}
            <div style={{
              flex: 1, padding: '16px', borderRadius: 14,
              background: C.surface, border: `1px solid ${C.border}`,
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 32, fontWeight: 300, color: C.text, lineHeight: 1 }}>
                {data.usedThisMonth.toLocaleString()}
              </div>
              <div style={{ fontSize: 11, color: C.sub, marginTop: 6 }}>used this month</div>
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ marginBottom: 6, display: 'flex', justifyContent: 'space-between', fontSize: 11, color: C.sub }}>
            <span>Balance</span>
            <span>{pct}% of {data.planCredits.toLocaleString()} total</span>
          </div>
          <div style={{ height: 6, borderRadius: 99, background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 99,
              width: `${pct}%`,
              background: pct > 20
                ? `linear-gradient(90deg, ${C.violet}, ${C.cyan})`
                : 'linear-gradient(90deg,#ef4444,#f97316)',
              transition: 'width 0.6s ease',
            }} />
          </div>
          {pct <= 20 && (
            <div style={{ marginTop: 12, fontSize: 12, color: '#f97316' }}>
              ⚠ Running low —{' '}
              <a href="/" style={{ color: '#f97316', textDecoration: 'underline' }}>top up credits</a>
            </div>
          )}
        </Card>

        {/* Usage breakdown */}
        {usageKeys.length > 0 && (
          <Card style={{ marginBottom: 14 }}>
            <SectionLabel>Usage this month</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {usageKeys.map(key => {
                const meta = CATEGORY_META[key]
                const stat = data.usage[key]
                const barPct = data.usedThisMonth > 0
                  ? Math.round((stat.credits / data.usedThisMonth) * 100)
                  : 0
                return (
                  <div key={key}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                        <span>{meta.emoji}</span>
                        <span>{meta.label}</span>
                        <span style={{ fontSize: 11, color: C.sub }}>×{stat.count}</span>
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600, color: meta.color }}>
                        {stat.credits} cr
                      </span>
                    </div>
                    <div style={{ height: 3, borderRadius: 99, background: 'rgba(255,255,255,0.06)' }}>
                      <div style={{ height: '100%', borderRadius: 99, width: `${barPct}%`, background: meta.color, opacity: 0.7 }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {/* Recent transactions */}
        {data.transactions.length > 0 && (
          <Card>
            <SectionLabel>Recent activity</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {data.transactions.map((tx, i) => {
                const isCredit = tx.amount > 0
                const label    = tx.type === 'subscription'
                  ? `${tx.description}`
                  : (ACTION_LABELS[tx.description] ?? tx.description)
                return (
                  <div
                    key={i}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '11px 0',
                      borderBottom: i < data.transactions.length - 1 ? `1px solid ${C.border}` : 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
                        background: isCredit ? 'rgba(34,211,238,0.1)' : 'rgba(139,92,246,0.1)',
                        border: `1px solid ${isCredit ? 'rgba(34,211,238,0.2)' : 'rgba(139,92,246,0.15)'}`,
                      }}>
                        {tx.type === 'subscription' ? '🔄'
                          : label.startsWith('Image') ? '🖼'
                          : label.startsWith('Voice') ? '🎙'
                          : label.startsWith('Video') ? '🎬'
                          : label.startsWith('Avatar') ? '👤'
                          : '✦'}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{label}</div>
                        <div style={{ fontSize: 11, color: C.sub, marginTop: 1 }}>
                          {timeAgo(tx.created_at)}
                        </div>
                      </div>
                    </div>
                    <div style={{
                      fontSize: 13, fontWeight: 600,
                      color: isCredit ? C.cyan : C.violet,
                    }}>
                      {isCredit ? '+' : ''}{tx.amount} cr
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {data.transactions.length === 0 && (
          <Card>
            <div style={{ textAlign: 'center', padding: '20px 0', color: C.sub, fontSize: 13 }}>
              No activity yet — start generating to see your usage here.
            </div>
          </Card>
        )}

        {/* Manage */}
        <div style={{ marginTop: 14, display: 'flex', gap: 10 }}>
          <a
            href="/"
            style={{
              flex: 1, padding: '14px', borderRadius: 14, textAlign: 'center',
              textDecoration: 'none', fontSize: 13, fontWeight: 500,
              background: 'linear-gradient(135deg,#8b5cf6,#22d3ee)', color: '#fff',
            }}
          >
            ✦ Open Studio
          </a>
          <a
            href="/"
            onClick={async e => { e.preventDefault(); await supabase.auth.signOut(); window.location.replace('/login') }}
            style={{
              padding: '14px 18px', borderRadius: 14, textAlign: 'center',
              textDecoration: 'none', fontSize: 13, color: C.sub,
              background: C.surface, border: `1px solid ${C.border}`,
            }}
          >
            Sign out
          </a>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        * { box-sizing: border-box; }
        a { cursor: pointer; }
      `}</style>
    </div>
  )
}
