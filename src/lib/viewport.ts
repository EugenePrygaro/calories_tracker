import { useSyncExternalStore } from 'react'

/**
 * Екранна клавіатура на телефоні. На iOS (і в Chrome на Android) вона не змінює розмір
 * сторінки, а перекриває її знизу, а щоб показати поле — зсуває видиму область вниз.
 * Тому розмір і зсув видимої області беремо з visualViewport.
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

/**
 * visualViewport, лише якщо сторінку не збільшено жестом: при масштабуванні видима область
 * теж менша за вікно, але це не клавіатура — тоді шторка лишається як без масштабу.
 */
function unzoomed(): VisualViewport | null {
  const vv = window.visualViewport
  return vv && vv.scale < 1.01 ? vv : null
}

/** Чи відкрита екранна клавіатура (видима область помітно нижча за вікно). */
export function useKeyboardOpen(): boolean {
  return useSyncExternalStore(subscribe, () => {
    const vv = unzoomed()
    return !!vv && window.innerHeight - vv.height > 40 // дрібні коливання — це панелі браузера, не клавіатура
  })
}

/** Видима висота екрана з урахуванням клавіатури. */
export function useViewportHeight(): number {
  return useSyncExternalStore(subscribe, () => Math.round(unzoomed()?.height ?? window.innerHeight))
}

/** На скільки браузер зсунув видиму область униз, щоб показати поле над клавіатурою. */
export function useViewportTop(): number {
  return useSyncExternalStore(subscribe, () => Math.round(unzoomed()?.offsetTop ?? 0))
}
