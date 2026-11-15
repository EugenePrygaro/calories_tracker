import { motion, useSpring, useTransform } from 'framer-motion'
import { useEffect, useId, type ReactNode } from 'react'

interface GaugeProps {
  /** Заповнення дуги, 0…1 */
  value: number
  /** Перебір норми: дуга повна, червоно-бурштиновий градієнт */
  over?: boolean
  children?: ReactNode
  className?: string
}

/*
 * Дуга на 270°, відкрита знизу: від 135° (низ-ліво) за годинниковою до 45° (низ-право).
 * Центр (100, 100), радіус 84.
 */
const R = 84
const START = 135
const SWEEP = 270
const ARC = 'M 40.6 159.4 A 84 84 0 1 1 159.4 159.4'
const rad = (deg: number) => (deg * Math.PI) / 180

/** Штрихи-поділки зовні дуги — кожні 10% */
const TICKS = Array.from({ length: 11 }, (_, i) => {
  const a = rad(START + (SWEEP * i) / 10)
  const r1 = R + 10
  const r2 = R + (i % 5 === 0 ? 15 : 13)
  return { x1: 100 + r1 * Math.cos(a), y1: 100 + r1 * Math.sin(a), x2: 100 + r2 * Math.cos(a), y2: 100 + r2 * Math.sin(a) }
})

export function Gauge({ value, over = false, children, className }: GaugeProps) {
  const id = useId()
  const fill = over ? 1 : Math.min(Math.max(value, 0), 1)

  // Одна пружина керує і дугою, і точкою на її кінці — рухаються синхронно.
  const progress = useSpring(0, { stiffness: 60, damping: 16 })
  useEffect(() => {
    progress.set(fill)
  }, [progress, fill])

  const angle = useTransform(progress, (p) => rad(START + SWEEP * p))
  const knobX = useTransform(angle, (a) => 100 + R * Math.cos(a))
  const knobY = useTransform(angle, (a) => 100 + R * Math.sin(a))
  const visible = useTransform(progress, (p) => (p > 0.004 ? 1 : 0))
  const glow = useTransform(progress, (p) => (p > 0.004 ? 0.28 : 0))
  const accent = over ? 'var(--danger)' : 'var(--accent-primary)'

  return (
    <div data-gauge className={`relative aspect-square ${className ?? ''}`}>
      <svg viewBox="0 0 200 200" className="absolute inset-0 size-full overflow-visible" aria-hidden>
        <defs>
          <linearGradient id={`${id}-ok`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" style={{ stopColor: 'var(--accent-primary-deep)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--accent-primary)' }} />
          </linearGradient>
          <linearGradient id={`${id}-over`} x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" style={{ stopColor: 'var(--danger)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--warning)' }} />
          </linearGradient>
        </defs>

        {TICKS.map((t, i) => (
          <line key={i} {...t} strokeWidth={i % 5 === 0 ? 2 : 1.2} strokeLinecap="round" style={{ stroke: 'var(--border)' }} />
        ))}

        <path d={ARC} fill="none" strokeWidth="10" strokeLinecap="round" style={{ stroke: 'rgb(255 255 255 / 0.06)' }} />
        {/* Сяйво — дві ширші напівпрозорі лінії під дугою. Замість filter: drop-shadow:
            фільтр на анімованій лінії перемальовувався на кожному кадрі (відчутно на телефонах). */}
        <motion.g style={{ opacity: visible }}>
          <motion.path d={ARC} fill="none" strokeWidth="24" strokeLinecap="round" opacity={0.08} style={{ pathLength: progress, stroke: accent }} />
          <motion.path d={ARC} fill="none" strokeWidth="17" strokeLinecap="round" opacity={0.14} style={{ pathLength: progress, stroke: accent }} />
        </motion.g>
        <motion.path
          d={ARC}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          stroke={`url(#${id}-${over ? 'over' : 'ok'})`}
          style={{ pathLength: progress, opacity: visible }}
        />
        {/* Світна точка на кінці дуги */}
        <motion.circle r="12" cx={knobX} cy={knobY} style={{ opacity: glow, fill: accent }} />
        <motion.circle r="7.5" cx={knobX} cy={knobY} fill="white" style={{ opacity: visible }} />
        <motion.circle r="3" cx={knobX} cy={knobY} style={{ opacity: visible, fill: accent }} />
      </svg>
      {/* Вміст обмежено внутрішньою областю дуги */}
      <div className="absolute inset-[13%] flex flex-col items-center justify-center overflow-hidden text-center whitespace-nowrap">
        {children}
      </div>
    </div>
  )
}
