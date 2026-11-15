import { useEffect, useState, type ReactNode } from 'react'
import { KCAL_PER_KG, accuracy, deficitOf } from '@shared/stats.js'
import { Segmented } from '@/components/ui/Segmented'
import { loadStats, useDataStore, useGoals } from '@/data/store'
import { addDays, toDateKey } from '@/lib/date'
import { int, kg } from '@/lib/format'
import { dateRange, periodTotals, useDaySummaries } from '@/lib/stats'
import { DailyBarChart, type Bar } from './DailyBarChart'
import { Heatmap } from './Heatmap'

type Range = 'week' | 'month' | '3m' | 'year'
const RANGES = [
  { value: 'week', label: 'Тиждень' },
  { value: 'month', label: 'Місяць' },
  { value: '3m', label: '3 міс' },
  { value: 'year', label: 'Рік' },
] as const satisfies readonly { value: Range; label: string }[]
const RANGE_DAYS: Record<Range, number> = { week: 7, month: 30, '3m': 91, year: 365 }

const signedInt = (n: number) => (n > 0 ? `+${int(n)}` : n < 0 ? `−${int(-n)}` : '0')

/** Шторка «Статистика»: графіки калорій і дефіциту за період + теплова карта дисципліни. */
export function StatsSheet() {
  const map = useDaySummaries()
  const loaded = useDataStore((s) => s.stats !== null)
  const goals = useGoals()
  const [range, setRange] = useState<Range>('month')
  const today = toDateKey()

  useEffect(() => {
    void loadStats() // свіжі підсумки при кожному відкритті — один запит
  }, [])

  const dates = dateRange(addDays(today, -(RANGE_DAYS[range] - 1)), today)
  const totals = periodTotals(map, dates, today)
  const done = dates.filter((d) => d < today).flatMap((d) => map.get(d) ?? [])
  const avgAccuracy = done.length ? done.reduce((a, s) => a + accuracy(s), 0) / done.length : null

  const kcalBars: Bar[] = dates.map((d) => {
    const s = map.get(d)
    const over = s ? s.kcal > s.goals.kcal * 1.1 : false
    return { date: d, value: s ? s.kcal : null, color: over ? 'var(--warning)' : 'var(--accent-primary)', faded: d === today }
  })
  // сьогоднішній дефіцит неповний — його не показуємо
  const deficitBars: Bar[] = dates.map((d) => {
    const s = d < today ? map.get(d) : undefined
    const v = s ? deficitOf(s) : null
    return { date: d, value: v, color: v !== null && v < 0 ? 'var(--danger)' : 'var(--accent-secondary)' }
  })

  return (
    <div className="flex flex-col gap-4 pb-4">
      <Segmented label="Період" value={range} options={RANGES} onChange={setRange} />

      <div className="grid grid-cols-2 gap-2">
        <Tile label="Днів із записами" value={`${totals.logged} / ${totals.days}`} />
        <Tile label="Середньо на день" value={totals.logged ? `${int(totals.avgKcal)} ккал` : '—'} />
        <Tile
          label="Дефіцит за період"
          value={totals.logged ? `${signedInt(totals.deficit)} ккал` : '—'}
          hint={totals.logged ? `≈ ${totals.deficit >= 0 ? '−' : '+'}${kg(Math.abs(totals.deficit) / KCAL_PER_KG)} кг` : undefined}
          tone={totals.deficit >= 0 ? 'good' : 'bad'}
        />
        <Tile label="Середня точність КБЖВ" value={avgAccuracy === null ? '—' : `${Math.round(avgAccuracy * 100)}%`} />
      </div>

      <ChartCard title="Калорії" note={!loaded ? 'завантаження…' : undefined}>
        <DailyBarChart
          bars={kcalBars}
          reference={{ value: goals.kcal, label: `норма ${int(goals.kcal)}` }}
          format={(v) => `${int(v)} ккал`}
          detail={(b) => {
            const s = map.get(b.date)
            return s ? `норма ${int(s.goals.kcal)}` : null
          }}
          ariaLabel="Калорії по днях"
        />
      </ChartCard>

      <ChartCard title="Дефіцит" note="вище нуля — менше норми">
        <DailyBarChart
          bars={deficitBars}
          reference={null}
          signed
          format={(v) => `${signedInt(v)} ккал`}
          detail={(b) => (b.value !== null && b.value < 0 ? 'профіцит' : 'дефіцит')}
          ariaLabel="Дефіцит калорій по днях"
        />
      </ChartCard>

      <Heatmap map={map} today={today} />
    </div>
  )
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string | undefined; tone?: 'good' | 'bad' }) {
  return (
    <div className="card flex flex-col gap-0.5 rounded-2xl px-3.5 py-3">
      <span className="text-[11px] text-muted">{label}</span>
      <span className={tone === 'good' ? 'text-base font-bold text-primary' : tone === 'bad' ? 'text-base font-bold text-danger' : 'text-base font-bold'}>
        {value}
      </span>
      {hint && <span className="text-[10px] text-muted">{hint}</span>}
    </div>
  )
}

function ChartCard({ title, note, children }: { title: string; note?: string | undefined; children: ReactNode }) {
  return (
    <section className="card flex flex-col gap-2 rounded-3xl p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-bold">{title}</h3>
        {note && <span className="text-[11px] text-muted">{note}</span>}
      </div>
      {children}
    </section>
  )
}
