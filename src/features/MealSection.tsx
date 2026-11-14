import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { MEAL_LABELS, type Entry, type MealType } from '@shared/model.js'
import { sum } from '@shared/nutrition.js'
import { AnimatedNumber } from '@/components/AnimatedNumber'
import { IconButton } from '@/components/ui/Button'
import { removeEntry } from '@/data/store'
import { cn } from '@/lib/cn'
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

  // «Стрибок» калорій у заголовку, коли їх стало більше (щойно додали страву)
  const [prevKcal, setPrevKcal] = useState(totals.kcal)
  const [bump, setBump] = useState(0)
  if (totals.kcal !== prevKcal) {
    if (totals.kcal > prevKcal) setBump((b) => b + 1)
    setPrevKcal(totals.kcal)
  }

  return (
    <section className="card rounded-3xl">
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
          onClick={() => openModal({ type: 'add', meal })}
          className="border border-primary/30 bg-primary/15 text-primary shadow-[0_0_14px_-4px_var(--accent-primary)] hover:bg-primary/25 hover:text-primary"
        >
          <Plus className="size-5" />
        </IconButton>
      </header>

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

function EntryRow({ entry }: { entry: Entry }) {
  const openModal = useUiStore((s) => s.openModal)

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0, x: -24 }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      className="overflow-hidden"
    >
      <div className="flex items-center gap-1 py-1 pr-2 pl-2">
        <button
          type="button"
          onClick={() => openModal({ type: 'edit', date: entry.date, entryId: entry.id })}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors active:bg-white/[0.05]"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{entry.name}</p>
            <p className="truncate text-xs text-muted">
              {entry.grams !== null && `${grams(entry.grams)} г · `}
              {macrosLine(entry)}
            </p>
          </div>
          <span className="shrink-0 text-sm font-semibold">{kcal(entry.kcal)}</span>
        </button>
        <IconButton label={`Видалити «${entry.name}»`} onClick={() => removeEntry(entry)} className="active:text-danger">
          <Trash2 className="size-4" />
        </IconButton>
      </div>
    </motion.li>
  )
}
