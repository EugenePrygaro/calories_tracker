import { AnimatePresence, motion, type MotionStyle } from 'framer-motion'
import { CalendarCheck, ChevronLeft, ChevronRight, Coins, Flame, LoaderCircle, Settings } from 'lucide-react'
import type { ReactNode } from 'react'
import { useDataStore } from '@/data/store'
import { usePlayerProgress } from '@/features/gamification/progress'
import { cn } from '@/lib/cn'
import { dateLabel, toDateKey } from '@/lib/date'
import { useUiStore } from '@/store/ui'

const int = new Intl.NumberFormat('uk-UA')

/** Верх екрана: плашка прогресу + навігація по днях. Прилипає при прокрутці. */
export function DateHeader() {
  return (
    <header className="sticky top-0 z-20 -mx-4 bg-gradient-to-b from-main via-main/90 to-main/0 px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-3">
      <PlayerStrip />
      <DateNav />
    </header>
  )
}

/** Рівень з кільцем досвіду, серія і монети — одна скляна плашка. */
function PlayerStrip() {
  const p = usePlayerProgress()
  const R = 17
  const C = 2 * Math.PI * R

  return (
    <div className="card-static flex items-center gap-3 rounded-2xl py-2 pr-2 pl-2">
      <div className="relative size-11 shrink-0">
        <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx="22" cy="22" r={R} fill="none" strokeWidth="3.5" style={{ stroke: 'rgb(255 255 255 / 0.08)' }} />
          <motion.circle
            cx="22"
            cy="22"
            r={R}
            fill="none"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeDasharray={C}
            initial={{ strokeDashoffset: C }}
            animate={{ strokeDashoffset: C * (1 - p.levelProgress) }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            style={{ stroke: 'var(--accent-primary)', filter: 'drop-shadow(0 0 3px var(--accent-primary))' }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold">{p.level}</span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="text-xs text-muted">
          Рівень <b className="text-fg">{p.level}</b>
        </span>
        <div className="track-inset h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <motion.div
            className="bar-gloss bg-accent-gradient h-full rounded-full"
            style={{ '--sheen-delay': '1.8s' } as MotionStyle}
            initial={{ width: 0 }}
            animate={{ width: `${p.levelProgress * 100}%` }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
          />
        </div>
      </div>

      <Chip title="Днів поспіль" className="bg-streak/10 ring-streak/25">
        <motion.span
          animate={{ scale: [1, 1.18, 1], rotate: [0, -6, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 2.4 }}
          className="flex"
        >
          <Flame className="size-4 fill-streak/40 text-streak" />
        </motion.span>
        {p.streak}
      </Chip>
      <Chip title="Монети" className="bg-coin/10 ring-coin/25">
        <Coins className="size-4 text-coin" />
        {int.format(p.coins)}
      </Chip>
    </div>
  )
}

function Chip({ title, className, children }: { title: string; className: string; children: ReactNode }) {
  return (
    <span title={title} className={cn('flex h-8 items-center gap-1 rounded-full px-2.5 text-sm font-bold ring-1 ring-inset', className)}>
      {children}
    </span>
  )
}

/** Дата у скляній «таблетці» зі стрілками; назва дня виїжджає в бік перемикання. */
function DateNav() {
  const date = useUiStore((s) => s.selectedDate)
  const direction = useUiStore((s) => s.direction)
  const shiftDate = useUiStore((s) => s.shiftDate)
  const goToday = useUiStore((s) => s.goToday)
  const openModal = useUiStore((s) => s.openModal)
  const saving = useDataStore((s) => s.saving > 0)
  const isToday = date === toDateKey()
  const { title, subtitle } = dateLabel(date)

  return (
    <div className="mt-3 flex items-center gap-2">
      <div className="card-static flex h-14 min-w-0 flex-1 items-center rounded-full px-1">
        <NavButton label="Попередній день" onClick={() => shiftDate(-1)}>
          <ChevronLeft className="size-5" />
        </NavButton>
        <div className="relative flex h-full min-w-0 flex-1 items-center justify-center overflow-hidden">
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <motion.div
              key={date}
              custom={direction}
              initial={{ x: direction * 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: direction * -40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 36 }}
              className="flex flex-col items-center leading-tight"
            >
              <span className="text-base font-bold">{title}</span>
              <span className="text-[11px] text-muted">{subtitle}</span>
            </motion.div>
          </AnimatePresence>
        </div>
        <NavButton label="Наступний день" onClick={() => shiftDate(1)}>
          <ChevronRight className="size-5" />
        </NavButton>
      </div>

      <AnimatePresence initial={false}>
        {!isToday && (
          <motion.button
            type="button"
            aria-label="Повернутися на сьогодні"
            title="На сьогодні"
            onClick={goToday}
            initial={{ opacity: 0, scale: 0.6, width: 0 }}
            animate={{ opacity: 1, scale: 1, width: 56 }}
            exit={{ opacity: 0, scale: 0.6, width: 0 }}
            whileTap={{ scale: 0.9 }}
            className="card-static flex size-14 shrink-0 items-center justify-center rounded-full text-primary"
          >
            <CalendarCheck className="size-5" />
          </motion.button>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        aria-label="Денні цілі"
        title="Денні цілі"
        onClick={() => openModal({ type: 'goals' })}
        whileTap={{ scale: 0.9, rotate: 45 }}
        className="card-static relative flex size-14 shrink-0 items-center justify-center rounded-full text-muted"
      >
        <Settings className="size-5" />
        {saving && (
          <LoaderCircle aria-label="Зберігається" className="absolute top-2 right-2 size-3.5 animate-spin text-primary" />
        )}
      </motion.button>
    </div>
  )
}

function NavButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      whileTap={{ scale: 0.85 }}
      className="flex size-12 shrink-0 items-center justify-center rounded-full text-muted active:bg-white/5"
    >
      {children}
    </motion.button>
  )
}
