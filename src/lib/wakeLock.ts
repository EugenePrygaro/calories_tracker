import { useEffect } from 'react'

/**
 * Не гасити екран, поки active (Screen Wake Lock API) — наприклад, поки зважуєте їжу
 * на кухонній вазі з відкритою шторкою. Система сама знімає блокування, коли застосунок
 * згорнули, тож при поверненні просимо знову. Без підтримки в браузері — нічого не робить.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    const request = async () => {
      if (document.visibilityState !== 'visible' || (sentinel && !sentinel.released)) return
      try {
        const s = await navigator.wakeLock.request('screen')
        if (cancelled) void s.release()
        else sentinel = s
      } catch {
        // відмовили (низький заряд, енергозбереження) — екран просто гасне як завжди
      }
    }
    const onVisible = () => void request()

    void request()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      void sentinel?.release().catch(() => {})
      sentinel = null
    }
  }, [active])
}
