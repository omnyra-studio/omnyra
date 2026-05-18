'use client'
import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function LoginPage() {
  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else setSuccess('Account created! You can now sign in.')
} else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
      else {
        await new Promise(r => setTimeout(r, 500))
        window.location.replace('/')
      }
    }
    setLoading(false)
  }

  const C = {
    bg: '#0a0a0f',
    surface: '#13131a',
    border: 'rgba(255,255,255,0.08)',
    text: '#f0eef8',
    sub: '#7a788a',
    accent: '#a78bfa',
  }

  return (
    <div style={{minHeight:'100vh',background:C.bg,display:'flex',alignItems:'center',justifyContent:'center',padding:'20px',fontFamily:'system-ui,sans-serif'}}>
      <div style={{width:'100%',maxWidth:400}}>
        {/* Logo */}
        <div style={{textAlign:'center',marginBottom:40}}>
          <div style={{fontSize:32,fontWeight:800,background:'linear-gradient(135deg,#a78bfa,#e879f9)',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent',marginBottom:8}}>
            Omnyra AI
          </div>
          <div style={{color:C.sub,fontSize:14}}>The Creator Operating System</div>
        </div>

        {/* Card */}
        <div style={{background:C.surface,border:`1px solid ${C.border}`,borderRadius:20,padding:'32px 28px'}}>
          {/* Toggle */}
          <div style={{display:'flex',background:'rgba(255,255,255,0.04)',borderRadius:12,padding:4,marginBottom:28}}>
            {['signin','signup'].map(m => (
              <button key={m} onClick={()=>setMode(m)} style={{flex:1,padding:'10px',borderRadius:10,border:'none',cursor:'pointer',fontSize:14,fontWeight:600,transition:'all 0.2s',background:mode===m?'rgba(167,139,250,0.15)':'transparent',color:mode===m?C.accent:C.sub}}>
                {m === 'signin' ? 'Sign In' : 'Sign Up'}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:12,color:C.sub,marginBottom:8,fontWeight:500}}>Email</div>
              <input
                type="email" value={email} onChange={e=>setEmail(e.target.value)} required
                placeholder="you@example.com"
                style={{width:'100%',padding:'13px 16px',background:'rgba(255,255,255,0.04)',border:`1px solid ${C.border}`,borderRadius:12,color:C.text,fontSize:15,outline:'none',boxSizing:'border-box'}}
              />
            </div>
            <div style={{marginBottom:24}}>
              <div style={{fontSize:12,color:C.sub,marginBottom:8,fontWeight:500}}>Password</div>
              <input
                type="password" value={password} onChange={e=>setPassword(e.target.value)} required
                placeholder="••••••••"
                style={{width:'100%',padding:'13px 16px',background:'rgba(255,255,255,0.04)',border:`1px solid ${C.border}`,borderRadius:12,color:C.text,fontSize:15,outline:'none',boxSizing:'border-box'}}
              />
            </div>

            {error && <div style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:10,padding:'12px 14px',color:'#f87171',fontSize:13,marginBottom:16}}>{error}</div>}
            {success && <div style={{background:'rgba(52,211,153,0.1)',border:'1px solid rgba(52,211,153,0.3)',borderRadius:10,padding:'12px 14px',color:'#34d399',fontSize:13,marginBottom:16}}>{success}</div>}

            <button type="submit" disabled={loading} style={{width:'100%',padding:'14px',background:'linear-gradient(135deg,#a78bfa,#e879f9)',border:'none',borderRadius:12,color:'#fff',fontSize:15,fontWeight:700,cursor:loading?'not-allowed':'pointer',opacity:loading?0.7:1,transition:'all 0.2s'}}>
              {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          <div style={{textAlign:'center',marginTop:20,fontSize:13,color:C.sub}}>
            No credit card required · Free plan available
          </div>
        </div>
      </div>
    </div>
  )
}