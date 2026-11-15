import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { accuracy, heatLevel, type DaySummary } from '@shared/stats.js'
import { Segmented } from '@/components/ui/Segmented'
import { cn } from '@/lib/cn'
import { addDays, formatDateKey, fromDateKey, toDateKey } from '@/lib/date'
import { int } from '@/lib/format'
import { HEAT_COLORS, dateRange } from '@/lib/stats'

type View = 'month' | 'year'
const VIEWS = [
  { value: 'month', label: 'Місяць' },
  { value: 'year', label: 'Рік' },
] as const satisfies readonly { value: View; label: string }[]

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд']
/** День тижня з понеділка: 0 — Пн … 6 — Нд */
const weekday = (key: string) => (fromDateKey(key).getDay() + 6) % 7
const monthName = (key: string) => fromDateKey(key).toLocaleDateString('uk-UA', { month: 'long', year: 'numeric' })
const monthShort = (key: string) => fromDateKey(key).toLocaleDateString('uk-UA', { month: 'short' }).replace('.', '')

/** Перше число місяця, зсунутого на delta. */
function shiftMonth(first: string, delta: number): string {
  const d = fromDateKey(first)
  return toDateKey(new Date(d.getFullYear(), d.getMonth() + delta, 1))
}

/**
 * Теплова карта дисципліни: кожен день зафарбований за точністю попадання в КБЖВ.
 * Місяць — календар з числами, рік — сітка тижнів як у комітах на GitHub.
 */
export function Heatmap({ map, today }: { map: Map<string, DaySummary>; today: string }) {
  const [view, setView] = useState<View>('month')
  const [selected, setSelected] = useState<string | null>(null)

  return (
    <section className="card flex flex-col gap-4 rounded-3xl p-4">
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-bold">Теплова карта дисципліни</h3>
        <Segmented label="Масштаб" value={view} options={VIEWS} onChange={setView} />
      </div>

      {view === 'month' ? (
        <MonthView map={map} today={today} selected={selected} onSelect={setSelected} />
      ) : (
        <YearView map={map} today={today} selected={selected} onSelect={setSelected} />
      )}

      <DayDetail date={selected} summary={selected ? map.get(selected) : undefined} />

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-[11px] text-muted">
        <span>Точність КБЖВ · точний день ≥ 90%</span>
        <span className="flex items-center gap-1">
          менше
          {HEAT_COLORS.map((c) => (
            <span key={c} className="size-3 rounded-[3px]" style={{ background: c }} />
          ))}
          більше
        </span>
      </div>
    </section>
  )
}

interface ViewProps {
  map: Map<string, DaySummary>
  today: string
  selected: string | null
  onSelect: (date: string) => void
}

function MonthView({ map, today, selected, onSelect }: ViewProps) {
  const thisMonth = today.slice(0, 8) + '01'
  const [first, setFirst] = useState(thisMonth)
  const [dir, setDir] = useState(0)
  const last = addDays(shiftMonth(first, 1), -1)
  const days = dateRange(first, last)
  const lead = weekday(first)
  const perfect = days.filter((d) => heatLevel(map.get(d)) === 4).length
  const logged = days.filter((d) => map.has(d)).length

  const go = (delta: number) => {
    setDir(delta)
    setFirst((f) => shiftMonth(f, delta))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => go(-1)} aria-label="Попередній місяць" className="flex size-9 items-center justify-center rounded-full text-muted active:bg-white/5">
          <ChevronLeft className="size-5" />
        </button>
        <div className="flex flex-col items-center leading-tight">
          <span className="text-sm font-bold capitalize">{monthName(first)}</span>
          <span className="text-[11px] text-muted">
            записів {logged} дн. · точних {perfect}
          </span>
        </div>
        <button
          type="button"
          onClick={() => go(1)}
          disabled={first >= thisMonth}
          aria-label="Наступний місяць"
          className="flex size-9 items-center justify-center rounded-full text-muted active:bg-white/5 disabled:opacity-30"
        >
          <ChevronRight className="size-5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1.5 text-center text-[10px] text-muted">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false} custom={dir}>
        <motion.div
          key={first}
          custom={dir}
          initial={{ opacity: 0, x: dir * 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: dir * -24 }}
          transition={{ duration: 0.18 }}
          className="grid grid-cols-7 gap-1.5"
        >
          {Array.from({ length: lead }, (_, i) => (
            <span key={`pad-${i}`} />
          ))}
          {days.map((d, i) => {
            const future = d > today
            const level = heatLevel(map.get(d))
            return (
              <motion.button
                key={d}
                type="button"
                disabled={future}
                onClick={() => onSelect(d)}
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.008 }}
                aria-label={formatDateKey(d)}
                className={cn(
                  'flex aspect-square items-center justify-center rounded-lg text-[11px] font-bold transition-shadow',
                  level >= 3 ? 'text-white' : 'text-muted',
                  future && 'opacity-30',
                  d === today && 'ring-1 ring-fg/50',
                  d === selected && 'ring-2 ring-fg',
                )}
                style={{ background: future ? 'transparent' : HEAT_COLORS[level] }}
              >
                {Number(d.slice(8))}
              </motion.button>
            )
          })}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

