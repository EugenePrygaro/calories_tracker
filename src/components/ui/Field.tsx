import { useId, type InputHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  label: string
  value: string
  onChange: (value: string) => void
  /** Одиниця праворуч у полі: «г», «ккал». */
  suffix?: string
  hint?: string
}

export function Field({ label, value, onChange, suffix, hint, className, id, ...rest }: FieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={inputId} className="text-xs font-medium text-muted">
        {label}
        {hint && <span className="ml-1 opacity-70">· {hint}</span>}
      </label>
      <div className="flex h-12 items-center rounded-xl border border-line bg-elevated px-3 transition focus-within:border-primary">
        <input
          id={inputId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full min-w-0 bg-transparent text-base text-fg outline-none placeholder:text-muted/50"
          {...rest}
        />
        {suffix && <span className="ml-2 shrink-0 text-sm text-muted">{suffix}</span>}
      </div>
    </div>
  )
}

/** Поле для чисел: цифрова клавіатура з комою на телефоні. */
export function NumberField(props: FieldProps) {
  return <Field inputMode="decimal" autoComplete="off" placeholder="0" {...props} />
}
