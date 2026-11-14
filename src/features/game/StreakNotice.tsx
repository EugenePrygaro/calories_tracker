import { AnimatePresence, motion } from 'framer-motion'
import { ShieldCheck, X } from 'lucide-react'
import { dismissStreakNotice, useGame } from '@/data/store'

/** Українські відмінки: 1 день, 2–4 дні, 5–20 днів, 21 день, 22 дні… */
const days = (n: number) => {
  const m10 = n % 10
  const m100 = n % 100
  if (m10 === 1 && m100 !== 11) return 'день'
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'дні'
  return 'днів'
}

/** «Серію врятовано» — блок під HUD, поки його не закриють. */
export function StreakNotice() {
  const notice = useGame()?.notice ?? null

  return (
    <AnimatePresence initial={false}>
      {notice && (
        <motion.div
          key={notice.date}
          role="status"
          initial={{ opacity: 0, height: 0, y: -8 }}
          animate={{ opacity: 1, height: 'auto', y: 0 }}
          exit={{ opacity: 0, height: 0, y: -8 }}
          className="overflow-hidden"
        >
          <div className="flex items-start gap-3 rounded-2xl border border-shield/30 bg-shield/10 py-3 pr-2 pl-3">
            <motion.span
              initial={{ rotate: -20, scale: 0.5 }}
              animate={{ rotate: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 12 }}
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-shield/20 text-shield"
            >
              <ShieldCheck className="size-5" />
            </motion.span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-bold">Серію врятовано!</p>
              <p className="text-muted">
                Пропущено {notice.missed} {days(notice.missed)}, але серія {notice.streak} {days(notice.streak)} триває.{' '}
                {notice.usedShields > 0
                  ? `Використано заморозок: ${notice.usedShields}.`
                  : 'Перший пропущений день — безкоштовний, заморозки не знадобились.'}
              </p>
            </div>
            <button
              type="button"
              onClick={dismissStreakNotice}
              aria-label="Закрити сповіщення"
              className="flex size-9 shrink-0 items-center justify-center rounded-full text-muted active:bg-white/5"
            >
              <X className="size-4" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
