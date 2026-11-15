import { AnimatePresence, motion } from 'framer-motion'
import { Check, Search, Sparkles, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Food, Nutrients } from '@shared/model.js'
import { sum } from '@shared/nutrition.js'
import { portionCap, solvePortions, totalsOf } from '@shared/portion.js'
import { AnimatedNumber } from '@/components/AnimatedNumber'
import { NumberField } from '@/components/ui/Field'
import { useDay, useFoods, useGoalsFor } from '@/data/store'
import { cn } from '@/lib/cn'
import { toDateKey } from '@/lib/date'
import { grams as fmtGrams, int, parseNum } from '@/lib/format'

/** Скільки страв можна вибрати — більше вже не «тарілка», а меню на день. */
const MAX_FOODS = 5
/** Відхилення від цілі, яке вважаємо влучанням. */
const OK_TOLERANCE = 0.1

type MacroKey = 'protein' | 'fat' | 'carbs'
const MACROS: { key: MacroKey; label: string; short: string; color: string }[] = [
  { key: 'protein', label: 'Білки', short: 'Б', color: 'text-protein' },
  { key: 'fat', label: 'Жири', short: 'Ж', color: 'text-fat' },
  { key: 'carbs', label: 'Вуглеводи', short: 'В', color: 'text-carbs' },
]

const field = (n: number) => (n > 0 ? String(Math.round(n)) : '')

/**
 * Калькулятор порцій: «маю N ккал (і, можливо, стільки-то БЖВ) — скільки грамів
 * кожної з вибраних страв узяти?» Розрахунок — shared/portion.js.
 */
