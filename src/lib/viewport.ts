import { useSyncExternalStore } from 'react'

/**
 * Екранна клавіатура на телефоні. На iOS вона не змінює розмір сторінки,
 * а просто перекриває її знизу — тож висоту рахуємо через visualViewport.
 */
function subscribe(onChange: () => void): () => void {
  const vv = window.visualViewport
  vv?.addEventListener('resize', onChange)
  vv?.addEventListener('scroll', onChange)
  return () => {
    vv?.removeEventListener('resize', onChange)
    vv?.removeEventListener('scroll', onChange)
  }
}

/** Скільки пікселів знизу закрито клавіатурою (0, якщо вона схована). */
export function useKeyboardInset(): number {
  return useSyncExternalStore(subscribe, () => {
    const vv = window.visualViewport
    if (!vv) return 0
    const inset = Math.round(window.innerHeight - vv.height - vv.offsetTop)
    return inset > 40 ? inset : 0 // дрібні коливання — це панелі браузера, не клавіатура
  })
}

/** Видима висота екрана з урахуванням клавіатури. */
export function useViewportHeight(): number {
  return useSyncExternalStore(subscribe, () =>
    Math.round(window.visualViewport?.height ?? window.innerHeight),
  )
}
