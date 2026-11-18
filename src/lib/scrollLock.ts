import { useEffect } from 'react'

let locks = 0
let savedY = 0

/**
 * Блокує прокрутку сторінки під шторкою. `overflow: hidden` на iPhone не допомагає:
 * коли в шторці фокусують поле, iOS прокручує сам документ під нею, і після закриття
 * головний екран лишається «перекинутим» униз. Тому фіксуємо body на місці
 * (`position: fixed` зі зсувом на поточну прокрутку) і повертаємо прокрутку при закритті.
 * Лічильник — для вкладених шторок/модалок.
 */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return
    if (locks++ === 0) {
      savedY = window.scrollY
      const s = document.body.style
      s.position = 'fixed'
      s.top = `-${savedY}px`
      s.left = '0'
      s.right = '0'
      s.overflow = 'hidden'
    }
    return () => {
      if (--locks > 0) return
      const s = document.body.style
      s.position = s.top = s.left = s.right = s.overflow = ''
      window.scrollTo({ top: savedY, behavior: 'instant' })
    }
  }, [active])
}
