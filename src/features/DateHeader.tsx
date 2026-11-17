import { AnimatePresence, motion } from 'framer-motion'
import { CalendarCheck, ChevronLeft, ChevronRight, LoaderCircle, Settings, CloudUpload } from 'lucide-react'
import type { ReactNode } from 'react'
import { useDataStore, usePending } from '@/data/store'
import { Hud } from '@/features/game/Hud'
import { dateLabel, toDateKey } from '@/lib/date'
import { useUiStore } from '@/store/ui'

/** Верх екрана: HUD гейміфікації + навігація по днях. Прилипає при прокрутці. */
export function DateHeader() {
  return (
    <header data-app-header className="sticky top-0 z-20 -mx-4 bg-gradient-to-b from-main from-80% to-main/0 px-4 pt-[calc(env(safe-area-inset-top)+0.5rem)] pb-3">
      <Hud />
      <DateNav />
    </header>
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
  const pending = usePending()
  const isToday = date === toDateKey()
  const { title, subtitle } = dateLabel(date)

  return (
    <div className="mt-3 flex items-center gap-2">
      <div className="card flex h-14 min-w-0 flex-1 items-center rounded-full px-1">
        <NavButton label="Попередній день" onClick={() => shiftDate(-1)}>
          <ChevronLeft className="size-5" />
        </NavButton>
        {/* Тап по даті — календар (розфарбований тепловою картою) */}
        <button
          type="button"
          onClick={() => openModal({ type: 'calendar' })}
          aria-label={`${title}, ${subtitle}. Відкрити календар`}
          className="relative flex h-full min-w-0 flex-1 items-center justify-center overflow-hidden rounded-full active:bg-white/[0.04]"
        >
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <motion.div
              key={date}
              custom={direction}
              initial={{ x: direction * 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: direction * -40, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 420, damping: 36 }}
              className="flex max-w-full flex-col items-center leading-tight"
            >
              <span className="text-base font-bold">{title}</span>
              <span className="block max-w-full truncate text-[11px] text-muted">{subtitle}</span>
            </motion.div>
          </AnimatePresence>
        </button>
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
            className="card flex size-14 shrink-0 items-center justify-center rounded-full text-primary"
          >
            <CalendarCheck className="size-5" />
          </motion.button>
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        aria-label="Налаштування"
        title="Денні цілі"
        onClick={() => openModal({ type: 'goals' })}
        whileTap={{ scale: 0.9, rotate: 45 }}
        className="card relative flex size-14 shrink-0 items-center justify-center rounded-full text-muted"
      >
        <Settings className="size-5" />
        {/* офлайн-черга: зміни збережено на телефоні, чекають мережі */}
        <AnimatePresence>
          {pending > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              title={`Чекають мережі: ${pending}`}
              aria-label={`Змін чекають мережі: ${pending}`}
              className="absolute -top-1 -left-1 flex h-5 items-center gap-0.5 rounded-full bg-warning px-1.5 text-[10px] font-bold text-main shadow"
            >
              <CloudUpload className="size-3" />
              {pending}
            </motion.span>
          )}
        </AnimatePresence>
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
