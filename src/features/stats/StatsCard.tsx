import { motion } from 'framer-motion'
import { BarChart3, ChevronRight } from 'lucide-react'
import { KCAL_PER_KG, heatLevel } from '@shared/stats.js'
import { useDataStore, useGoals } from '@/data/store'
import { cn } from '@/lib/cn'
import { addDays, fromDateKey, toDateKey } from '@/lib/date'
import { int, kg } from '@/lib/format'
import { HEAT_COLORS, dateRange, periodTotals, useDaySummaries } from '@/lib/stats'
import { useUiStore } from '@/store/ui'

const dayLetter = (key: string) => fromDateKey(key).toLocaleDateString('uk-UA', { weekday: 'narrow' })

/** Плашка «Статистика» на головній: тиждень стовпчиками, середнє й дефіцит. Тап — шторка з графіками. */
export function StatsCard() {
  const map = useDaySummaries()
  const loaded = useDataStore((s) => s.stats !== null)
  const goals = useGoals()
  const openModal = useUiStore((s) => s.openModal)
  const today = toDateKey()
  const week = dateRange(addDays(today, -6), today)
  // середнє й дефіцит — за 7 завершених днів (сьогодні ще триває)
  const totals = periodTotals(map, dateRange(addDays(today, -7), addDays(today, -1)), today)
  const max = Math.max(goals.kcal * 1.25, ...week.map((d) => map.get(d)?.kcal ?? 0))

  return (
    <motion.div whileTap={{ scale: 0.985 }} className="card relative flex flex-col gap-4 rounded-3xl p-5">
      <button
        type="button"
        onClick={() => openModal({ type: 'stats' })}
        aria-label="Статистика: графіки калорій, дефіциту й теплова карта"
        className="absolute inset-0 rounded-3xl"
      />
      <header className="pointer-events-none flex items-center gap-2">
        <BarChart3 className="size-5 text-primary" strokeWidth={1.8} />
        <h2 className="flex-1 text-base font-bold">Статистика</h2>
        <span className="text-[11px] text-muted">7 днів</span>
        <ChevronRight className="size-4 text-muted" />
      </header>

      <div className="pointer-events-none flex items-end gap-4">
        {/* Тиждень: висота — калорії, колір — точність попадання в КБЖВ */}
        <div className="relative flex h-24 flex-1 items-end gap-1.5">
          <div
            className="absolute inset-x-0 border-t border-dashed border-white/25"
            style={{ bottom: `${(goals.kcal / max) * 100}%` }}
          />
          {week.map((d, i) => {
            const s = map.get(d)
            return (
              <div key={d} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${s ? Math.max((s.kcal / max) * 100, 4) : 4}%` }}
                  transition={{ delay: 0.2 + i * 0.05, type: 'spring', stiffness: 260, damping: 26 }}
                  className={cn('w-full max-w-5 rounded-md', d === today && 'opacity-60')}
                  style={{ background: s ? HEAT_COLORS[Math.max(heatLevel(s), 1)] : 'rgb(255 255 255 / 0.06)' }}
                />
                <span className={cn('text-[10px] uppercase', d === today ? 'font-bold text-fg' : 'text-muted')}>{dayLetter(d)}</span>
              </div>
            )
          })}
        </div>

        <div className="flex w-[42%] flex-col gap-2">
          <Stat label="Середньо / день" value={loaded && totals.logged ? `${int(totals.avgKcal)}` : '—'} unit="ккал" />
          <Stat
            label="Дефіцит за тиждень"
            value={loaded && totals.logged ? `${totals.deficit < 0 ? '−' : ''}${int(Math.abs(totals.deficit))}` : '—'}
            unit={loaded && totals.logged ? `≈ ${kg(Math.abs(totals.deficit) / KCAL_PER_KG)} кг` : ''}
            tone={totals.deficit >= 0 ? 'text-primary' : 'text-danger'}
          />
        </div>
      </div>
    </motion.div>
  )
}

function Stat({ label, value, unit, tone }: { label: string; value: string; unit: string; tone?: string }) {
  return (
    <div className="flex flex-col rounded-2xl bg-white/[0.04] px-3 py-2 ring-1 ring-inset ring-white/[0.05]">
      <span className="text-[10px] text-muted">{label}</span>
      <span className={cn('text-base leading-tight font-bold', tone)}>
        {value} <span className="text-[10px] font-normal text-muted">{unit}</span>
      </span>
    </div>
  )
}
