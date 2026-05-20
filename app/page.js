'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const C = {
  bg:      '#070710',
  text:    '#f5f3ff',
  sub:     'rgba(245,243,255,0.55)',
  violet:  '#8b5cf6',
  cyan:    '#22d3ee',
  gold:    '#fbbf24',
  surface: 'rgba(255,255,255,0.04)',
  border:  'rgba(255,255,255,0.08)',
}

const TOOLS = [
  { id: 'video',    name: 'AI Video',           desc: 'Idea → finished video in minutes',      emoji: '🎬', color: C.violet },
  { id: 'avatar',   name: 'Presenter Studio',   desc: '40 AI avatars + Digital Twin',          emoji: '👤', color: C.cyan   },
  { id: 'lipsync',  name: 'Lip Sync Studio',    desc: 'Sync any face to any audio track',      emoji: '🎙', color: C.violet },
  { id: 'twin',     name: 'Digital Twin',       desc: 'Your AI presenter from one selfie',     emoji: '📷', color: C.cyan   },
  { id: 'motion',   name: 'Motion Studio AI',   desc: 'Turn any image into cinematic video',   emoji: '✨', color: C.gold   },
  { id: 'image',    name: 'AI Image',           desc: 'Anime, logos, portraits & more',        emoji: '🖼', color: C.violet },
  { id: 'voice',    name: 'AI Voice',           desc: 'Text-to-speech with 100+ voices',       emoji: '🎵', color: C.violet },
  { id: 'clone',    name: 'Voice Clone Studio', desc: 'Record 30s · clone your voice forever', emoji: '🎤', color: C.cyan   },
  { id: 'script',   name: 'Script Studio',      desc: '5 directions · voice-ready scripts',    emoji: '📝', color: C.violet },
  { id: 'oneclick', name: 'Creator Hub',        desc: 'Full AI content production system',     emoji: '⚡', color: C.gold   },
  { id: 'caption',  name: 'Captions & Tags',    desc: '5 captions + hashtags instantly',       emoji: '🏷', color: C.cyan   },
  { id: 'prompt',   name: 'Research Studio',    desc: 'Your AI study & research partner',      emoji: '📚', color: C.violet },
]

// TODO: replace these with your real Stripe price IDs (see /api/checkout/route.js)
// Get them from: Stripe Dashboard → Products → (each product) → Prices → copy ID (price_xxx)
const PLANS = [
  {
    name: 'Free', price: 0, period: 'forever', tag: null, credits: 50, priceId: null,
    features: ['50 credits / month', '30 sec video max', 'Watermark on exports', 'Scripts & research FREE', 'All 7 thinking modes'],
  },
  {
    name: 'Creator', price: 29, period: '/ mo AUD', tag: null, credits: 200,
    priceId: 'price_CREATOR_AUD_ID_HERE',
    features: ['200 credits / month', '1 min video max', 'No watermark · HD exports', 'Scripts & research FREE', 'Commercial rights'],
  },
  {
    name: 'Pro', price: 69, period: '/ mo AUD', tag: 'POPULAR', credits: 500,
    priceId: 'price_PRO_AUD_ID_HERE',
    features: ['500 credits / month', '3 min video max', '4K HD exports', 'Scripts & research FREE', 'Fast queue · Priority', 'Premium voices & models', 'Commercial rights'],
  },
  {
    name: 'Studio', price: 99, period: '/ mo AUD', tag: 'BEST', credits: 1500,
    priceId: 'price_STUDIO_AUD_ID_HERE',
    features: ['1,500 credits / month', '5 min video max', 'Highest quality exports', 'Scripts & research FREE', 'Fastest queue · Top priority', 'Batch generation · Full commercial'],
  },
]

