import { AnimatePresence, motion, useDragControls, useMotionValue, useTransform, type PanInfo } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, useId, useRef, type PointerEvent, type ReactNode } from 'react'
import { useSheetFlag } from '@/lib/sheetFlag'
import { useScrollLock } from '@/lib/scrollLock'
import { useKeyboardOpen, useViewportHeight, useViewportTop } from '@/lib/viewport'
import { IconButton } from './Button'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  /** Шторка на весь екран одразу (для пошуку — щоб не «стрибала» висота з результатами). */
  tall?: boolean
}

/**
 * Нижня шторка (bottom sheet).
 * Закривається свайпом вниз за ручку/заголовок, тапом по фону або Esc.
 *
 * Клавіатура: шар шторки займає рівно видиму область (visualViewport), тож шторка
 * завжди стоїть над клавіатурою — і коли iOS сам зсуває видиму область до поля,
 * шторка їде разом із нею, а не підскакує вдруге. Сторінка під шторкою заблокована
 * (useScrollLock), щоб iOS не прокручував головний екран.
 */
export function Modal({ open, title, onClose, children, tall = false }: ModalProps) {
  const titleId = useId()
  const drag = useDragControls()
  // Фон тьмяніє плавно, поки шторку тягнуть вниз
  // Під час появи/закриття y — рядок '100%' (тоді фоном керує обгортка), під час перетягування — пікселі.
  const y = useMotionValue<number | string>(0)
  const backdropOpacity = useTransform(y, (v) => (typeof v === 'number' ? Math.min(Math.max(1 - v / 320, 0), 1) : 1))
  const keyboard = useKeyboardOpen()
  useSheetFlag(open)
  useScrollLock(open)
  const viewport = useViewportHeight()
  const viewportTop = useViewportTop()
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Клавіатура відкрилась чи змінила висоту, або фокус перейшов на інше поле —
  // поле має бути видно над липкою кнопкою внизу (браузер про неї не знає).
  useEffect(() => {
    const box = scroller.current
    if (!open || !box) return
    const reveal = () => requestAnimationFrame(() => revealFocused(box))
    reveal()
    box.addEventListener('focusin', reveal)
    return () => box.removeEventListener('focusin', reveal)
  }, [open, viewport])

  const startDrag = (e: PointerEvent) => drag.start(e)
  const maxHeight = `calc(${viewport}px - env(safe-area-inset-top) - 0.75rem)`
  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 100 || info.velocity.y > 500) onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-x-0 top-0 z-50 flex items-end justify-center"
          style={{ top: viewportTop, height: viewport }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div className="absolute inset-0 bg-black/70" style={{ opacity: backdropOpacity }} onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            // data-kb: клавіатура відкрита — низу шторки не потрібен відступ під home indicator
            data-kb={keyboard || undefined}
            className="group relative flex w-full max-w-[480px] flex-col overflow-hidden rounded-t-3xl border border-b-0 border-line bg-card shadow-2xl"
            style={{ y, maxHeight, ...(tall ? { height: maxHeight } : {}) }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            drag="y"
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={onDragEnd}
          >
            {/* Ручка й заголовок — зона перетягування */}
            <div onPointerDown={startDrag} className="shrink-0 touch-none select-none">
              <div className="flex justify-center pt-2.5 pb-1">
                <span className="h-1.5 w-10 rounded-full bg-line" />
              </div>
              <div className="flex items-center justify-between pr-2 pl-5">
                <h2 id={titleId} className="text-lg font-semibold">
                  {title}
                </h2>
                <IconButton label="Закрити" onClick={onClose} onPointerDown={(e) => e.stopPropagation()}>
                  <X className="size-5" />
                </IconButton>
              </div>
            </div>
            <div ref={scroller} className="flex flex-1 flex-col overflow-y-auto overscroll-contain px-5 pt-2">
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Відступ між полем у фокусі й краєм видимої частини шторки. */
const REVEAL_GAP = 12

/** Прокручує вміст шторки так, щоб поле у фокусі було між верхом і липкою кнопкою внизу. */
function revealFocused(box: HTMLElement) {
  const el = document.activeElement
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) || !box.contains(el)) return
  const area = box.getBoundingClientRect()
  const footer = box.querySelector<HTMLElement>('[data-sheet-footer]')
  const top = area.top + REVEAL_GAP
  const bottom = area.bottom - (footer?.offsetHeight ?? 0) - REVEAL_GAP
  const r = el.getBoundingClientRect()
  if (r.bottom > bottom) box.scrollTop += r.bottom - bottom
  else if (r.top < top) box.scrollTop -= top - r.top
}

/** Низ шторки з головною кнопкою: прилипає до низу, тож видимий і над клавіатурою. */
export function SheetFooter({ children }: { children: ReactNode }) {
  return (
    <div
      data-sheet-footer
      className="sticky bottom-0 -mx-5 mt-auto flex gap-3 border-t border-line bg-card px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] group-data-[kb]:pb-3"
    >
      {children}
    </div>
  )
}
