import { useEffect } from 'react'

let openCount = 0

/**
 * Поки відкрита шторка чи модалка — атрибут <html data-sheet>. CSS за ним ставить на паузу
 * бліки й фонові ефекти під шторкою. Замість `body:has([role=dialog])`: селектор :has
 * браузер перевіряє при кожній зміні DOM, а атрибут на <html> — лише коли він змінюється.
 */
export function useSheetFlag(active: boolean): void {
  useEffect(() => {
    if (!active) return
    openCount++
    document.documentElement.dataset.sheet = ''
    return () => {
      openCount--
      if (openCount === 0) delete document.documentElement.dataset.sheet
    }
  }, [active])
}
