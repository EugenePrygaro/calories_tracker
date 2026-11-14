import { motion, type MotionStyle } from 'framer-motion'
import { cn } from '@/lib/cn'

interface ProgressBarProps {
  value: number
  max: number
  /** Клас кольору заповнення, напр. `bg-protein`. При перевищенні max — градієнт перебору. */
  barClassName?: string
  /** Клас доріжки, напр. підсвітка кольором макросу. */
  trackClassName?: string
  /** Затримка бліку (с), щоб сусідні бари не блищали одночасно. */
  sheenDelay?: number
  /** Назва для екранних читалок, напр. «Білки» */
  label?: string
  className?: string
}

/** Глянцевий прогрес-бар з бліком, що пробігає (див. `bar-gloss` в index.css). */
export function ProgressBar({
  value,
  max,
  barClassName = 'bg-accent-gradient',
  trackClassName = 'bg-white/[0.06]',
  sheenDelay = 0,
  label,
  className,
}: ProgressBarProps) {
  const pct = max > 0 ? Math.min(value / max, 1) * 100 : 0
  const over = max > 0 && value > max

  return (
    <div
      className={cn('track-inset h-2 w-full overflow-hidden rounded-full', trackClassName, className)}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={Math.round(max)}
    >
      <motion.div
        className={cn('h-full rounded-full', pct > 0 && 'bar-gloss', over ? 'bg-over' : barClassName)}
        style={{ '--sheen-delay': `${sheenDelay}s` } as MotionStyle}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ type: 'spring', stiffness: 110, damping: 20 }}
      />
    </div>
  )
}
