import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'

interface ProgressBarProps {
  value: number
  max: number
  className?: string
  barClassName?: string
}

export function ProgressBar({ value, max, className, barClassName }: ProgressBarProps) {
  const pct = max > 0 ? Math.min(value / max, 1) * 100 : 0
  const over = value > max

  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800', className)}>
      <motion.div
        className={cn('h-full rounded-full bg-brand-500', over && 'bg-red-500', barClassName)}
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ type: 'spring', stiffness: 120, damping: 20 }}
      />
    </div>
  )
}
