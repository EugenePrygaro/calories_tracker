import { motion } from 'framer-motion'
import { ChevronRight, Minus, Plus, Ruler, Target, TrendingDown, TrendingUp } from 'lucide-react'
import { useId, type KeyboardEvent, type MouseEvent } from 'react'
import { BODY_LABELS, type BodyField } from '@shared/model.js'
import { AnimatedNumber } from '@/components/AnimatedNumber'
import { ProgressBar } from '@/components/ProgressBar'
import { useBody, useDataStore, useTargetWeight } from '@/data/store'
import { latestMeasure, startWeight, targetProgress, weightSeries, type Measure } from '@/lib/body'
import { cn } from '@/lib/cn'
import { fromDateKey } from '@/lib/date'
import { cm, kg, signed } from '@/lib/format'
import { useUiStore } from '@/store/ui'

const MEASURES: BodyField[] = ['chest', 'waist', 'hips']

/** Плашка внизу головного екрана: вага, тренд, прогрес до цілі, об'єми. Тап — шторка з графіком. */
export function BodyCard() {
  const records = useBody()
  const loaded = useDataStore((s) => s.bodyLoaded)
  const target = useTargetWeight()
  const openModal = useUiStore((s) => s.openModal)

  const weight = latestMeasure(records, 'weight')
  const start = startWeight(records)
  const spark = weightSeries(records).slice(-20)
  const open = () => openModal({ type: 'body' })
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      open()
    }
  }
  const setTarget = (e: MouseEvent) => {
    e.stopPropagation()
    openModal({ type: 'goals' })
  }

  // Рух ваги «в правильний бік» — до цілі; без цілі тренд нейтральний.
  const towardTarget =
    weight?.delta != null && weight.delta !== 0 && target !== null
      ? Math.sign(target - weight.value) === Math.sign(weight.delta) || weight.value === target
      : null

  return (
    <motion.div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={onKey}
      whileTap={{ scale: 0.985 }}
      aria-label="Мої параметри: відкрити графік і редагування"
      className="card flex cursor-pointer flex-col gap-4 rounded-3xl p-5 text-left"
    >
      <header className="flex items-center gap-2">
        <Ruler className="size-5 text-primary" strokeWidth={1.8} />
        <h2 className="flex-1 text-base font-bold">Мої параметри</h2>
        {weight && (
          <span className="text-[11px] text-muted">
            {fromDateKey(weight.date).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })}
          </span>
        )}
        <ChevronRight className="size-4 text-muted" />
      </header>

      {!weight && loaded ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-4 text-sm text-muted">
          <span className="flex size-10 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Plus className="size-5" />
          </span>
          Додайте вагу й об’єми, щоб бачити прогрес
        </div>
      ) : (
        <>
          <div className="flex items-end gap-4">
            <div className="flex min-w-0 flex-col">
              <span className="text-xs text-muted">Вага</span>
              <span className="flex items-baseline gap-1">
                <AnimatedNumber value={weight?.value ?? 0} format={kg} className="text-4xl leading-none font-bold" />
                <span className="text-sm text-muted">кг</span>
              </span>
              {weight?.delta != null && (
                <span
                  className={cn(
                    'mt-2 flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold',
                    towardTarget ? 'bg-primary/15 text-primary' : 'bg-white/[0.06] text-muted',
                  )}
                >
                  {weight.delta < 0 ? (
                    <TrendingDown className="size-3.5" />
                  ) : weight.delta > 0 ? (
                    <TrendingUp className="size-3.5" />
                  ) : (
                    <Minus className="size-3.5" />
                  )}
                  {signed(weight.delta)} кг
                </span>
              )}
            </div>
            <Sparkline values={spark.map((p) => p.value)} className="ml-auto h-16 flex-1" />
          </div>

          {target !== null && weight && start !== null ? (
            <TargetProgress current={weight.value} start={start} target={target} />
          ) : (
            weight && (
              <button
                type="button"
                onClick={setTarget}
                className="flex items-center gap-2 self-start text-xs font-medium text-primary"
              >
                <Target className="size-4" /> Задати цільову вагу
              </button>
            )
          )}

          <div className="grid grid-cols-3 gap-2">
            {MEASURES.map((f, i) => (
              <MeasureTile key={f} field={f} measure={latestMeasure(records, f)} index={i} />
            ))}
          </div>
        </>
      )}
    </motion.div>
  )
}

function TargetProgress({ current, start, target }: { current: number; start: number; target: number }) {
  const left = Math.round(Math.abs(current - target) * 10) / 10
  const progress = targetProgress(start, current, target)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 text-muted">
          <Target className="size-3.5" /> Ціль <b className="text-fg">{kg(target)} кг</b>
        </span>
        <span className="text-muted">
          {left === 0 ? (
            <b className="text-primary">Досягнуто!</b>
          ) : (
            <>
              ще <b className="text-fg">{kg(left)}</b> кг
            </>
          )}
        </span>
      </div>
      <ProgressBar value={progress * 100} max={100} className="h-2.5" sheenDelay={2.2} />
    </div>
  )
}

function MeasureTile({ field, measure, index }: { field: BodyField; measure: Measure | null; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 + index * 0.06 }}
      className="flex flex-col gap-0.5 rounded-2xl bg-white/[0.04] px-3 py-2.5 ring-1 ring-inset ring-white/[0.05]"
    >
      <span className="text-[11px] text-muted">{BODY_LABELS[field].label}</span>
      {measure ? (
        <>
          <span className="text-base font-bold">
            <AnimatedNumber value={measure.value} format={cm} />
            <span className="ml-0.5 text-xs font-normal text-muted">см</span>
          </span>
          <span className="text-[11px] text-muted">{measure.delta == null ? '—' : `${signed(measure.delta)} см`}</span>
        </>
      ) : (
        <span className="text-base font-bold text-muted">—</span>
      )}
    </motion.div>
  )
}

/** Міні-графік ваги без осей: лише форма тренду і точка «зараз». */
function Sparkline({ values, className }: { values: number[]; className?: string }) {
  const id = useId()
  if (values.length < 2) return <div className={className} />
  const W = 120
  const H = 48
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const pts = values.map((v, i) => [(i / (values.length - 1)) * (W - 6) + 3, 4 + ((max - v) / span) * (H - 8)] as const)
  const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${py.toFixed(1)}`).join(' ')
  const lastPt = pts[pts.length - 1] ?? [0, 0]

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMaxYMid meet" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}-a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--accent-primary)', stopOpacity: 0.25 }} />
          <stop offset="100%" style={{ stopColor: 'var(--accent-primary)', stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <motion.path
        d={`${line} L${lastPt[0]},${H} L3,${H} Z`}
        fill={`url(#${id}-a)`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5, duration: 0.6 }}
      />
      <motion.path
        d={line}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ stroke: 'var(--accent-primary)' }}
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, ease: 'easeInOut' }}
      />
      <motion.circle
        cx={lastPt[0]}
        cy={lastPt[1]}
        r="3.5"
        style={{ fill: 'var(--accent-primary)', filter: 'drop-shadow(0 0 4px var(--accent-primary))' }}
        initial={{ scale: 0 }}
        animate={{ scale: [0, 1.4, 1] }}
        transition={{ delay: 1, duration: 0.5 }}
      />
    </svg>
  )
}
