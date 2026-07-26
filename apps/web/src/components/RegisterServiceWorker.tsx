'use client'

import { useEffect } from 'react'

/**
 * Registers the app-shell worker (public/sw.js) so the app is installable.
 * Dev is skipped on purpose — caching would fight HMR's chunk requests.
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'development') return
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // no worker is fine: the app just isn't installable on this browser
    })
  }, [])

  return null
}
