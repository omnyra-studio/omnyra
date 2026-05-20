'use client'

import { useEffect } from 'react'

export default function PWARegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw.js').catch(() => {})
    } else {
      // Unregister any stale service workers so cached pages don't intercept dev navigation
      navigator.serviceWorker.getRegistrations().then(regs =>
        regs.forEach(reg => reg.unregister())
      )
    }
  }, [])

  return null
}
