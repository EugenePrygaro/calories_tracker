import { useCallback, useState } from 'react'

/** Ширина контейнера через ResizeObserver (графіки рисуються в реальних пікселях — текст не тягнеться). */
export function useWidth(): [(el: HTMLDivElement | null) => () => void, number] {
  const [width, setWidth] = useState(0)
  const ref = useCallback((el: HTMLDivElement | null) => {
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry?.contentRect.width ?? 0)))
    if (el) ro.observe(el)
    return () => ro.disconnect() // React 19: прибирання для callback-ref
  }, [])
  return [ref, width]
}
