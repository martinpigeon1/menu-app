'use client'

import { useEffect, useRef } from 'react'

// Minimal typing for the Screen Wake Lock API (not in older TS lib DOM defs).
interface WakeLockSentinelLike {
  released: boolean
  release: () => Promise<void>
  addEventListener: (type: 'release', listener: () => void) => void
}
interface WakeLockNavigator {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> }
}

/**
 * Keeps the screen awake while `active` is true, using the Screen Wake Lock API.
 * Re-acquires the lock when the tab becomes visible again (the browser releases
 * it automatically on tab switch). No-ops gracefully where unsupported.
 */
export function useWakeLock(active: boolean) {
  const sentinelRef = useRef<WakeLockSentinelLike | null>(null)

  useEffect(() => {
    if (!active) return

    const nav = navigator as Navigator & WakeLockNavigator
    if (!nav.wakeLock) return

    let cancelled = false

    async function acquire() {
      try {
        const sentinel = await nav.wakeLock!.request('screen')
        if (cancelled) {
          sentinel.release().catch(() => {})
          return
        }
        sentinelRef.current = sentinel
        sentinel.addEventListener('release', () => {
          sentinelRef.current = null
        })
      } catch {
        // Permission denied / not allowed (e.g. low battery) — ignore.
      }
    }

    function handleVisibility() {
      if (document.visibilityState === 'visible' && !sentinelRef.current) {
        acquire()
      }
    }

    acquire()
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', handleVisibility)
      sentinelRef.current?.release().catch(() => {})
      sentinelRef.current = null
    }
  }, [active])
}
