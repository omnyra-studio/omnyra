'use client'

import { useEffect } from 'react'

export default function PWARegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return

    // Kill any stale workbox SW and purge its caches before registering the new one
    navigator.serviceWorker.getRegistrations().then(regs => {
      regs.forEach(reg => {
        const url = reg.active?.scriptURL || reg.installing?.scriptURL || reg.waiting?.scriptURL || ''
        if (url.includes('workbox') || url.includes('next-pwa')) {
          reg.unregister()
        }
      })
    })
    caches.keys().then(keys => {
      keys.forEach(key => {
        if (key.includes('workbox') || key.includes('next-pwa')) {
          caches.delete(key)
        }
      })
    })

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