const CELL = 12
const GAP = 3

function YearView({ map, today, selected, onSelect }: ViewProps) {
  const scroller = useRef<HTMLDivElement>(null)
  // 53 тижні, що закінчуються поточним; колонка — тиждень з понеділка
  const end = addDays(today, 6 - weekday(today))
  const start = addDays(end, -(53 * 7) + 1)
  const days = dateRange(start, end)
  const weeks = Array.from({ length: 53 }, (_, w) => days.slice(w * 7, w * 7 + 7))
  const yearDays = days.filter((d) => d <= today && d > addDays(today, -365))
  const perfect = yearDays.filter((d) => heatLevel(map.get(d)) === 4).length
  const logged = yearDays.filter((d) => map.has(d)).length

  // одразу показуємо свіжі тижні (праворуч)
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [])

  return (
    <div className="flex flex-col gap-2">
      <span className="text-center text-[11px] text-muted">
        за рік: записів {logged} дн. · точних {perfect}
      </span>
      <div className="flex gap-1.5">
        {/* Дні тижня */}
        <div className="flex flex-col pt-[18px] text-[9px] leading-none text-muted" style={{ gap: GAP }}>
          {WEEKDAYS.map((w, i) => (
            <span key={w} className="flex items-center" style={{ height: CELL }}>
              {i % 2 === 0 ? w : ''}
            </span>
          ))}
        </div>
        <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto pb-1 [scrollbar-width:none]">
          <div className="flex" style={{ gap: GAP }}>
            {weeks.map((week, w) => {
              const first = week[0] ?? ''
              const showMonth = week.some((d) => d.endsWith('-01')) || w === 0
              const label = week.find((d) => d.endsWith('-01')) ?? first
              return (
                <div key={first} className="flex flex-col" style={{ gap: GAP }}>
                  <span className="h-[15px] text-[9px] whitespace-nowrap text-muted" style={{ width: CELL }}>
                    {showMonth ? monthShort(label) : ''}
                  </span>
                  {week.map((d) => {
                    const future = d > today
                    return (
                      <button
                        key={d}
                        type="button"
                        disabled={future}
                        onClick={() => onSelect(d)}
                        aria-label={formatDateKey(d)}
                        className={cn('rounded-[3px]', d === selected && 'ring-2 ring-fg', d === today && 'ring-1 ring-fg/60')}
                        style={{ width: CELL, height: CELL, background: future ? 'transparent' : HEAT_COLORS[heatLevel(map.get(d))] }}
                      />
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

/** Деталі вибраного дня під картою. */
function DayDetail({ date, summary }: { date: string | null; summary: DaySummary | undefined }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {date && (
        <motion.div
          key={date}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.04] px-3 py-2.5 text-xs"
        >
          <span className="font-bold">{formatDateKey(date)}</span>
          {summary ? (
            <span className="text-muted">
              <b className="text-fg">{int(summary.kcal)}</b> / {int(summary.goals.kcal)} ккал · точність{' '}
              <b className="text-fg">{Math.round(accuracy(summary) * 100)}%</b>
            </span>
          ) : (
            <span className="text-muted">записів немає</span>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
