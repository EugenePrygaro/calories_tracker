import { useState, type FormEvent } from 'react'
import { LIMITS, type FoodItem, type MealType } from '@shared/model.js'
import { scale } from '@shared/nutrition.js'
import { Button } from '@/components/ui/Button'
import { NumberField } from '@/components/ui/Field'
import { SheetFooter } from '@/components/ui/Modal'
import { Switch } from '@/components/ui/Switch'
import { addEntry, saveFood, useFoods } from '@/data/store'
import { cn } from '@/lib/cn'
import { grams, kcal, parseNum } from '@/lib/format'
import { useUiStore } from '@/store/ui'
import { NutrientsPreview } from '../NutrientsPreview'
import { FoodThumb } from './FoodRow'

interface PortionStepProps {
  item: FoodItem
  meal: MealType
  onDone: () => void
}

const PRESETS = [50, 100, 150, 200, 250, 300]

/** Вибрана страва → скільки грамів з'їдено. */
export function PortionStep({ item, meal, onDone }: PortionStepProps) {
  const date = useUiStore((s) => s.selectedDate)
  const alreadySaved = useFoods().some((f) => f.id === item.id)
  const [value, setValue] = useState(String(item.servingGrams ?? 100))
  const [saveToMine, setSaveToMine] = useState(false)

  const g = parseNum(value)
  const valid = g !== null && g >= LIMITS.grams.min && g <= LIMITS.grams.max
  const presets = [...new Set([item.servingGrams, ...PRESETS].filter((n): n is number => n !== null))]
  const p = item.per100

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    void addEntry({ mode: 'weight', date, meal, name: item.name, grams: g, per100: p }).catch(() => {})
    // Порцію запам'ятовуємо як типову — наступного разу підставиться сама.
    if (saveToMine && !alreadySaved) void saveFood({ ...item, servingGrams: g }).catch(() => {})
    onDone()
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col gap-4">
      <div className="flex items-center gap-3">
        <FoodThumb imageUrl={item.imageUrl} className="size-16" />
        <div className="min-w-0">
          <p className="font-semibold">{item.name}</p>
          {item.brand && <p className="truncate text-xs text-muted">{item.brand}</p>}
          <p className="text-xs text-muted">
            На 100 г: {kcal(p.kcal)} ккал · Б {grams(p.protein)} · Ж {grams(p.fat)} · В {grams(p.carbs)}
          </p>
        </div>
      </div>

      <NumberField label="Скільки з’їли" suffix="г" value={value} onChange={setValue} autoFocus />

      <div className="-mt-2 flex flex-wrap gap-2">
        {presets.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setValue(String(n))}
            className={cn(
              'h-10 min-w-14 rounded-full border px-3 text-sm transition-colors',
              g === n ? 'border-primary bg-primary/15 text-primary' : 'border-line bg-elevated text-fg',
            )}
          >
            {grams(n)} г{n === item.servingGrams && <span className="ml-1 text-xs text-muted">· порція</span>}
          </button>
        ))}
      </div>

      <NutrientsPreview value={scale(p, valid ? g : 0)} />

      {item.source === 'off' && !alreadySaved && (
        <Switch
          checked={saveToMine}
          onChange={setSaveToMine}
          label="Зберегти в мої страви"
          hint="Буде першою в пошуку, з цією порцією"
        />
      )}

      <SheetFooter>
        <Button type="submit" disabled={!valid} className="flex-1">
          Додати {valid && `· ${kcal(scale(p, g).kcal)} ккал`}
        </Button>
      </SheetFooter>
    </form>
  )
}