export function CalcSheet() {
  const goals = useGoalsFor(toDateKey())
  const today = useDay(toDateKey())
  const foods = useFoods()
  const eaten = useMemo(() => sum(today.entries), [today.entries])
  const left: Nutrients = {
    kcal: Math.max(goals.kcal - eaten.kcal, 0),
    protein: Math.max(goals.protein - eaten.protein, 0),
    fat: Math.max(goals.fat - eaten.fat, 0),
    carbs: Math.max(goals.carbs - eaten.carbs, 0),
  }

  const [kcalStr, setKcal] = useState(() => field(left.kcal))
  const [macros, setMacros] = useState<Record<MacroKey, string>>({ protein: '', fat: '', carbs: '' })
  const [picked, setPicked] = useState<string[]>([])
  const [query, setQuery] = useState('')

  const target = {
    kcal: parseNum(kcalStr) ?? 0,
    protein: parseNum(macros.protein),
    fat: parseNum(macros.fat),
    carbs: parseNum(macros.carbs),
  }
  const chosen = picked.map((id) => foods.find((f) => f.id === id)).filter((f): f is Food => !!f)
  const per100 = chosen.map((f) => f.per100)
  const key = JSON.stringify([target, picked])
  // key описує всі входи розрахунку (об'єкти target/per100 нові на кожен рендер)
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const grams = useMemo(() => solvePortions(per100, target, chosen.map((f) => portionCap(f.servingGrams))), [key])
  const totals = totalsOf(per100, grams)

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MAX_FOODS ? p : [...p, id]))

  const q = query.trim().toLowerCase()
  const list = foods.filter((f) => !q || f.name.toLowerCase().includes(q))

  return (
    <div className="flex flex-col gap-5 pb-6">
      <section className="flex flex-col gap-3">
        <NumberField
          label="Скільки калорій"
          {...(left.kcal > 0 ? { hint: `залишок на сьогодні ${int(left.kcal)}` } : {})}
          suffix="ккал"
          inputMode="numeric"
          value={kcalStr}
          onChange={setKcal}
        />
        <div className="grid grid-cols-3 gap-3">
          {MACROS.map((m) => (
            <NumberField
              key={m.key}
              label={m.label}
              suffix="г"
              placeholder="—"
              value={macros[m.key]}
              onChange={(v) => setMacros((s) => ({ ...s, [m.key]: v }))}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>БЖВ необов’язкові.</span>
          <button
            type="button"
            onClick={() => {
              setKcal(field(left.kcal))
              setMacros({ protein: field(left.protein), fat: field(left.fat), carbs: field(left.carbs) })
            }}
            className="flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 font-bold text-primary active:bg-primary/20"
          >
            <Sparkles className="size-3.5" /> Підставити залишок дня
          </button>
          {(macros.protein || macros.fat || macros.carbs) && (
            <button
              type="button"
              onClick={() => setMacros({ protein: '', fat: '', carbs: '' })}
              className="rounded-full bg-white/[0.05] px-2.5 py-1 font-bold active:bg-white/10"
            >
              Без БЖВ
            </button>
          )}
        </div>
      </section>

      <Result chosen={chosen} grams={grams} totals={totals} target={target} onRemove={toggle} />

      <section className="flex flex-col gap-2">
        <h3 className="flex items-baseline justify-between text-xs font-bold tracking-wider text-muted uppercase">
          Що будете їсти
          <span className="font-normal normal-case">
            {picked.length} / {MAX_FOODS}
          </span>
        </h3>
        {foods.length === 0 ? (
          <p className="rounded-2xl bg-white/[0.03] px-4 py-6 text-center text-sm text-muted">
            Спершу додайте страви в «Мої страви» — через пошук або вручну.
          </p>
        ) : (
          <>
            <label className="flex h-11 items-center gap-2 rounded-2xl bg-elevated px-3 ring-1 ring-inset ring-line focus-within:ring-primary/60">
              <Search className="size-4 shrink-0 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Пошук у моїх стравах"
                className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted/60"
              />
            </label>
            <ul className="flex flex-col">
              {list.map((f) => {
                const on = picked.includes(f.id)
                const full = !on && picked.length >= MAX_FOODS
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => toggle(f.id)}
                      disabled={full}
                      aria-pressed={on}
                      className="flex w-full items-center gap-3 border-b border-line/50 py-2.5 text-left disabled:opacity-40"
                    >
                      <span
                        className={cn(
                          'flex size-6 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset transition-colors',
                          on ? 'bg-primary text-white ring-primary' : 'ring-white/15',
                        )}
                      >
                        {on && <Check className="size-4" strokeWidth={3} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{f.name}</span>
                        <span className="text-[11px] text-muted">
                          {int(f.per100.kcal)} ккал · Б {fmtGrams(f.per100.protein)} · Ж {fmtGrams(f.per100.fat)} · В{' '}
                          {fmtGrams(f.per100.carbs)} / 100 г
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
              {list.length === 0 && <li className="py-4 text-center text-sm text-muted">Нічого не знайдено</li>}
            </ul>
          </>
        )}
      </section>
    </div>
  )
}

interface ResultProps {
  chosen: Food[]
  grams: number[]
  totals: Nutrients
  target: { kcal: number; protein: number | null; fat: number | null; carbs: number | null }
  onRemove: (id: string) => void
}

function Result({ chosen, grams, totals, target, onRemove }: ResultProps) {
  if (chosen.length === 0 || target.kcal <= 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line px-4 py-5 text-center text-sm text-muted">
        {target.kcal <= 0 ? 'Вкажіть, скільки калорій хочете з’їсти.' : 'Виберіть страви зі списку нижче — порахую грами.'}
      </p>
    )
  }

  /** Колір підсумку: влучили в ціль (±10%) — зелений, ні — бурштиновий, ціль не задано — звичайний. */
  const tone = (value: number, goal: number | null) =>
    goal == null || !(goal > 0) ? 'text-fg' : Math.abs(value - goal) <= goal * OK_TOLERANCE ? 'text-primary' : 'text-warning'

  return (
    <section className="card flex flex-col gap-1 rounded-3xl p-4">
      <ul className="flex flex-col">
        <AnimatePresence initial={false}>
          {chosen.map((f, i) => {
            const g = grams[i] ?? 0
            const k = g / 100
            return (
              <motion.li
                key={f.id}
                layout="position"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-3 border-b border-line/50 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{f.name}</p>
                    <p className="text-[11px] text-muted">
                      {int(f.per100.kcal * k)} ккал · Б {fmtGrams(f.per100.protein * k)} · Ж {fmtGrams(f.per100.fat * k)} · В{' '}
                      {fmtGrams(f.per100.carbs * k)}
                    </p>
                  </div>
                  <span className="flex items-baseline gap-0.5 text-2xl font-bold text-primary">
                    <AnimatedNumber value={g} format={int} />
                    <span className="text-xs font-normal text-muted">г</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemove(f.id)}
                    aria-label={`Прибрати «${f.name}»`}
                    className="-mr-2 flex size-9 items-center justify-center rounded-full text-muted active:bg-white/5"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 pt-2 text-xs">
        <span className="text-muted">
          Разом{' '}
          <b className={cn('text-base', tone(totals.kcal, target.kcal))}>
            <AnimatedNumber value={totals.kcal} format={int} />
          </b>{' '}
          <span className="text-muted">/ {int(target.kcal)} ккал</span>
        </span>
        <span className="flex gap-2.5">
          {MACROS.map((m) => (
            <span key={m.key} className={target[m.key] != null ? tone(totals[m.key], target[m.key]) : m.color}>
              {m.short} {fmtGrams(totals[m.key])}
              {target[m.key] != null && <span className="text-muted">/{int(target[m.key] ?? 0)}</span>}
            </span>
          ))}
        </span>
      </div>
    </section>
  )
}
