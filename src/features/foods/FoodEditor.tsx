import { Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { type FoodItem, type FoodSource, type Portion, type PortionUnit } from '@shared/model.js'
import { sanitizeFood } from '@shared/validate.js'
import { Button } from '@/components/ui/Button'
import { Field, NumberField } from '@/components/ui/Field'
import { SheetFooter } from '@/components/ui/Modal'
import { newOwnFood, removeFood, saveFood, useFoods } from '@/data/store'
import { PortionChips, PortionEditor } from '../add/Portions'

const SOURCE_LABELS: Record<FoodSource, string> = {
  own: 'Власна страва',
  silpo: 'З каталогу Сільпо',
  zakaz: 'З каталогу Zakaz.ua',
  off: 'З Open Food Facts',
}

/** Число в поле — з комою, як усюди в застосунку («12,6»). */
const str = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','))

/**
 * Редагування страви з «Моїх страв» (або створення нової, якщо `food` — null).
 * Записи в щоденнику мають власну копію цінності, тож зміни їх не торкаються.
 */
export function FoodEditor({
  food,
  onSaved,
  onDeleted,
}: {
  food: FoodItem | null
  onSaved: (food: FoodItem) => void
  onDeleted?: () => void
}) {
  const saved = useFoods().find((f) => f.id === food?.id)
  const [f, setF] = useState(() => ({
    name: food?.name ?? '',
    brand: food?.brand ?? '',
    kcal: str(food?.per100.kcal),
    protein: str(food?.per100.protein),
    fat: str(food?.per100.fat),
    carbs: str(food?.per100.carbs),
    servingGrams: str(food?.servingGrams),
  }))
  const [portions, setPortions] = useState<Portion[]>(() => food?.portions ?? [])
  /** Відкритий редактор порцій: false — закритий, null — без обраної одиниці. */
  const [editing, setEditing] = useState<PortionUnit | null | false>(false)
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }))

  // нова страва — id один на весь час редагування
  const [base] = useState(
    () => food ?? newOwnFood({ name: '', per100: { kcal: 0, protein: 0, fat: 0, carbs: 0 }, servingGrams: null }),
  )
  const draft = {
    ...base,
    name: f.name,
    brand: f.brand,
    per100: { kcal: f.kcal, protein: f.protein, fat: f.fat, carbs: f.carbs },
    servingGrams: f.servingGrams,
    portions,
  }
  // та сама перевірка, що й на сервері: кнопка неактивна, поки є помилка
  let valid = true
  try {
    sanitizeFood({ ...draft, createdAt: 1, updatedAt: 1 })
  } catch {
    valid = false
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    // мітки часу ставить saveFood; тут — лише нормалізовані поля
    const clean = sanitizeFood({ ...draft, createdAt: 1, updatedAt: 1 })
    void saveFood(clean).catch(() => {})
    onSaved(clean)
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col gap-4">
      <p className="-mb-1 text-xs text-muted">
        {SOURCE_LABELS[base.source]}
        {saved && ' · записи в щоденнику не зміняться'}
      </p>
      <Field label="Назва" value={f.name} onChange={set('name')} placeholder="Сирники" autoFocus={!food} />
      <Field label="Бренд" hint="необов’язково" value={f.brand} onChange={set('brand')} placeholder="—" />

      <p className="-mb-2 text-xs font-medium tracking-wider text-muted uppercase">На 100 г продукту</p>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Калорії" suffix="ккал" value={f.kcal} onChange={set('kcal')} />
        <NumberField label="Білки" suffix="г" value={f.protein} onChange={set('protein')} />
        <NumberField label="Жири" suffix="г" value={f.fat} onChange={set('fat')} />
        <NumberField label="Вуглеводи" suffix="г" value={f.carbs} onChange={set('carbs')} />
      </div>

      <NumberField
        label="Звична вага"
        hint="підставляється при додаванні"
        suffix="г"
        value={f.servingGrams}
        onChange={set('servingGrams')}
        placeholder="—"
      />

      {editing !== false ? (
        <PortionEditor portions={portions} onChange={setPortions} onClose={() => setEditing(false)} initialUnit={editing} />
      ) : (
        <PortionChips portions={portions} onSelect={(unit) => setEditing(unit)} onEdit={() => setEditing(null)} />
      )}

      <SheetFooter>
        {saved && (
          <Button
            variant="danger"
            aria-label="Видалити страву"
            onClick={() => {
              removeFood(saved)
              onDeleted?.()
            }}
            className="w-12 shrink-0 px-0"
          >
            <Trash2 className="size-5" />
          </Button>
        )}
        <Button type="submit" disabled={!valid} className="flex-1">
          Зберегти
        </Button>
      </SheetFooter>
    </form>
  )
}
