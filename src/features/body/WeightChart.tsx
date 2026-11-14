import { motion } from 'framer-motion'
import { useCallback, useId, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { fromDateKey } from '@/lib/date'
import { kg } from '@/lib/format'

export interface WeightPoint {
  date: string
  value: number
}

interface WeightChartProps {
  points: readonly WeightPoint[]
  /** Цільова вага — горизонтальна опорна лінія (завжди в межах осі). */
  target: number | null
  height?: number
}

const PAD = { l: 4, r: 40, t: 22, b: 26 }

const shortDate = (key: string) => fromDateKey(key).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })

/** «Гарні» поділки осі: крок 0,1 / 0,2 / 0,5 / 1 / 2 / 5 … кг. */
function niceTicks(min: number, max: number, count = 4): number[] {
  const raw = (max - min) / (count - 1) || 0.5
  const pow = 10 ** Math.floor(Math.log10(raw))
  const step = ([1, 2, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow
  const start = Math.floor(min / step) * step
  const end = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = start; v <= end + step / 2; v += step) ticks.push(Math.round(v * 100) / 100)
  return ticks
}

/** Ширина контейнера через ResizeObserver (графік рисується в реальних пікселях — текст не тягнеться). */
function useWidth(): [(el: HTMLDivElement | null) => () => void, number] {
  const [width, setWidth] = useState(0)
  const ref = useCallback((el: HTMLDivElement | null) => {
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry?.contentRect.width ?? 0)))
    if (el) ro.observe(el)
    return () => ro.disconnect() // React 19: прибирання для callback-ref
  }, [])
  return [ref, width]
}

/**
 * Графік ваги в часі: одна серія (назву дає заголовок шторки — легенда не потрібна),
 * заливка-підкладка ~12%, опорна лінія цілі, перехрестя з підказкою під пальцем.
 * Таблиця значень — у списку «Історія» під графіком.
 */
