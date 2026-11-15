import { Trash2 } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { LIMITS, type Entry } from '@shared/model.js'
import { scale } from '@shared/nutrition.js'
import { Button } from '@/components/ui/Button'
import { Field, NumberField } from '@/components/ui/Field'
import { GramsField } from '@/components/ui/GramsField'
import { SheetFooter } from '@/components/ui/Modal'
import { removeEntry, updateEntry, useEntry, type EntryPatch } from '@/data/store'
import { grams, kcal, parseNum } from '@/lib/format'
import { NutrientsPreview } from './NutrientsPreview'

interface EditEntryFormProps {
  date: string
  entryId: string
  onDone: () => void
}

export function EditEntryForm({ date, entryId, onDone }: EditEntryFormProps) {
  const live = useEntry(date, entryId)
  // Тримаємо останню версію: після видалення шторка закривається з анімацією і не «схлопується»
  const [entry, setEntry] = useState(live)
  if (live && live !== entry) setEntry(live)

  // Запис видалили — закриваємо модалку.
  useEffect(() => {
    if (!live) onDone()
  }, [live, onDone])

  if (!entry) return null
  return entry.mode === 'weight' && entry.per100 ? (
    <WeightEdit entry={entry} per100={entry.per100} onDone={onDone} />
  ) : (
    <QuickEdit entry={entry} onDone={onDone} />
  )
}

const inRange = (n: number | null, min: number, max: number): n is number =>
  n !== null && n >= min && n <= max

function commit(entry: Entry, patch: EntryPatch, onDone: () => void) {
  void updateEntry(entry, patch).catch(() => {}) // помилку покаже тост
  onDone()
}

function remove(entry: Entry, onDone: () => void) {
  removeEntry(entry) // тост «Видалено · Повернути»
  onDone()
}

function WeightEdit({ entry, per100, onDone }: { entry: Entry; per100: Entry['per100'] & {}; onDone: () => void }) {
  const [value, setValue] = useState(String(entry.grams ?? ''))
  const g = parseNum(value)
  const valid = inRange(g, LIMITS.grams.min, LIMITS.grams.max)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (valid) commit(entry, { grams: g }, onDone)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <p className="font-medium">{entry.name}</p>
        <p className="text-xs text-muted">
          На 100 г: {kcal(per100.kcal)} ккал · Б {grams(per100.protein)} · Ж {grams(per100.fat)} · В{' '}
          {grams(per100.carbs)}
        </p>
      </div>
      <GramsField label="Вага порції" value={value} onChange={setValue} autoFocus />
      <NutrientsPreview value={scale(per100, valid ? g : 0)} />
      <Actions valid={valid} onDelete={() => remove(entry, onDone)} />
    </form>
  )
}

function QuickEdit({ entry, onDone }: { entry: Entry; onDone: () => void }) {
  const [f, setF] = useState({
    name: entry.name,
    kcal: String(entry.kcal),
    protein: String(entry.protein),
    fat: String(entry.fat),
    carbs: String(entry.carbs),
  })
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }))

  const { quick } = LIMITS
  const values = {
    kcal: parseNum(f.kcal),
    protein: parseNum(f.protein),
    fat: parseNum(f.fat) ?? 0,
    carbs: parseNum(f.carbs) ?? 0,
  }
  const valid =
    inRange(values.kcal, 0, quick.kcal) &&
    inRange(values.protein, 0, quick.macro) &&
    inRange(values.fat, 0, quick.macro) &&
    inRange(values.carbs, 0, quick.macro)

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid || values.kcal === null || values.protein === null) return
    commit(
      entry,
      { name: f.name, kcal: values.kcal, protein: values.protein, fat: values.fat, carbs: values.carbs },
      onDone,
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Назва" value={f.name} onChange={set('name')} />
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Калорії" suffix="ккал" value={f.kcal} onChange={set('kcal')} autoFocus />
        <NumberField label="Білки" suffix="г" value={f.protein} onChange={set('protein')} />
        <NumberField label="Жири" suffix="г" value={f.fat} onChange={set('fat')} />
        <NumberField label="Вуглеводи" suffix="г" value={f.carbs} onChange={set('carbs')} />
      </div>
      <Actions valid={valid} onDelete={() => remove(entry, onDone)} />
    </form>
  )
}

function Actions({ valid, onDelete }: { valid: boolean; onDelete: () => void }) {
  return (
    <SheetFooter>
      <Button variant="danger" onClick={onDelete} aria-label="Видалити запис">
        <Trash2 className="size-5" />
      </Button>
      <Button type="submit" disabled={!valid} className="flex-1">
        Зберегти
      </Button>
    </SheetFooter>
  )
}
