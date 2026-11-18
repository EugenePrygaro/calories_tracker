import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion'
import { History, Plus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { MEAL_LABELS, portionUnitLabel, type Entry, type MealType } from '@shared/model.js'
import { sum } from '@shared/nutrition.js'
import { AnimatedNumber } from '@/components/AnimatedNumber'
import { IconButton } from '@/components/ui/Button'
import { copyEntries, loadDay, removeEntry, useDay } from '@/data/store'
import { cn } from '@/lib/cn'
import { addDays, toDateKey } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { grams, kcal, macrosLine } from '@/lib/format'
import { useUiStore } from '@/store/ui'
import { MEAL_ICONS } from './mealIcons'

interface MealSectionProps {
  meal: MealType
  entries: readonly Entry[]
}

export function MealSection({ meal, entries }: MealSectionProps) {
  const openModal = useUiStore((s) => s.openModal)
  const totals = sum(entries)
  const Icon = MEAL_ICONS[meal]
  const repeat = useYesterdayMeal(meal, entries.length === 0)

  // «Стрибок» калорій у заголовку, коли їх стало більше (щойно додали страву)
  const [prevKcal, setPrevKcal] = useState(totals.kcal)
  const [bump, setBump] = useState(0)
  if (totals.kcal !== prevKcal) {
    if (totals.kcal > prevKcal) setBump((b) => b + 1)
    setPrevKcal(totals.kcal)
  }

  return (
    <section data-main-card className="card rounded-3xl">
      <header className="flex items-center gap-3 p-4">
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center transition-colors',
            entries.length ? 'text-primary' : 'text-muted',
          )}
        >
          <Icon className="size-6" strokeWidth={1.6} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h2 className="text-base font-bold">{MEAL_LABELS[meal]}</h2>
            <motion.span
              key={bump}
              initial={bump ? { scale: 1.25, color: 'var(--accent-primary)' } : false}
              animate={{ scale: 1, color: 'var(--text-muted)' }}
              transition={{ type: 'spring', stiffness: 400, damping: 15 }}
              className="inline-block origin-left text-sm"
            >
              <AnimatedNumber value={totals.kcal} format={kcal} /> ккал
            </motion.span>
          </div>
          <p className="text-xs tracking-wider text-muted">{macrosLine(totals)}</p>
        </div>
        <IconButton
          label={`Додати: ${MEAL_LABELS[meal]}`}
          data-meal-add
          onClick={() => openModal({ type: 'add', meal })}
          className="border border-primary/30 bg-primary/15 text-primary shadow-[0_0_14px_-4px_var(--accent-primary)] hover:bg-primary/25 hover:text-primary"
        >
          <Plus className="size-5" />
        </IconButton>
      </header>

      {/* Порожній прийом їжі, а вчора в ньому щось було — повторити одним тапом */}
      <AnimatePresence initial={false}>
        {repeat && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <button
              type="button"
              onClick={repeat.run}
              aria-label={`${MEAL_LABELS[meal]} як учора: ${repeat.names}`}
              className="mx-4 mb-3 flex w-[calc(100%-2rem)] items-center gap-2 rounded-xl bg-white/[0.04] px-3 py-2 text-left text-xs text-muted ring-1 ring-white/[0.06] ring-inset transition-colors active:bg-white/[0.08]"
            >
              <History className="size-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate">
                <b className="text-fg">Як учора</b> · {repeat.names}
              </span>
              <span className="shrink-0 font-semibold text-fg">{kcal(repeat.kcal)} ккал</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Список завжди змонтований — тоді анімуються і перший доданий, і останній видалений запис */}
      <ul className={cn('transition-[border-color]', entries.length ? 'border-t border-line pb-1' : 'border-t border-transparent')}>
        <AnimatePresence initial={false}>
          {entries.map((e) => (
            <EntryRow key={e.id} entry={e} />
          ))}
        </AnimatePresence>
      </ul>
    </section>
  )
}

/** Наскільки потягнути рядок уліво, щоб видалити (або швидкий змах). */
const DELETE_DISTANCE = 96

