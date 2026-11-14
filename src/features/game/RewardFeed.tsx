import { AnimatePresence, motion } from 'framer-motion'
import { Flame, Info, Sparkles } from 'lucide-react'
import { useEffect } from 'react'
import { CoinIcon } from '@/components/CoinIcon'
import { useGameUi, type RewardToast } from '@/store/gameUi'

const TTL_MS = 2800

/** Спливаючі нагороди під шапкою: «+5 · Сніданок» з іконкою калокоїна. */
export function RewardFeed() {
  const toasts = useGameUi((s) => s.toasts)

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+9.5rem)] z-[60] mx-auto flex max-w-[480px] flex-col items-center gap-2 px-4"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <Toast key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  )
}

function Toast({ toast }: { toast: RewardToast }) {
  const remove = useGameUi((s) => s.removeToast)
  useEffect(() => {
    const timer = setTimeout(() => remove(toast.id), TTL_MS)
    return () => clearTimeout(timer)
  }, [toast.id, remove])

  const Icon = toast.tone === 'streak' ? Flame : toast.tone === 'info' ? Info : Sparkles

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -16, scale: 0.85 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -10, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 420, damping: 28 }}
      className="flex items-center gap-2 rounded-full border border-line bg-card/95 py-1.5 pr-3.5 pl-2 text-sm shadow-xl"
    >
      <span
        className={
          toast.tone === 'streak'
            ? 'flex size-6 items-center justify-center rounded-full bg-streak/20 text-streak'
            : toast.tone === 'info'
              ? 'flex size-6 items-center justify-center rounded-full bg-white/10 text-muted'
              : 'flex size-6 items-center justify-center rounded-full bg-primary/20 text-primary'
        }
      >
        <Icon className="size-3.5" />
      </span>
      {toast.coins !== 0 && (
        <b className="flex items-center gap-0.5 text-coin">
          {toast.coins > 0 ? '+' : ''}
          {toast.coins} <CoinIcon className="size-4" strokeWidth={2.2} />
        </b>
      )}
      <span className="text-muted">{toast.label}</span>
    </motion.div>
  )
}
