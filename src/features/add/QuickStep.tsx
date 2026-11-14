import { useState, type FormEvent } from 'react'
import { QUICK_ADD_NAME, type MealType } from '@shared/model.js'
import { Button } from '@/components/ui/Button'
import { Field, NumberField } from '@/components/ui/Field'
import { SheetFooter } from '@/components/ui/Modal'
import { addEntry, buildEntry, type EntryDraft } from '@/data/store'
import { parseNum } from '@/lib/format'
import { useUiStore } from '@/store/ui'
import { NutrientsPreview } from '../NutrientsPreview'

/** Лише готові цифри, без ваги: «з’їв щось на 300 ккал». */
export function QuickStep({ meal, onDone }: { meal: MealType; onDone: () => void }) {
  const date = useUiStore((s) => s.selectedDate)
  const [f, setF] = useState({ name: '', kcal: '', protein: '', fat: '', carbs: '' })
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }))

  const draft: EntryDraft = { mode: 'quick', date, meal, ...f }
  let valid = true
  try {
    buildEntry(draft, 'preview-id', 1)
  } catch {
    valid = false
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    void addEntry(draft).catch(() => {})
    onDone()
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col gap-4">
      <Field label="Назва" hint="необов’язково" value={f.name} onChange={set('name')} placeholder={QUICK_ADD_NAME} />
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Калорії" suffix="ккал" value={f.kcal} onChange={set('kcal')} autoFocus />
        <NumberField label="Білки" suffix="г" value={f.protein} onChange={set('protein')} />
        <NumberField label="Жири" hint="необов’язково" suffix="г" value={f.fat} onChange={set('fat')} />
        <NumberField label="Вуглеводи" hint="необов’язково" suffix="г" value={f.carbs} onChange={set('carbs')} />
      </div>
      <NutrientsPreview
        value={{
          kcal: parseNum(f.kcal) ?? 0,
          protein: parseNum(f.protein) ?? 0,
          fat: parseNum(f.fat) ?? 0,
          carbs: parseNum(f.carbs) ?? 0,
        }}
      />
      <SheetFooter>
        <Button type="submit" disabled={!valid} className="flex-1">
          Додати
        </Button>
      </SheetFooter>
    </form>
  )
}
