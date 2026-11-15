import { motion } from 'framer-motion'
import { useState, type KeyboardEvent, type PointerEvent } from 'react'
import { fromDateKey } from '@/lib/date'
import { int } from '@/lib/format'
import { useWidth } from '@/lib/useWidth'

export interface Bar {
  date: string
  /** null — у цей день записів немає (порожнє місце) */
  value: number | null
  color: string
  /** сьогодні: день ще не завершено — блідіше */
  faded?: boolean
}

interface DailyBarChartProps {
  bars: readonly Bar[]
  /** Опорна лінія (норма) або нуль для дефіциту */
  reference: { value: number; label: string } | null
  /** Дозволити від'ємні стовпчики (дефіцит/профіцит навколо нуля) */
  signed?: boolean
  /** Підпис значення в підказці */
  format: (v: number) => string
  /** Другий рядок підказки (наприклад, норма дня) */
  detail?: (bar: Bar) => string | null
  height?: number
  ariaLabel: string
}

const PAD = { l: 4, r: 44, t: 26, b: 24 }
/** До скількох стовпчиків анімуємо кожен окремо (тиждень, місяць). */
const ANIMATED_BARS_MAX = 31
const shortDate = (key: string) => fromDateKey(key).toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })

/** «Гарний» крок осі: 1 / 2 / 5 × 10ⁿ. */
function niceStep(span: number, count = 4) {
  const raw = span / count || 1
  const pow = 10 ** Math.floor(Math.log10(raw))
  return ([1, 2, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow
}

/**
 * Стовпчики по днях (калорії або дефіцит): у стилі графіка ваги — тонка сітка з підписами
 * праворуч, опорна лінія, підказка під пальцем (значення → дата).
 */
export function DailyBarChart({ bars, reference, signed = false, format, detail, height = 190, ariaLabel }: DailyBarChartProps) {
  const [ref, width] = useWidth()
  const [active, setActive] = useState<number | null>(null)

  const values = bars.flatMap((b) => (b.value === null ? [] : [b.value]))
  if (values.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-2xl bg-white/[0.03] text-sm text-muted">
        За цей період ще немає записів
      </div>
    )
  }

  const refValue = reference?.value ?? 0
  let lo = signed ? Math.min(0, ...values) : 0
  let hi = Math.max(...values, refValue, signed ? 0 : 1)
  const step = niceStep(hi - lo)
  lo = Math.floor(lo / step) * step
  hi = Math.ceil((hi * 1.05) / step) * step
  const ticks: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v))

  const plotW = Math.max(width - PAD.l - PAD.r, 1)
  const plotH = height - PAD.t - PAD.b
  const slot = plotW / bars.length
  const barW = Math.max(Math.min(slot * 0.7, 18), 1.5)
  const y = (v: number) => PAD.t + ((hi - v) / (hi - lo || 1)) * plotH
  const y0 = y(0)
  const cx = (i: number) => PAD.l + slot * (i + 0.5)

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left
    const i = Math.min(Math.max(Math.floor((px - PAD.l) / slot), 0), bars.length - 1)
    // найближчий день із записами — у порожній день цілитись нема сенсу
    let best = -1
    bars.forEach((b, j) => {
      if (b.value !== null && (best < 0 || Math.abs(j - i) < Math.abs(best - i))) best = j
    })
    setActive(best >= 0 ? best : null)
  }
  const onKey = (e: KeyboardEvent) => {
    const step = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0
    if (e.key === 'Escape') setActive(null)
    else if (step) {
      let j = active ?? (step > 0 ? -1 : bars.length)
      do j += step
      while (j >= 0 && j < bars.length && bars[j]?.value === null)
      if (j >= 0 && j < bars.length) setActive(j)
    } else return
    e.preventDefault()
  }

  const a = active !== null ? bars[active] : undefined
  const ax = active !== null ? cx(active) : 0
  const tooltipLeft = Math.min(Math.max(ax - 56, 0), Math.max(width - 112, 0))
  const drawKey = `${bars[0]?.date}-${bars.length}`
  const animateBars = bars.length <= ANIMATED_BARS_MAX

  return (
    <div ref={ref} className="relative select-none" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          className="block touch-pan-y outline-none"
          role="img"
          aria-label={ariaLabel}
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
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={width - PAD.r + 4} y1={y(t)} y2={y(t)} strokeWidth="1" style={{ stroke: t === 0 && signed ? 'rgb(255 255 255 / 0.22)' : 'rgb(255 255 255 / 0.06)' }} />
              <text x={width - PAD.r + 10} y={y(t)} dy="0.32em" className="fill-muted text-[10px]">
                {int(t)}
              </text>
            </g>
          ))}

          {bars.map((b, i) => {
            if (b.value === null) return null
            const top = Math.min(y(b.value), y0)
            const h = Math.max(Math.abs(y(b.value) - y0), 1.5)
            const style = { fill: b.color, opacity: active !== null && active !== i ? 0.45 : b.faded ? 0.5 : 1 }
            // місяць і довше — звичайні прямокутники: сотня анімацій лише гальмує відкриття
            if (!animateBars) {
              return <rect key={b.date} x={cx(i) - barW / 2} y={top} width={barW} height={h} rx={Math.min(barW / 2, 4)} style={style} />
            }
            return (
              <motion.rect
                key={`${drawKey}-${b.date}`}
                x={cx(i) - barW / 2}
                width={barW}
                rx={Math.min(barW / 2, 4)}
                initial={{ y: y0, height: 0 }}
                animate={{ y: top, height: h }}
                transition={{ duration: 0.5, delay: Math.min(i * 0.012, 0.4), ease: 'easeOut' }}
                style={style}
              />
            )
          })}

          {/* Опорна лінія (норма) — поверх стовпчиків, пунктиром */}
          {reference && (
            <g>
              <line
                x1={PAD.l}
                x2={width - PAD.r + 4}
                y1={y(reference.value)}
                y2={y(reference.value)}
                strokeWidth="1.2"
                strokeDasharray="4 4"
                style={{ stroke: 'rgb(255 255 255 / 0.45)' }}
              />
              <text x={PAD.l + 2} y={y(reference.value) - 6} className="fill-muted text-[10px]">
                {reference.label}
              </text>
            </g>
          )}

          {a && <line x1={ax} x2={ax} y1={PAD.t - 8} y2={height - PAD.b} strokeWidth="1" style={{ stroke: 'rgb(255 255 255 / 0.3)' }} />}

          <text x={PAD.l} y={height - 6} className="fill-muted text-[10px]">
            {shortDate(bars[0]?.date ?? '')}
          </text>
          <text x={width - PAD.r} y={height - 6} textAnchor="end" className="fill-muted text-[10px]">
            {shortDate(bars[bars.length - 1]?.date ?? '')}
          </text>
        </svg>
      )}

      {a && a.value !== null && (
        <div
          className="pointer-events-none absolute top-0 flex w-28 flex-col items-center rounded-xl border border-line bg-elevated px-2 py-1 shadow-lg"
          style={{ left: tooltipLeft }}
        >
          <span className="text-sm font-bold">{format(a.value)}</span>
          {detail?.(a) && <span className="text-[10px] text-muted">{detail(a)}</span>}
          <span className="text-[10px] text-muted">{shortDate(a.date)}</span>
        </div>
      )}
    </div>
  )
}
