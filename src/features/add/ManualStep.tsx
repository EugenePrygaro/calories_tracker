import { useState, type FormEvent } from 'react'
import type { MealType, Portion, PortionUnit } from '@shared/model.js'
import { scale } from '@shared/nutrition.js'
import { Button } from '@/components/ui/Button'
import { Field, NumberField } from '@/components/ui/Field'
import { SheetFooter } from '@/components/ui/Modal'
import { Switch } from '@/components/ui/Switch'
import { addEntry, buildEntry, newOwnFood, saveFood, type EntryDraft } from '@/data/store'
import { parseNum } from '@/lib/format'
import { useUiStore } from '@/store/ui'
import { NutrientsPreview } from '../NutrientsPreview'
import { PortionChips, PortionEditor } from './Portions'

const n0 = (s: string) => parseNum(s) ?? 0

/** Чернетка проходить ту саму валідацію, що й на сервері → повертає нормалізований запис. */
function tryBuild(draft: EntryDraft) {
  try {
    return buildEntry(draft, 'preview-id', 1)
  } catch {
    return null
  }
}

/** Страви немає в пошуку → вводимо цінність на 100 г вручну й одразу зберігаємо собі. */
export function ManualStep({
  meal,
  initialName,
  barcode,
  onDone,
}: {
  meal: MealType
  initialName: string
  /** Відскановано, але ніде не знайшли — запам'ятаємо зі стравою, наступного разу знайдеться одразу */
  barcode?: string | undefined
  onDone: () => void
}) {
  const date = useUiStore((s) => s.selectedDate)
  const [f, setF] = useState({ name: initialName, grams: '', kcal: '', protein: '', fat: '', carbs: '' })
  const [saveToMine, setSaveToMine] = useState(true)
  const [portions, setPortions] = useState<Portion[]>([])
  /** Відкритий редактор порцій: false — закритий, null — без обраної одиниці. */
  const [editing, setEditing] = useState<PortionUnit | null | false>(false)
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }))

  const draft: EntryDraft = {
    mode: 'weight',
    date,
    meal,
    name: f.name,
    grams: f.grams,
    per100: { kcal: f.kcal, protein: f.protein, fat: f.fat, carbs: f.carbs },
  }
  const built = tryBuild(draft)
  const preview = scale({ kcal: n0(f.kcal), protein: n0(f.protein), fat: n0(f.fat), carbs: n0(f.carbs) }, n0(f.grams))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!built?.per100 || built.grams === null) return
    void addEntry(draft).catch(() => {})
    if (saveToMine) {
      void saveFood(
        newOwnFood({ name: built.name, per100: built.per100, servingGrams: built.grams, portions, barcode: barcode ?? null }),
      ).catch(() => {})
    }
    onDone()
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col gap-4">
      {barcode && (
        <p className="rounded-2xl bg-warning/10 px-3 py-2 text-xs text-warning">
          Штрихкод {barcode} ніде не знайдено. Введіть цифри з етикетки — страва збережеться з цим кодом, і наступного
          разу сканер знайде її одразу.
        </p>
      )}
      <Field label="Назва" value={f.name} onChange={set('name')} placeholder="Сирники" autoFocus={!initialName} />
      <NumberField label="Вага порції" suffix="г" value={f.grams} onChange={set('grams')} autoFocus={!!initialName} />
      <p className="-mb-2 text-xs font-medium tracking-wider text-muted uppercase">На 100 г продукту</p>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Калорії" suffix="ккал" value={f.kcal} onChange={set('kcal')} />
        <NumberField label="Білки" suffix="г" value={f.protein} onChange={set('protein')} />
        <NumberField label="Жири" suffix="г" value={f.fat} onChange={set('fat')} />
        <NumberField label="Вуглеводи" suffix="г" value={f.carbs} onChange={set('carbs')} />
      </div>
      <NutrientsPreview value={preview} />
      <Switch
        checked={saveToMine}
        onChange={setSaveToMine}
        label="Зберегти в мої страви"
        hint="Наступного разу знайдеться в пошуку"
      />
      {saveToMine &&
        (editing !== false ? (
          <PortionEditor
            portions={portions}
            onChange={setPortions}
            onClose={() => setEditing(false)}
            initialUnit={editing}
          />
        ) : (
          <PortionChips portions={portions} onSelect={(unit) => setEditing(unit)} onEdit={() => setEditing(null)} />
        ))}
      <SheetFooter>
        <Button type="submit" disabled={!built} className="flex-1">
          Додати
        </Button>
      </SheetFooter>
    </form>
  )
}
