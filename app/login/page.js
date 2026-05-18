'use client'
import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

// This page is a fallback for direct /login URL visits.
// The primary login flow is handled inline within the main SPA (app/page.js).
export default function LoginPage() {
  const [mode, setMode] = useState('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  // Redirect to home if already logged in
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) window.location.replace('/')
      else setLoading(false)
    })
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) { setError(error.message); setLoading(false) }
      else setSuccess('Account created! Check your email, then sign in.')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { setError(error.message); setLoading(false) }
      else window.location.replace('/')
    }
  }

  const C = {
    bg: '#070710', surface: 'rgba(255,255,255,0.04)',
    border: 'rgba(255,255,255,0.08)', text: '#f5f3ff', sub: 'rgba(245,243,255,0.55)',
  }

  if (loading) {
    return (
      <div style={{minHeight:'100vh',background:C.bg,display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{width:28,height:28,borderRadius:'50%',border:'2px solid rgba(255,255,255,0.15)',borderTopColor:'#8b5cf6',animation:'spin 1s linear infinite'}}/>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  return (
    <div style={{minHeight:'100vh',background:C.bg,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px',fontFamily:'"Instrument Sans","Inter",system-ui,sans-serif',color:C.text}}>
      <div style={{width:'100%',maxWidth:400}}>
        <div style={{textAlign:'center',marginBottom:36}}>
          <div style={{fontSize:30,fontWeight:300,letterSpacing:'-0.03em'}}>
            Omnyra <span style={{background:'linear-gradient(135deg,#22d3ee,#8b5cf6)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',fontWeight:500}}>AI</span>
          </div>
          <div style={{marginTop:6,fontSize:13,color:C.sub}}>The Creator OS</div>
        </div>

        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:20,padding:'28px 24px'}}>
          <div style={{display:'flex',background:'rgba(255,255,255,0.04)',borderRadius:12,padding:4,marginBottom:24,border:`1px solid ${C.border}`}}>
            {['signin','signup'].map(m=>(
              <button key={m} onClick={()=>{setMode(m);setError(null);setSuccess(null);}} style={{flex:1,padding:'10px',borderRadius:10,border:'none',cursor:'pointer',fontSize:14,fontWeight:600,fontFamily:'inherit',transition:'all 0.2s',background:mode===m?'linear-gradient(135deg,rgba(139,92,246,0.3),rgba(34,211,238,0.2))':'transparent',color:mode===m?'#fff':C.sub}}>
                {m==='signin'?'Sign In':'Sign Up'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',gap:14}}>
            <div>
              <div style={{fontSize:11,color:C.sub,marginBottom:6,fontWeight:500,letterSpacing:'0.08em',textTransform:'uppercase'}}>Email</div>
              <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="you@example.com"
                style={{width:'100%',padding:'13px 16px',background:'rgba(255,255,255,0.05)',border:`1px solid ${C.border}`,borderRadius:12,color:C.text,fontSize:15,outline:'none',boxSizing:'border-box',fontFamily:'inherit'}}/>
            </div>
            <div>
              <div style={{fontSize:11,color:C.sub,marginBottom:6,fontWeight:500,letterSpacing:'0.08em',textTransform:'uppercase'}}>Password</div>
              <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="••••••••"
                style={{width:'100%',padding:'13px 16px',background:'rgba(255,255,255,0.05)',border:`1px solid ${C.border}`,borderRadius:12,color:C.text,fontSize:15,outline:'none',boxSizing:'border-box',fontFamily:'inherit'}}/>
            </div>

            {error   && <div style={{padding:'11px 14px',borderRadius:12,background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.25)',color:'#f87171',fontSize:13}}>{error}</div>}
            {success && <div style={{padding:'11px 14px',borderRadius:12,background:'rgba(52,211,153,0.1)',border:'1px solid rgba(52,211,153,0.25)',color:'#34d399',fontSize:13}}>{success}</div>}

            <button type="submit" disabled={loading} style={{padding:'14px',background:'linear-gradient(135deg,#8b5cf6,#22d3ee)',border:'none',borderRadius:12,color:'#fff',fontSize:15,fontWeight:700,cursor:'pointer',opacity:loading?0.7:1,fontFamily:'inherit',marginTop:4}}>
              {loading?'Please wait…':mode==='signin'?'Sign In':'Create Account'}
            </button>
          </form>

          <div style={{textAlign:'center',marginTop:18,fontSize:12,color:C.sub}}>
            No credit card required · Free plan available
          </div>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}
