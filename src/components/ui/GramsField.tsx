import { motion } from 'framer-motion'
import { Minus, Plus } from 'lucide-react'
import { LIMITS } from '@shared/model.js'
import { haptic } from '@/lib/haptics'
import { parseNum } from '@/lib/format'
import { NumberField } from './Field'

const STEP = 10

/**
 * Поле ваги порції з кнопками −10 / +10 г: підправити порцію без клавіатури.
 * Порожнє чи нечислове значення кнопки трактують як 0.
 */
export function GramsField({
  label,
  value,
  onChange,
  autoFocus,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  autoFocus?: boolean
}) {
  const g = parseNum(value) ?? 0
  const bump = (delta: number) => {
    const next = Math.min(Math.max(Math.round((g + delta) / STEP) * STEP, 0), LIMITS.grams.max)
    haptic(6)
    onChange(String(next))
  }

  return (
    <div className="flex items-end gap-2">
      <StepButton label={`Мінус ${STEP} г`} disabled={g <= 0} onClick={() => bump(-STEP)}>
        <Minus className="size-5" />
      </StepButton>
      <div className="min-w-0 flex-1">
        <NumberField label={label} suffix="г" value={value} onChange={onChange} {...(autoFocus ? { autoFocus } : {})} />
      </div>
      <StepButton label={`Плюс ${STEP} г`} disabled={g >= LIMITS.grams.max} onClick={() => bump(STEP)}>
        <Plus className="size-5" />
      </StepButton>
    </div>
  )
}

function StepButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      whileTap={{ scale: 0.88 }}
      className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl border border-line bg-elevated text-fg active:bg-white/10 disabled:opacity-40"
    >
      {children}
      <span className="-mt-0.5 text-[9px] leading-none text-muted">{STEP}</span>
    </motion.button>
  )
}
