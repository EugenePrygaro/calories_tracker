import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'ghost' | 'danger'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent-gradient text-white font-bold glow hover:brightness-110',
  ghost: 'bg-elevated text-fg hover:bg-line',
  danger: 'bg-danger/15 text-danger hover:bg-danger/25',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
}

export function Button({ variant = 'primary', className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex h-12 items-center justify-center gap-2 rounded-2xl px-5 transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40',
        VARIANTS[variant],
        className,
      )}
      {...rest}
    />
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
}

export function IconButton({ label, className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        // 44px — мінімальна зона дотику (Apple HIG)
        'inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition hover:bg-elevated hover:text-fg active:scale-90 active:bg-elevated',
        className,
      )}
      {...rest}
    />
  )
}