export default function LandingPage() {
  const [checking, setChecking] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [loadingPlan, setLoadingPlan] = useState(null)

  async function handleCheckout(plan, priceId) {
    setLoadingPlan(plan)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ price_id: priceId, plan: plan.toLowerCase() }),
      })
      const { url, error } = await res.json()
      if (error) { alert(error); return }
      window.location.href = url
    } catch {
      alert('Checkout failed. Please try again.')
    } finally {
      setLoadingPlan(null)
    }
  }

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (session) window.location.replace('/dashboard')
        else setChecking(false)
      })
      .catch(() => setChecking(false))
  }, [])

  if (checking) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid rgba(139,92,246,0.2)', borderTopColor: C.violet, animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: '"Instrument Sans","Inter",-apple-system,sans-serif', overflowX: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::selection { background: rgba(139,92,246,0.4); }
        ::-webkit-scrollbar { width: 0; }
        a { cursor: pointer; }
        @keyframes spin    { to { transform: rotate(360deg) } }
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(24px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes drift1  { 0%,100% { transform: translate(0,0) scale(1) } 50% { transform: translate(40px,60px) scale(1.15) } }
        @keyframes drift2  { 0%,100% { transform: translate(0,0) scale(1) } 50% { transform: translate(-50px,-40px) scale(1.1) } }
        @keyframes drift3  { 0%,100% { transform: translate(0,0) } 50% { transform: translate(-30px,50px) } }
        @keyframes pulse   { 0%,100% { opacity: 1 } 50% { opacity: 0.6 } }
        .nav-logo { width: 48px; height: 48px; object-fit: contain; display: block; flex-shrink: 0; }
        @media (min-width: 768px) { .nav-logo { width: 160px; height: 160px; } .nav-brand-text { font-size: 32px !important; } }
        .tool-card:hover { border-color: rgba(139,92,246,0.4) !important; transform: translateY(-2px); }
        .tool-card { transition: border-color 0.2s, transform 0.2s; }
        .plan-card:hover { transform: translateY(-3px); }
        .plan-card { transition: transform 0.2s; }
        .nav-link:hover { color: #f5f3ff !important; }
        .nav-link { transition: color 0.15s; }
        .cta-btn:hover { opacity: 0.9; transform: translateY(-1px); }
        .cta-btn { transition: opacity 0.15s, transform 0.15s; }
        .ghost-btn:hover { background: rgba(255,255,255,0.07) !important; }
        .ghost-btn { transition: background 0.15s; }
      `}</style>

      {/* Background atmosphere */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-20%', left: '-10%', width: '70%', height: '60%', background: 'radial-gradient(circle,rgba(139,92,246,0.35) 0%,transparent 60%)', filter: 'blur(80px)', animation: 'drift1 22s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', bottom: '-20%', right: '-10%', width: '70%', height: '60%', background: 'radial-gradient(circle,rgba(34,211,238,0.28) 0%,transparent 60%)', filter: 'blur(80px)', animation: 'drift2 26s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', top: '40%', right: '15%', width: '30%', height: '30%', background: 'radial-gradient(circle,rgba(251,191,36,0.12) 0%,transparent 70%)', filter: 'blur(60px)', animation: 'drift3 30s ease-in-out infinite' }} />
      </div>

      <div style={{ position: 'relative', zIndex: 1 }}>

        {/* ── NAV ── */}
        <nav style={{ maxWidth: 1100, margin: '0 auto', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            <img
              src="/omnyra-logo.png"
              alt="Omnyra AI"
              className="nav-logo"
            />
            <div className="nav-brand-text" style={{ fontSize: 20, fontWeight: 400, letterSpacing: '-0.02em' }}>
              Omnyra{' '}
              <span style={{ background: 'linear-gradient(135deg,#22d3ee,#8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 600 }}>AI</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <a href="#features" className="nav-link" style={{ padding: '8px 14px', borderRadius: 100, color: C.sub, textDecoration: 'none', fontSize: 13, display: 'none' }}>Features</a>
            <a href="#pricing" className="nav-link" style={{ padding: '8px 14px', borderRadius: 100, color: C.sub, textDecoration: 'none', fontSize: 13 }}>Pricing</a>
            <a href="/login" className="ghost-btn" style={{ padding: '9px 18px', borderRadius: 100, background: C.surface, border: `1px solid ${C.border}`, color: C.sub, textDecoration: 'none', fontSize: 13 }}>Sign in</a>
            <a href="/login" className="cta-btn" style={{ padding: '9px 20px', borderRadius: 100, background: 'linear-gradient(135deg,#8b5cf6,#22d3ee)', color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 600, boxShadow: '0 6px 20px -6px rgba(139,92,246,0.6)', whiteSpace: 'nowrap' }}>Get started free</a>
          </div>
        </nav>

        {/* ── HERO ── */}
        <section style={{ textAlign: 'center', padding: 'clamp(60px,10vw,120px) 24px clamp(80px,12vw,140px)', maxWidth: 860, margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 100, background: 'linear-gradient(135deg,rgba(139,92,246,0.2),rgba(34,211,238,0.15))', border: '1px solid rgba(139,92,246,0.3)', fontSize: 12, fontWeight: 500, marginBottom: 32, animation: 'fadeIn 0.6s ease', color: '#c4b5fd' }}>
            ✦ The Creator OS · 12 tools · One platform
          </div>
          <h1 style={{ fontSize: 'clamp(48px,9vw,88px)', fontWeight: 300, letterSpacing: '-0.04em', lineHeight: 1.02, margin: '0 0 8px', animation: 'slideUp 0.7s ease' }}>
            Create.
          </h1>
          <h1 style={{ fontSize: 'clamp(48px,9vw,88px)', fontWeight: 500, letterSpacing: '-0.04em', lineHeight: 1.02, margin: '0 0 28px', background: 'linear-gradient(135deg,#22d3ee 20%,#8b5cf6 80%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', animation: 'slideUp 0.7s 0.05s both' }}>
            Don&apos;t juggle.
          </h1>
          <p style={{ fontSize: 'clamp(15px,2vw,19px)', color: C.sub, lineHeight: 1.65, margin: '0 auto 44px', maxWidth: 560, animation: 'slideUp 0.7s 0.12s both' }}>
            Videos, images, voice, scripts — from a single canvas.<br />
            No more juggling subscriptions. Scripts &amp; research always free.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', animation: 'slideUp 0.7s 0.2s both' }}>
            <a href="/login" className="cta-btn" style={{ padding: '15px 32px', borderRadius: 100, background: 'linear-gradient(135deg,#8b5cf6,#22d3ee)', color: '#fff', textDecoration: 'none', fontSize: 15, fontWeight: 600, boxShadow: '0 10px 36px -10px rgba(139,92,246,0.7)' }}>
              Start creating free →
            </a>
            <a href="#pricing" className="ghost-btn" style={{ padding: '15px 32px', borderRadius: 100, background: C.surface, border: `1px solid ${C.border}`, color: C.text, textDecoration: 'none', fontSize: 15 }}>
              See pricing
            </a>
          </div>

          {/* Social proof strip */}
          <div style={{ marginTop: 52, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20, flexWrap: 'wrap', animation: 'fadeIn 1s 0.4s both' }}>
            {['12 AI tools', 'AUD pricing', 'Scripts always free', 'Cancel anytime'].map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.sub }}>
                <span style={{ color: C.cyan, fontSize: 10 }}>✓</span> {item}
              </div>
            ))}
          </div>
        </section>

        {/* ── TOOLS / FEATURES ── */}
        <section id="features" style={{ padding: '60px 24px 80px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.sub, marginBottom: 16 }}>12 tools · one subscription</div>
            <h2 style={{ fontSize: 'clamp(30px,5vw,52px)', fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
              Everything a creator needs,<br />
              <span style={{ background: 'linear-gradient(135deg,#22d3ee,#8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 500 }}>finally in one place.</span>
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 14 }}>
            {TOOLS.map(tool => (
              <div key={tool.id} className="tool-card" style={{ padding: '22px', borderRadius: 20, background: C.surface, border: `1px solid ${C.border}` }}>
                <div style={{ width: 46, height: 46, borderRadius: 14, background: `${tool.color}1a`, border: `1px solid ${tool.color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, marginBottom: 16 }}>
                  {tool.emoji}
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6, letterSpacing: '-0.01em' }}>{tool.name}</div>
                <div style={{ fontSize: 12, color: C.sub, lineHeight: 1.55 }}>{tool.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── MODES CALLOUT ── */}
        <section style={{ padding: '0 24px 80px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ padding: '40px 40px', borderRadius: 28, background: 'linear-gradient(135deg,rgba(139,92,246,0.12),rgba(34,211,238,0.08))', border: '1px solid rgba(139,92,246,0.25)', display: 'flex', flexWrap: 'wrap', gap: 32, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ maxWidth: 480 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.sub, marginBottom: 12 }}>Seven thinking modes</div>
              <h3 style={{ fontSize: 'clamp(22px,4vw,34px)', fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1.2, marginBottom: 14 }}>
                One AI. <span style={{ background: 'linear-gradient(135deg,#e879f9,#8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 500 }}>Seven minds.</span>
              </h3>
              <p style={{ fontSize: 14, color: C.sub, lineHeight: 1.6 }}>
                Switch between Viral 🔥, Research 📚, Truth ⚖️, Creator 🎨, Strategist 📈, Educational 🧒, and Genius 🧠 on any tool. Same prompt, radically different results.
              </p>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxWidth: 360 }}>
              {[
                { name: 'Viral', emoji: '🔥', color: '#f43f5e' },
                { name: 'Research', emoji: '📚', color: '#8b5cf6' },
                { name: 'Truth', emoji: '⚖️', color: '#a3e635' },
                { name: 'Creator', emoji: '🎨', color: '#fbbf24' },
                { name: 'Strategist', emoji: '📈', color: '#22d3ee' },
                { name: 'Educational', emoji: '🧒', color: '#60a5fa' },
                { name: 'Genius', emoji: '🧠', color: '#e879f9' },
              ].map(m => (
                <div key={m.name} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 100, background: `${m.color}15`, border: `1px solid ${m.color}35`, fontSize: 13 }}>
                  <span>{m.emoji}</span>
                  <span style={{ color: m.color, fontWeight: 500 }}>{m.name}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── PRICING ── */}
        <section id="pricing" style={{ padding: '60px 24px 80px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 52 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.sub, marginBottom: 16 }}>Simple pricing · AUD</div>
            <h2 style={{ fontSize: 'clamp(30px,5vw,52px)', fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
              Replace your entire<br />
              <span style={{ background: 'linear-gradient(135deg,#22d3ee,#8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 500 }}>creator stack.</span>
            </h2>
            <p style={{ marginTop: 16, color: C.sub, fontSize: 15 }}>Cancel anytime · Scripts &amp; research always free</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 14 }}>
            {PLANS.map(p => {
              const featured = p.tag === 'BEST' || p.tag === 'POPULAR'
              return (
                <div key={p.name} className="plan-card" style={{ padding: '28px', borderRadius: 24, background: featured ? 'linear-gradient(135deg,rgba(139,92,246,0.14),rgba(34,211,238,0.08))' : C.surface, border: featured ? '1px solid rgba(139,92,246,0.4)' : `1px solid ${C.border}`, position: 'relative', display: 'flex', flexDirection: 'column' }}>
                  {p.tag && (
                    <div style={{ position: 'absolute', top: 22, right: 22, padding: '3px 10px', borderRadius: 100, fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', background: p.tag === 'BEST' ? 'linear-gradient(135deg,#fbbf24,#f59e0b)' : 'linear-gradient(135deg,#22d3ee,#8b5cf6)', color: '#0a0a0a' }}>
                      {p.tag}
                    </div>
                  )}
                  <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, letterSpacing: '-0.01em' }}>{p.name}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 42, fontWeight: 300, lineHeight: 1, letterSpacing: '-0.03em' }}>${p.price}</span>
                    <span style={{ fontSize: 13, color: C.sub }}>{p.period}</span>
                  </div>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 100, background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.25)', fontSize: 11, color: '#a78bfa', marginBottom: 20, alignSelf: 'flex-start' }}>
                    ⚡ {p.credits.toLocaleString()} credits / month
                  </div>
                  <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                    {p.features.map(f => (
                      <li key={f} style={{ display: 'flex', gap: 8, fontSize: 13, color: C.sub, alignItems: 'flex-start' }}>
                        <span style={{ color: C.cyan, flexShrink: 0, marginTop: 1 }}>✓</span>{f}
                      </li>
                    ))}
                  </ul>
                  {p.price === 0 ? (
                    <a href="/login" className="cta-btn" style={{ display: 'block', marginTop: 24, padding: '13px', borderRadius: 14, textAlign: 'center', textDecoration: 'none', fontSize: 14, fontWeight: 600, background: C.surface, border: `1px solid ${C.border}`, color: C.text }}>
                      Get started free
                    </a>
                  ) : (
                    <button
                      onClick={() => handleCheckout(p.name, p.priceId)}
                      disabled={!!loadingPlan}
                      className="cta-btn"
                      style={{ display: 'block', width: '100%', marginTop: 24, padding: '13px', borderRadius: 14, textAlign: 'center', fontSize: 14, fontWeight: 600, background: featured ? 'linear-gradient(135deg,#8b5cf6,#22d3ee)' : C.surface, border: featured ? 'none' : `1px solid ${C.border}`, color: featured ? '#fff' : C.text, boxShadow: featured ? '0 8px 24px -8px rgba(139,92,246,0.5)' : 'none', cursor: loadingPlan ? 'wait' : 'pointer', opacity: loadingPlan && loadingPlan !== p.name ? 0.5 : 1 }}
                    >
                      {loadingPlan === p.name ? 'Loading…' : `Start ${p.name} →`}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          <div style={{ marginTop: 24, textAlign: 'center', padding: '16px 20px', borderRadius: 16, background: C.surface, border: `1px solid ${C.border}`, fontSize: 13, color: C.sub }}>
            ✍️ Scripts &amp; Research are always FREE across all plans · Prices in AUD · Cancel anytime
          </div>
        </section>

        {/* ── APP STORE ── */}
        <section style={{ padding: '60px 24px 80px', maxWidth: 720, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.sub, marginBottom: 16 }}>Mobile app</div>
          <h2 style={{ fontSize: 'clamp(28px,5vw,44px)', fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1.15, marginBottom: 16 }}>
            Create on the go.
          </h2>
          <p style={{ color: C.sub, fontSize: 15, marginBottom: 40, lineHeight: 1.65, maxWidth: 480, margin: '0 auto 40px' }}>
            Install Omnyra as a PWA right now — works on iOS, Android &amp; desktop.
            Native app store releases are coming soon.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 28 }}>
            {[
              { label: 'App Store', sub: 'Coming soon', icon: '🍎' },
              { label: 'Google Play', sub: 'Coming soon', icon: '▶' },
            ].map(store => (
              <div key={store.label} style={{ padding: '16px 28px', borderRadius: 18, background: C.surface, border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: 14, opacity: 0.55, cursor: 'default', minWidth: 180 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>{store.icon}</div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 10, color: C.sub, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 3 }}>{store.sub}</div>
                  <div style={{ fontSize: 15, fontWeight: 500 }}>{store.label}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: '16px 20px', borderRadius: 16, background: 'linear-gradient(135deg,rgba(139,92,246,0.1),rgba(34,211,238,0.06))', border: '1px solid rgba(139,92,246,0.2)', fontSize: 13, color: C.sub, lineHeight: 1.6 }}>
            💡 Install now — tap <strong style={{ color: C.text }}>Share</strong> then <strong style={{ color: C.text }}>"Add to Home Screen"</strong> on iOS, or use the install prompt on Android &amp; desktop Chrome
          </div>
        </section>

        {/* ── FOOTER ── */}
        <footer style={{ borderTop: `1px solid ${C.border}`, padding: '44px 24px', maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 24 }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 400, letterSpacing: '-0.02em', marginBottom: 8 }}>
                Omnyra{' '}
                <span style={{ background: 'linear-gradient(135deg,#22d3ee,#8b5cf6)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', fontWeight: 600 }}>AI</span>
              </div>
              <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.6 }}>
                The Creator OS — 12 tools, one subscription.<br />
                Videos, images, voice, scripts from one canvas.
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end' }}>
              <a href="mailto:info@omnyra.studio" style={{ color: C.sub, textDecoration: 'none', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }} className="nav-link">
                ✉ info@omnyra.studio
              </a>
              <a href="/login" style={{ color: C.sub, textDecoration: 'none', fontSize: 13 }} className="nav-link">Sign in →</a>
              <div style={{ fontSize: 11, color: 'rgba(245,243,255,0.25)', marginTop: 4 }}>
                © 2025 Omnyra AI · All rights reserved · Prices in AUD
              </div>
            </div>
          </div>
        </footer>

      </div>
    </div>
  )
}
