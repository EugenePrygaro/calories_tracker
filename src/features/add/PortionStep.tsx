import { Pencil } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { LIMITS, type FoodItem, type MealType, type Portion, type PortionUnit } from '@shared/model.js'
import { scale } from '@shared/nutrition.js'
import { Button } from '@/components/ui/Button'
import { GramsField } from '@/components/ui/GramsField'
import { SheetFooter } from '@/components/ui/Modal'
import { Switch } from '@/components/ui/Switch'
import { addEntry, saveFood, useFoods } from '@/data/store'
import { cn } from '@/lib/cn'
import { grams, kcal, parseNum } from '@/lib/format'
import { useUiStore } from '@/store/ui'
import { NutrientsPreview } from '../NutrientsPreview'
import { FoodThumb } from './FoodRow'
import { PortionChips, PortionCounter, PortionEditor } from './Portions'
import { portionGrams } from './portionMath'

interface PortionStepProps {
  item: FoodItem
  meal: MealType
  onDone: () => void
  /** Відкрити редагування страви (лише для збережених у «Моїх стравах»). */
  onEditFood?: (item: FoodItem) => void
}

const PRESETS = [50, 100, 150, 200, 250, 300]

type Picked = { unit: PortionUnit; count: number }

const totalGrams = (portion: Portion, count: number) => portionGrams(portion.grams, count)

/** Вибрана страва → скільки з'їдено: порцією («2 штуки») або в грамах. */
export function PortionStep({ item, meal, onDone, onEditFood }: PortionStepProps) {
  const date = useUiStore((s) => s.selectedDate)
  const saved = useFoods().find((f) => f.id === item.id)
  const [portions, setPortions] = useState<Portion[]>(() => saved?.portions ?? item.portions ?? [])
  // Спершу — типова вага страви; якщо її немає, а порції є — перша порція.
  const [value, setValue] = useState(() => String(item.servingGrams ?? portions[0]?.grams ?? 100))
  const [picked, setPicked] = useState<Picked | null>(() => {
    const initial = item.servingGrams ?? portions[0]?.grams
    const match = portions.find((p) => p.grams === initial)
    return match ? { unit: match.unit, count: 1 } : null
  })
  const [editing, setEditing] = useState(false)
  const [saveToMine, setSaveToMine] = useState(false)

  const g = parseNum(value)
  const valid = g !== null && g >= LIMITS.grams.min && g <= LIMITS.grams.max
  const presets = [...new Set([item.servingGrams, ...PRESETS].filter((n): n is number => n !== null))]
  const pickedPortion = picked && portions.find((p) => p.unit === picked.unit)
  const p = item.per100

  const choose = (unit: PortionUnit, count: number) => {
    const portion = portions.find((x) => x.unit === unit)
    if (!portion) return
    setPicked({ unit, count })
    setValue(String(totalGrams(portion, count)))
  }
  /** Грами ввели руками чи кнопкою — порція більше не обрана. */
  const setGrams = (v: string) => {
    setPicked(null)
    setValue(v)
  }

  const changePortions = (next: Portion[]) => {
    setPortions(next)
    // Порції живуть у «Моїх стравах»: збережена страва оновлюється одразу,
    // а нову з пошуку збережемо разом із записом.
    if (saved) void saveFood({ ...saved, portions: next }).catch(() => {})
    else setSaveToMine(true)
    // обрана порція змінила вагу чи зникла
    if (picked) {
      const portion = next.find((x) => x.unit === picked.unit)
      if (portion) setValue(String(totalGrams(portion, picked.count)))
      else setPicked(null)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    void addEntry(
      { mode: 'weight', date, meal, name: item.name, grams: g, per100: p, portion: pickedPortion ? picked : null },
      { foodId: item.id },
    ).catch(() => {})
    // Вагу запам'ятовуємо як типову — наступного разу підставиться сама.
    if (saveToMine && !saved) void saveFood({ ...item, servingGrams: g, portions }).catch(() => {})
    onDone()
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col gap-4">
      <div className="flex items-center gap-3">
        <FoodThumb imageUrl={item.imageUrl} className="size-16" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{item.name}</p>
          {item.brand && <p className="truncate text-xs text-muted">{item.brand}</p>}
          <p className="text-xs text-muted">
            На 100 г: {kcal(p.kcal)} ккал · Б {grams(p.protein)} · Ж {grams(p.fat)} · В {grams(p.carbs)}
          </p>
        </div>
        {saved && onEditFood && (
          <button
            type="button"
            aria-label="Редагувати страву"
            onClick={() => onEditFood(saved)}
            className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition active:bg-elevated"
          >
            <Pencil className="size-5" />
          </button>
        )}
      </div>

      {editing ? (
        <PortionEditor portions={portions} onChange={changePortions} onClose={() => setEditing(false)} />
      ) : (
        <PortionChips
          portions={portions}
          selected={picked?.unit ?? null}
          onSelect={(unit) => choose(unit, picked?.unit === unit ? picked.count : 1)}
          onEdit={() => setEditing(true)}
        />
      )}

      {picked && pickedPortion && (
        <div className="-mt-1">
          <PortionCounter
            unit={picked.unit}
            unitGrams={pickedPortion.grams}
            count={picked.count}
            onChange={(count) => choose(picked.unit, count)}
          />
        </div>
      )}

      <GramsField label="Скільки з’їли" value={value} onChange={setGrams} autoFocus={!picked && portions.length === 0} />

      <div className="-mt-2 flex flex-wrap gap-2">
        {presets.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setGrams(String(n))}
            className={cn(
              'h-10 min-w-14 rounded-full border px-3 text-sm transition-colors',
              !picked && g === n ? 'border-primary bg-primary/15 text-primary' : 'border-line bg-elevated text-fg',
            )}
          >
            {grams(n)} г{n === item.servingGrams && <span className="ml-1 text-xs text-muted">· зазвичай</span>}
          </button>
        ))}
      </div>

      <NutrientsPreview value={scale(p, valid ? g : 0)} />

      {item.source !== 'own' && !saved && (
        <Switch
          checked={saveToMine}
          onChange={setSaveToMine}
          label="Зберегти в мої страви"
          hint={portions.length > 0 ? 'Буде першою в пошуку, з цією вагою й порціями' : 'Буде першою в пошуку, з цією вагою'}
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