/**
 * Рядок запису. Видалення — свайпом уліво (смітник у кожному рядку легко було зачепити);
 * ще можна видалити з форми редагування. Скасувати — кнопкою «Повернути» в тості.
 */
function EntryRow({ entry }: { entry: Entry }) {
  const openModal = useUiStore((s) => s.openModal)
  const x = useMotionValue(0)
  // червона підкладка росте з правого краю рівно на відстань, на яку зсунули рядок
  const reveal = useTransform(x, (v) => Math.max(-v, 0))
  const armed = useTransform(x, (v) => (v > -2 ? 0 : v <= -DELETE_DISTANCE ? 1 : 0.55))
  const dragged = useRef(false)

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0, x: -24 }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      className="relative overflow-hidden"
    >
      <motion.div
        aria-hidden
        // без padding: інакше підкладка шириною 0 однаково лишала б смужку
        className="absolute inset-y-0 right-0 overflow-hidden bg-danger text-white"
        style={{ width: reveal, opacity: armed }}
      >
        <Trash2 className="absolute top-1/2 right-5 size-5 -translate-y-1/2" />
      </motion.div>
      <motion.div
        data-row-swipe
        drag="x"
        dragDirectionLock
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={{ left: 0.9, right: 0 }}
        style={{ x }}
        onDragStart={() => {
          dragged.current = true
        }}
        onDrag={(_, info) => {
          // легкий відгук, коли свайп «зведено»
          if (info.offset.x <= -DELETE_DISTANCE && x.getPrevious()! > -DELETE_DISTANCE) haptic(8)
        }}
        onDragEnd={(_, info) => {
          if (info.offset.x <= -DELETE_DISTANCE || info.velocity.x < -700) removeEntry(entry)
          setTimeout(() => (dragged.current = false), 0)
        }}
        className="relative flex items-center py-1 pr-3 pl-2"
      >
        <button
          type="button"
          onClick={() => {
            if (!dragged.current) openModal({ type: 'edit', date: entry.date, entryId: entry.id })
          }}
          aria-label={`${entry.name}, ${kcal(entry.kcal)} ккал. Змахніть уліво, щоб видалити`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors active:bg-white/[0.05]"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{entry.name}</p>
            <p className="truncate text-xs text-muted">
              {entry.portion && `${grams(entry.portion.count)} ${portionUnitLabel(entry.portion.unit, entry.portion.count)} · `}
              {entry.grams !== null && `${grams(entry.grams)} г · `}
              {macrosLine(entry)}
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold">{kcal(entry.kcal)}</span>
        </button>
      </motion.div>
    </motion.li>
  )
}

/**
 * «Як учора» для порожнього прийому їжі сьогодні: учорашні страви цього ж прийому, якщо вони є.
 * Лише для сьогодні — інакше гортання днів тягнуло б із сервера ще й попередній день до кожного.
 * Запити дедуплікуються в loadDay.
 */
function useYesterdayMeal(meal: MealType, emptyMeal: boolean) {
  const date = useUiStore((s) => s.selectedDate)
  const empty = emptyMeal && date === toDateKey()
  const yesterday = addDays(date, -1)
  const day = useDay(yesterday)
  const [copying, setCopying] = useState(false)

  useEffect(() => {
    if (empty && !day.loaded) void loadDay(yesterday)
  }, [empty, day.loaded, yesterday])
  // після копіювання прийом уже не порожній — скидаємо позначку на наступний раз
  if (!empty && copying) setCopying(false)

  const entries = empty && !copying ? day.entries.filter((e) => e.meal === meal) : []
  if (entries.length === 0) return null
  return {
    names: entries.map((e) => e.name).join(', '),
    kcal: sum(entries).kcal,
    run: () => {
      haptic()
      setCopying(true) // одразу ховаємо кнопку — повторний тап не дасть дублікатів
      void copyEntries(entries, date, meal).catch(() => setCopying(false)) // помилку покаже тост
    },
  }
}
