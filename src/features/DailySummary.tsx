import { AnimatePresence, motion } from 'framer-motion'
import { Flame } from 'lucide-react'
import type { Entry } from '@shared/model.js'
import { percent, sum } from '@shared/nutrition.js'
import { AnimatedNumber } from '@/components/AnimatedNumber'
import { Gauge } from '@/components/Gauge'
import { ProgressBar } from '@/components/ProgressBar'
import { useDataStore, useGoalsFor } from '@/data/store'
import { useUiStore } from '@/store/ui'
import { grams, kcal } from '@/lib/format'

const MACROS = [
  { key: 'protein', label: 'Білки', bar: 'bg-gradient-to-r from-protein/70 to-protein', track: 'bg-protein/10 ring-1 ring-inset ring-protein/30', text: 'text-protein' },
  { key: 'fat', label: 'Жири', bar: 'bg-gradient-to-r from-fat/70 to-fat', track: 'bg-fat/10 ring-1 ring-inset ring-fat/30', text: 'text-fat' },
  { key: 'carbs', label: 'Вуглеводи', bar: 'bg-gradient-to-r from-carbs/70 to-carbs', track: 'bg-carbs/10 ring-1 ring-inset ring-carbs/30', text: 'text-carbs' },
] as const

const plusKcal = (n: number) => `+${kcal(n)}`
const pct = (n: number) => `${Math.round(n)}%`

export function DailySummary({ entries }: { entries: readonly Entry[] }) {
  const date = useUiStore((s) => s.selectedDate)
  const goals = useGoalsFor(date) // на вихідних калорій більше
  const base = useDataStore((s) => s.profile?.goals.kcal)
  const weekendExtra = base && goals.kcal > base ? Math.round((goals.kcal / base - 1) * 100) : 0
  const totals = sum(entries)
  const left = goals.kcal - totals.kcal
  const over = left < 0

  return (
    <section className="card flex flex-col gap-4 rounded-3xl p-5">
      {/* Дуга показує, скільки ще лишилось: повна на початку дня, тоншає з кожним записом */}
      <Gauge value={goals.kcal > 0 ? left / goals.kcal : 0} over={over} className="mx-auto -mb-4 w-44">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={over ? 'over' : 'left'}
            initial={{ opacity: 0, scale: 0.9, filter: 'blur(4px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 0.9, filter: 'blur(4px)' }}
            className="flex flex-col items-center"
          >
            <span className="text-[10px] tracking-[0.16em] text-muted uppercase">
              {over ? 'Понад норму' : 'Залишилось'}
            </span>
            <AnimatedNumber
              value={Math.abs(left)}
              format={over ? plusKcal : kcal}
              className={over ? 'text-over text-[2.35rem] leading-tight font-bold' : 'text-[2.35rem] leading-tight font-bold'}
            />
            <span className="text-xs text-muted">ккал</span>
          </motion.div>
        </AnimatePresence>
      </Gauge>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between text-sm">
          <span className="flex items-center gap-1.5 text-muted">
            <Flame className="size-4" />
            Спожито <AnimatedNumber value={totals.kcal} format={kcal} className="font-bold text-fg" />
          </span>
          <span className="flex items-center gap-1.5 text-muted">
            {weekendExtra > 0 && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary" title="На вихідних норма калорій більша">
                вихідний +{weekendExtra}%
              </span>
            )}
            Ціль <AnimatedNumber value={goals.kcal} format={kcal} className="font-bold text-fg" />
          </span>
        </div>
        <ProgressBar value={totals.kcal} max={goals.kcal} className="h-3" label="Калорії" />
      </div>

      <div className="grid grid-cols-3 gap-3 pt-1">
        {MACROS.map((m, i) => (
          <div key={m.key} className="flex flex-col gap-1.5">
            <div className="flex items-baseline justify-between">
              <span className={`text-xs ${m.text}`}>{m.label}</span>
              <AnimatedNumber
                value={percent(totals[m.key], goals[m.key])}
                format={pct}
                className="text-[11px] text-muted"
              />
            </div>
            <ProgressBar
              value={totals[m.key]}
              label={m.label}
              max={goals[m.key]}
              barClassName={m.bar}
              trackClassName={m.track}
              sheenDelay={0.7 + i * 0.45}
            />
            <span className="text-xs text-muted">
              <AnimatedNumber value={totals[m.key]} format={grams} className="font-bold text-fg" /> /{' '}
              {grams(goals[m.key])} г
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}
