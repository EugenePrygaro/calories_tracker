import { CircleAlert, CircleCheck, CircleX, Info } from 'lucide-react'
import type { CheckLevel } from '@shared/insights.js'
import { cn } from '@/lib/cn'

/** Іконка рівня перевірки: погано / варто звернути увагу / до відома / добре. */
export function CheckIcon({ level, className }: { level: CheckLevel; className?: string }) {
  const cls = cn('shrink-0', className)
  if (level === 'bad') return <CircleX className={cn(cls, 'text-danger')} />
  if (level === 'warn') return <CircleAlert className={cn(cls, 'text-warning')} />
  if (level === 'info') return <Info className={cn(cls, 'text-muted')} />
  return <CircleCheck className={cn(cls, 'text-primary')} />
}