export function WeightChart({ points, target, height = 200 }: WeightChartProps) {
  const id = useId()
  const [ref, width] = useWidth()
  const [active, setActive] = useState<number | null>(null)

  if (points.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl bg-white/[0.03] text-sm text-muted">
        За цей період ще немає записів ваги
      </div>
    )
  }

  const times = points.map((p) => fromDateKey(p.date).getTime())
  let t0 = Math.min(...times)
  let t1 = Math.max(...times)
  if (t0 === t1) {
    t0 -= 86_400_000
    t1 += 86_400_000
  }
  const values = points.map((p) => p.value)
  const lo = Math.min(...values, ...(target !== null ? [target] : []))
  const hi = Math.max(...values, ...(target !== null ? [target] : []))
  const pad = Math.max(0.4, (hi - lo) * 0.12)
  const ticks = niceTicks(lo - pad, hi + pad)
  const dMin = ticks[0] ?? lo
  const dMax = ticks[ticks.length - 1] ?? hi

  const plotW = Math.max(width - PAD.l - PAD.r, 1)
  const plotH = height - PAD.t - PAD.b
  const x = (t: number) => PAD.l + ((t - t0) / (t1 - t0)) * plotW
  const y = (v: number) => PAD.t + ((dMax - v) / (dMax - dMin || 1)) * plotH
  const xs = times.map(x)
  const ys = values.map(y)
  const baseY = height - PAD.b

  const line = xs.map((px, i) => `${i ? 'L' : 'M'}${px.toFixed(1)},${(ys[i] ?? 0).toFixed(1)}`).join(' ')
  const area = `${line} L${(xs[xs.length - 1] ?? 0).toFixed(1)},${baseY} L${(xs[0] ?? 0).toFixed(1)},${baseY} Z`
  const last = points.length - 1
  const showDots = points.length <= 20

  /** Найближча точка до пальця по X — читач цілиться в дату, а не в 2px лінію. */
  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left
    let best = 0
    xs.forEach((cx, i) => {
      if (Math.abs(cx - px) < Math.abs((xs[best] ?? 0) - px)) best = i
    })
    setActive(best)
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') setActive((a) => Math.max(0, (a ?? last + 1) - 1))
    else if (e.key === 'ArrowRight') setActive((a) => Math.min(last, (a ?? -1) + 1))
    else if (e.key === 'Escape') setActive(null)
    else return
    e.preventDefault()
  }

  const a = active !== null ? points[active] : undefined
  const ax = active !== null ? (xs[active] ?? 0) : 0
  const ay = active !== null ? (ys[active] ?? 0) : 0
  const tooltipLeft = Math.min(Math.max(ax - 48, 0), Math.max(width - 96, 0))
  const drawKey = `${points[0]?.date}-${points.length}` // перемалювати лінію при зміні періоду

  return (
    <div ref={ref} className="relative select-none" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          className="block touch-pan-y outline-none"
          role="img"
          aria-label={`Графік ваги: від ${kg(values[0] ?? 0)} до ${kg(values[last] ?? 0)} кг`}
          tabIndex={0}
          onKeyDown={onKey}
          onPointerDown={pick}
          onPointerMove={(e) => {
            if (e.pointerType === 'mouse' || e.buttons) pick(e)
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === 'mouse') setActive(null)
          }}
          onBlur={() => setActive(null)}
        >
          <defs>
            <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" style={{ stopColor: 'var(--accent-primary)', stopOpacity: 0.22 }} />
              <stop offset="100%" style={{ stopColor: 'var(--accent-primary)', stopOpacity: 0 }} />
            </linearGradient>
          </defs>

          {/* Сітка: тонкі суцільні лінії, підписи праворуч */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={width - PAD.r + 4} y1={y(t)} y2={y(t)} strokeWidth="1" style={{ stroke: 'rgb(255 255 255 / 0.06)' }} />
              <text x={width - PAD.r + 10} y={y(t)} dy="0.32em" className="fill-muted text-[10px]">
                {kg(t).replace(/,0$/, '')}
              </text>
            </g>
          ))}

          {/* Ціль — опорна лінія нейтральним кольором (колір серії зайнятий вагою) */}
          {target !== null && (
            <g>
              <line x1={PAD.l} x2={width - PAD.r + 4} y1={y(target)} y2={y(target)} strokeWidth="1" style={{ stroke: 'rgb(255 255 255 / 0.32)' }} />
              <text x={PAD.l + 2} y={y(target) - 5} className="fill-muted text-[10px]">
                ціль {kg(target)}
              </text>
            </g>
          )}

          <motion.path key={`a-${drawKey}`} d={area} fill={`url(#${id}-area)`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.3 }} />
          <motion.path
            key={`l-${drawKey}`}
            d={line}
            fill="none"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ stroke: 'var(--accent-primary)', filter: 'drop-shadow(0 0 4px var(--accent-primary))' }}
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.9, ease: 'easeInOut' }}
          />

          {/* Точки: кільце кольору поверхні відділяє їх від лінії */}
          {xs.map((cx, i) =>
            showDots || i === last ? (
              <circle
                key={i}
                cx={cx}
                cy={ys[i]}
                r={i === last ? 5 : 4}
                strokeWidth="2"
                style={{ fill: 'var(--accent-primary)', stroke: 'var(--bg-card)' }}
              />
            ) : null,
          )}

          {/* Значення на кінці лінії (коли немає активної точки) */}
          {active === null && (
            <text x={(xs[last] ?? 0) - 6} y={(ys[last] ?? 0) - 11} textAnchor="end" className="fill-fg text-[11px] font-bold">
              {kg(values[last] ?? 0)}
            </text>
          )}

          {/* Перехрестя */}
          {a && (
            <g>
              <line x1={ax} x2={ax} y1={PAD.t - 6} y2={baseY} strokeWidth="1" style={{ stroke: 'rgb(255 255 255 / 0.35)' }} />
              <circle cx={ax} cy={ay} r="6" strokeWidth="2.5" style={{ fill: 'var(--accent-primary)', stroke: 'var(--bg-card)' }} />
            </g>
          )}

          {/* Дати: перша й остання */}
          <text x={xs[0] ?? PAD.l} y={height - 8} textAnchor={points.length === 1 ? 'middle' : 'start'} className="fill-muted text-[10px]">
            {shortDate(points[0]?.date ?? '')}
          </text>
          {points.length > 1 && (
            <text x={xs[last] ?? 0} y={height - 8} textAnchor="end" className="fill-muted text-[10px]">
              {shortDate(points[last]?.date ?? '')}
            </text>
          )}
        </svg>
      )}

      {/* Підказка: спершу значення, потім дата */}
      {a && (
        <div
          className="pointer-events-none absolute top-0 flex w-24 flex-col items-center rounded-xl border border-line bg-elevated px-2 py-1 shadow-lg"
          style={{ left: tooltipLeft }}
        >
          <span className="text-sm font-bold">{kg(a.value)} кг</span>
          <span className="text-[10px] text-muted">{shortDate(a.date)}</span>
        </div>
      )}
    </div>
  )
}
