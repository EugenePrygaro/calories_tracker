import { AnimatePresence, motion } from 'framer-motion'
import { Coffee, Cookie, Moon, Plus, Sun, Trash2, type LucideIcon } from 'lucide-react'
import { MEAL_LABELS, type Entry, type MealType } from '@shared/model.js'
import { sum } from '@shared/nutrition.js'
import { AnimatedNumber } from '@/components/AnimatedNumber'
import { IconButton } from '@/components/ui/Button'
import { deleteEntry } from '@/data/store'
import { grams, kcal, macrosLine } from '@/lib/format'
import { useUiStore } from '@/store/ui'

const MEAL_ICONS: Record<MealType, LucideIcon> = {
  breakfast: Coffee,
  lunch: Sun,
  dinner: Moon,
  snack: Cookie,
}

interface MealSectionProps {
  meal: MealType
  entries: readonly Entry[]
}

export function MealSection({ meal, entries }: MealSectionProps) {
  const openModal = useUiStore((s) => s.openModal)
  const totals = sum(entries)
  const Icon = MEAL_ICONS[meal]

  return (
    <section className="card rounded-3xl">
      <header className="flex items-center gap-3 p-4">
        <span className={`flex size-10 shrink-0 items-center justify-center transition-colors ${entries.length ? "text-primary" : "text-muted"}`}>
          <Icon className="size-6" strokeWidth={1.6} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h2 className="text-base font-bold">{MEAL_LABELS[meal]}</h2>
            <span className="text-sm text-muted">
              <AnimatedNumber value={totals.kcal} format={kcal} /> ккал
            </span>
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

      {entries.length > 0 && (
        <ul className="border-t border-line pb-1">
          <AnimatePresence initial={false}>
            {entries.map((e) => (
              <EntryRow key={e.id} entry={e} />
            ))}
          </AnimatePresence>
        </ul>
      )}
    </section>
  )
}

function EntryRow({ entry }: { entry: Entry }) {
  const openModal = useUiStore((s) => s.openModal)

  return (
    <motion.li
      layout
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="overflow-hidden"
    >
      <div className="flex items-center gap-1 py-1 pr-2 pl-4">
        <button
          type="button"
          onClick={() => openModal({ type: 'edit', date: entry.date, entryId: entry.id })}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-2 text-left"
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
        <IconButton label={`Видалити «${entry.name}»`} onClick={() => void deleteEntry(entry).catch(() => {})}>
          <Trash2 className="size-4" />
        </IconButton>
      </div>
    </motion.li>
  )
}
