import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'
import { useEffect } from 'react'
import { useUiStore } from '@/store/ui'

export function Toast() {
  const toast = useUiStore((s) => s.toast)
  const hide = useUiStore((s) => s.hideToast)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(hide, 4000)
    return () => clearTimeout(t)
  }, [toast, hide])

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(6rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            role="alert"
            onClick={hide}
            className="pointer-events-auto flex max-w-[448px] items-center gap-3 rounded-2xl border border-danger/40 bg-card px-4 py-3 text-sm shadow-2xl"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 24 }}
          >
            <AlertTriangle className="size-5 shrink-0 text-danger" />
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
