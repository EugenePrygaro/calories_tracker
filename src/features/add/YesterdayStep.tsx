import { AnimatePresence, motion } from 'framer-motion'
import { Check, CopyPlus, History, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { MEAL_LABELS, MEAL_TYPES, type Entry, type MealType } from '@shared/model.js'
import { sum } from '@shared/nutrition.js'
import { Button } from '@/components/ui/Button'
import { SheetFooter } from '@/components/ui/Modal'
import { copyEntries, loadDay, useDay } from '@/data/store'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { addDays, dateLabel } from '@/lib/date'
import { grams, kcal, macrosLine } from '@/lib/format'
import { useUiStore } from '@/store/ui'
import { MEAL_ICONS } from '../mealIcons'

/**
 * «Скопіювати з учора»: учорашній раціон за прийомами їжі, як на головній.
 * Тап «+» — копія страви у вибраний угорі прийом їжі на поточний день; «Усе» — весь прийом.
 */
export function YesterdayStep({ meal, onDone }: { meal: MealType; onDone: () => void }) {
  const date = useUiStore((s) => s.selectedDate)
  const yesterday = addDays(date, -1)
  const day = useDay(yesterday)
  const [copied, setCopied] = useState<ReadonlySet<string>>(new Set())

  // учорашній день могли ще не завантажувати
  useEffect(() => {
    if (!day.loaded) void loadDay(yesterday)
  }, [day.loaded, yesterday])

  const copy = (entries: readonly Entry[]) => {
    const fresh = entries.filter((e) => !copied.has(e.id))
    if (!fresh.length) return
    haptic()
    setCopied((s) => new Set([...s, ...fresh.map((e) => e.id)]))
    const saved = new Set<string>()
    void copyEntries(fresh, date, meal, (id) => saved.add(id)).catch(() => {
      // не вдалося — знімаємо позначку лише з тих, що не збереглися (інакше повтор дав би дублікати)
      setCopied((s) => new Set([...s].filter((id) => saved.has(id) || !fresh.some((e) => e.id === id))))
    })
  }

  const { title, subtitle } = dateLabel(yesterday)
  const sections = MEAL_TYPES.map((m) => ({ meal: m, entries: day.entries.filter((e) => e.meal === m) })).filter(
    (s) => s.entries.length > 0,
  )

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex items-center justify-between gap-2 rounded-2xl bg-white/[0.04] px-3 py-2 text-xs text-muted">
        <span className="flex items-center gap-1.5">
          <History className="size-4 text-primary" />
          <span>
            <b className="text-fg">{title}</b>, {subtitle}
          </span>
        </span>
        <span>
          додаємо в <b className="text-primary">{MEAL_LABELS[meal]}</b>
        </span>
      </div>

      {!day.loaded && day.entries.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted">Завантаження…</p>
      ) : sections.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted">
          <History className="size-8 opacity-60" />
          Учора нічого не записано
        </div>
      ) : (
        sections.map(({ meal: m, entries }, i) => (
          <YesterdaySection
            key={m}
            meal={m}
            entries={entries}
            copied={copied}
            index={i}
            onCopy={copy}
          />
        ))
      )}

      <SheetFooter>
        <Button onClick={onDone} className="flex-1">
          {copied.size > 0 ? `Готово · додано ${copied.size}` : 'Готово'}
        </Button>
      </SheetFooter>
    </div>
  )
}

interface SectionProps {
  meal: MealType
  entries: readonly Entry[]
  copied: ReadonlySet<string>
  index: number
  onCopy: (entries: readonly Entry[]) => void
}

function YesterdaySection({ meal, entries, copied, index, onCopy }: SectionProps) {
  const Icon = MEAL_ICONS[meal]
  const totals = sum(entries)
  const allCopied = entries.every((e) => copied.has(e.id))

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="card overflow-hidden rounded-2xl"
    >
      <header className="flex items-center gap-3 px-3 py-2.5">
        <Icon className="size-5 shrink-0 text-muted" strokeWidth={1.7} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">
            {MEAL_LABELS[meal]} <span className="font-normal text-muted">{kcal(totals.kcal)} ккал</span>
          </p>
          <p className="truncate text-[11px] text-muted">{macrosLine(totals)}</p>
        </div>
        <motion.button
          type="button"
          onClick={() => onCopy(entries)}
          disabled={allCopied}
          whileTap={{ scale: 0.92 }}
          className={cn(
            'flex h-9 shrink-0 items-center gap-1 rounded-full px-3 text-xs font-bold ring-1 ring-inset transition-colors',
            allCopied ? 'bg-primary/15 text-primary ring-primary/30' : 'bg-white/[0.05] text-fg ring-white/[0.08]',
          )}
        >
          {allCopied ? <Check className="size-4" /> : <CopyPlus className="size-4" />}
          {allCopied ? 'Додано' : 'Усе'}
        </motion.button>
      </header>

      <ul className="border-t border-line">
        {entries.map((e) => {
          const done = copied.has(e.id)
          return (
            <li key={e.id} className={cn('flex items-center gap-3 py-2 pr-2 pl-3 transition-colors', done && 'bg-primary/[0.06]')}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{e.name}</p>
                <p className="truncate text-[11px] text-muted">
                  {e.grams !== null && `${grams(e.grams)} г · `}
                  {macrosLine(e)}
                </p>
              </div>
              <span className="shrink-0 text-sm font-bold">{kcal(e.kcal)}</span>
              <motion.button
                type="button"
                onClick={() => onCopy([e])}
                disabled={done}
                whileTap={{ scale: 0.85 }}
                aria-label={done ? `«${e.name}» додано` : `Додати «${e.name}»`}
                className={cn(
                  'relative flex size-10 shrink-0 items-center justify-center rounded-full ring-1 ring-inset transition-colors',
                  done ? 'bg-primary text-white ring-primary' : 'bg-primary/15 text-primary ring-primary/30',
                )}
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={done ? 'done' : 'add'}
                    initial={{ scale: 0, rotate: -90 }}
                    animate={{ scale: 1, rotate: 0 }}
                    exit={{ scale: 0, rotate: 90 }}
                    className="flex"
                  >
                    {done ? <Check className="size-5" /> : <Plus className="size-5" />}
                  </motion.span>
                </AnimatePresence>
              </motion.button>
            </li>
          )
        })}
      </ul>
    </motion.section>
  )
}
