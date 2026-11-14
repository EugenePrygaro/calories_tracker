import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, Info } from 'lucide-react'
import { useEffect } from 'react'
import { cn } from '@/lib/cn'
import { useUiStore } from '@/store/ui'

/** Тост над кнопкою «+»: помилки збереження і дії на кшталт «Видалено · Повернути». */
export function Toast() {
  const toast = useUiStore((s) => s.toast)
  const hide = useUiStore((s) => s.hideToast)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(hide, toast.action ? 5000 : 4000)
    return () => clearTimeout(t)
  }, [toast, hide])

  return (
    // вище за модалку ачівки (z-85), щоб помилку забирання нагороди було видно
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-[90] flex justify-center px-4">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            role={toast.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex max-w-[448px] items-center gap-3 rounded-2xl border bg-card py-2 pr-2 pl-4 text-sm shadow-2xl',
              toast.tone === 'error' ? 'border-danger/40' : 'border-line',
            )}
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
          >
            {toast.tone === 'error' ? (
              <AlertTriangle className="size-5 shrink-0 text-danger" />
            ) : (
              <Info className="size-5 shrink-0 text-muted" />
            )}
            <span className="min-w-0 flex-1 py-1.5">{toast.message}</span>
            {toast.action ? (
              <button
                type="button"
                onClick={() => {
                  toast.action?.run()
                  hide()
                }}
                className="h-9 shrink-0 rounded-xl bg-primary/15 px-3 font-bold text-primary active:bg-primary/25"
              >
                {toast.action.label}
              </button>
            ) : (
              <button type="button" onClick={hide} aria-label="Закрити" className="h-9 shrink-0 px-2 text-muted">
                ✕
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
