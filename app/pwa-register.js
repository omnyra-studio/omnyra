'use client'

import { useState, useEffect } from 'react'

export default function PWARegister() {
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    // Already running as installed PWA
    if (window.matchMedia('(display-mode: standalone)').matches) return

    // User already dismissed this session
    if (sessionStorage.getItem('pwa-install-dismissed')) return

    const onPrompt = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setVisible(true)
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', () => setVisible(false))

    return () => window.removeEventListener('beforeinstallprompt', onPrompt)
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
    setVisible(false)
  }

  const handleDismiss = () => {
    sessionStorage.setItem('pwa-install-dismissed', '1')
    setVisible(false)
    setDismissed(true)
  }

  if (!visible || dismissed) return null

  return (
    <div
      role="dialog"
      aria-label="Install Omnyra app"
      style={{
        position: 'fixed',
        bottom: '1.25rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.875rem 1.25rem',
        background: '#0f0f1a',
        border: '1px solid rgba(139,92,246,0.5)',
        borderRadius: '14px',
        boxShadow: '0 8px 32px rgba(139,92,246,0.25)',
        maxWidth: 'calc(100vw - 2rem)',
        animation: 'pwa-slide-up 0.3s ease',
      }}
    >
      <style>{`
        @keyframes pwa-slide-up {
          from { opacity: 0; transform: translateX(-50%) translateY(12px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      {/* Icon */}
      <div
        style={{
          flexShrink: 0,
          width: '40px',
          height: '40px',
          borderRadius: '10px',
          background: 'linear-gradient(135deg, #8b5cf6, #22d3ee)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '22px',
          fontWeight: '900',
          color: '#fff',
          fontFamily: 'sans-serif',
        }}
      >
        O
      </div>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#f5f3ff', fontWeight: '600', fontSize: '14px', lineHeight: 1.2 }}>
          Install Omnyra
        </div>
        <div style={{ color: '#a78bfa', fontSize: '12px', marginTop: '2px' }}>
          Add to home screen for quick access
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        <button
          onClick={handleDismiss}
          style={{
            background: 'transparent',
            border: '1px solid rgba(167,139,250,0.3)',
            color: '#a78bfa',
            borderRadius: '8px',
            padding: '6px 12px',
            fontSize: '13px',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Later
        </button>
        <button
          onClick={handleInstall}
          style={{
            background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)',
            border: 'none',
            color: '#fff',
            borderRadius: '8px',
            padding: '6px 16px',
            fontSize: '13px',
            fontWeight: '600',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Install
        </button>
      </div>
    </div>
  )
}
