import { Check, Minus, Pencil, Plus, Trash2 } from 'lucide-react'
import { useState, type KeyboardEvent, type ReactNode } from 'react'
import { LIMITS, PORTION_LABELS, PORTION_UNITS, portionUnitLabel, type Portion, type PortionUnit } from '@shared/model.js'
import { NumberField } from '@/components/ui/Field'
import { cn } from '@/lib/cn'
import { grams, parseNum } from '@/lib/format'
import { haptic } from '@/lib/haptics'
import { portionGrams } from './portionMath'

/** Порції страви: обрати одну (крок порції) або відкрити редактор. */
export function PortionChips({
  portions,
  selected,
  onSelect,
  onEdit,
}: {
  portions: readonly Portion[]
  selected?: PortionUnit | null
  onSelect: (unit: PortionUnit) => void
  onEdit: () => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {portions.map((p) => {
        const { label, icon } = PORTION_LABELS[p.unit]
        return (
          <button
            key={p.unit}
            type="button"
            aria-pressed={selected === p.unit}
            onClick={() => onSelect(p.unit)}
            className={cn(
              'flex h-10 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors',
              selected === p.unit ? 'border-primary bg-primary/15 text-primary' : 'border-line bg-elevated text-fg',
            )}
          >
            <span aria-hidden>{icon}</span>
            {label}
            <span className="text-xs text-muted">· {grams(p.grams)} г</span>
          </button>
        )
      })}
      <button
        type="button"
        onClick={onEdit}
        className="flex h-10 items-center gap-1.5 rounded-full border border-dashed border-primary/50 px-3 text-sm text-primary transition-colors active:bg-primary/10"
      >
        {portions.length > 0 ? <Pencil className="size-4" /> : <Plus className="size-4" />}
        {portions.length > 0 ? 'Порції' : 'Додати порцію'}
      </button>
    </div>
  )
}

/**
 * Редактор порцій: сітка одиниць (штука, скибочка, …) → скільки грамів в одній.
 * Живе всередині форми додавання, тож Enter тут зберігає порцію, а не відправляє форму.
 */
export function PortionEditor({
  portions,
  onChange,
  onClose,
  initialUnit = null,
}: {
  portions: readonly Portion[]
  onChange: (next: Portion[]) => void
  onClose: () => void
  initialUnit?: PortionUnit | null
}) {
  const gramsOf = (unit: PortionUnit | null) => portions.find((p) => p.unit === unit)?.grams
  const [unit, setUnit] = useState<PortionUnit | null>(initialUnit)
  const [value, setValue] = useState(() => String(gramsOf(initialUnit) ?? ''))

  const g = parseNum(value)
  const valid = g !== null && g >= LIMITS.grams.min && g <= LIMITS.grams.max
  const existing = gramsOf(unit) !== undefined

  const pick = (u: PortionUnit) => {
    haptic(6)
    setUnit(u)
    setValue(String(gramsOf(u) ?? ''))
  }
  const save = () => {
    if (!unit || !valid) return
    haptic(10)
    onChange(PORTION_UNITS.flatMap((u) => (u === unit ? [{ unit, grams: g }] : portions.filter((p) => p.unit === u))))
    setUnit(null)
  }
  const remove = () => {
    if (!unit) return
    haptic(10)
    onChange(portions.filter((p) => p.unit !== unit))
    setUnit(null)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    save()
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line bg-elevated/50 p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-bold">
          Порції <span className="font-normal text-muted">· необов’язково</span>
        </p>
        <button type="button" onClick={onClose} className="text-sm font-bold text-primary">
          Готово
        </button>
      </div>

      <div role="radiogroup" aria-label="Одиниця порції" className="grid grid-cols-4 gap-2">
        {PORTION_UNITS.map((u) => {
          const { label, icon } = PORTION_LABELS[u]
          const set = gramsOf(u)
          return (
            <button
              key={u}
              type="button"
              role="radio"
              aria-checked={unit === u}
              onClick={() => pick(u)}
              className={cn(
                'flex h-[4.5rem] flex-col items-center justify-center gap-0.5 rounded-xl bg-card px-1 ring-1 ring-inset transition-colors',
                unit === u ? 'ring-primary' : set !== undefined ? 'ring-primary/30' : 'ring-line',
              )}
            >
              <span aria-hidden className="text-xl leading-none">
                {icon}
              </span>
              <span className="text-xs leading-tight font-semibold">{label}</span>
              <span className={cn('text-[11px] leading-none', set !== undefined ? 'text-primary' : 'text-transparent')}>
                {set !== undefined ? `${grams(set)} г` : '·'}
              </span>
            </button>
          )
        })}
      </div>

      {unit && (
        <div className="flex items-end gap-2">
          <NumberField
            key={unit}
            label={`1 ${PORTION_LABELS[unit].label} — це`}
            suffix="г"
            value={value}
            onChange={setValue}
            onKeyDown={onKeyDown}
            enterKeyHint="done"
            autoFocus
            className="min-w-0 flex-1"
          />
          {existing && (
            <button
              type="button"
              aria-label="Видалити порцію"
              onClick={remove}
              className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-danger/15 text-danger"
            >
              <Trash2 className="size-5" />
            </button>
          )}
          <button
            type="button"
            aria-label="Зберегти порцію"
            disabled={!valid}
            onClick={save}
            className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary disabled:opacity-40"
          >
            <Check className="size-5" />
          </button>
        </div>
      )}
    </div>
  )
}

/** Кількість порцій: крок ½, щоб «пів упаковки» теж можна було без грамів. */
const COUNT_STEP = 0.5
const COUNT_MAX = 50


/** Лічильник «− 2 штуки × 60 г = 120 г +». */
export function PortionCounter({
  unit,
  unitGrams,
  count,
  onChange,
}: {
  unit: PortionUnit
  unitGrams: number
  count: number
  onChange: (count: number) => void
}) {
  const step = (delta: number) => {
    haptic(6)
    onChange(Math.min(Math.max(count + delta, COUNT_STEP), COUNT_MAX))
  }
  return (
    <div className="flex items-center gap-3">
      <CountButton label="Менше" disabled={count <= COUNT_STEP} onClick={() => step(-COUNT_STEP)}>
        <Minus className="size-5" />
      </CountButton>
      <p className="min-w-0 flex-1 text-center">
        <span className="text-xl font-bold">{grams(count)}</span>{' '}
        <span className="text-sm">{portionUnitLabel(unit, count)}</span>
        <span className="block text-xs text-muted">
          × {grams(unitGrams)} г = {grams(portionGrams(unitGrams, count))} г
        </span>
      </p>
      <CountButton label="Більше" disabled={count >= COUNT_MAX} onClick={() => step(COUNT_STEP)}>
        <Plus className="size-5" />
      </CountButton>
    </div>
  )
}

function CountButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-line bg-elevated text-fg active:bg-white/10 disabled:opacity-40"
    >
      {children}
    </button>
  )
}
