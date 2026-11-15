import { useState, type FormEvent, type ReactNode } from 'react'
import type { Goals } from '@shared/model.js'
import { DEFAULT_WEEKEND_BOOST } from '@shared/goals.js'
import { kcalFromMacros } from '@shared/nutrition.js'
import { sanitizeProfile } from '@shared/validate.js'
import { Button } from '@/components/ui/Button'
import { NumberField } from '@/components/ui/Field'
import { SheetFooter } from '@/components/ui/Modal'
import { saveProfile, useDataStore, useGoals, useTargetWeight } from '@/data/store'
import { kcal, parseNum } from '@/lib/format'
import { ThemePicker } from './game/ThemePicker'

type GoalsInput = Record<keyof Goals, string>

/**
 * Профіль: денні норми та цільова вага.
 * Поки профіль не завантажено, форму не показуємо: інакше в ній стояли б цілі
 * за замовчуванням, і збереження перезаписало б справжні.
 */
export function GoalsForm({ onDone }: { onDone: () => void }) {
  const loaded = useDataStore((s) => s.profile !== null)
  if (!loaded) {
    return <p className="py-10 text-center text-sm text-muted">Завантажуємо профіль… Перевірте з’єднання.</p>
  }
  return <GoalsFormInner onDone={onDone} />
}

function GoalsFormInner({ onDone }: { onDone: () => void }) {
  const goals = useGoals()
  const target = useTargetWeight()
  const [f, setF] = useState<GoalsInput>({
    kcal: String(goals.kcal),
    protein: String(goals.protein),
    fat: String(goals.fat),
    carbs: String(goals.carbs),
  })
  const [targetWeight, setTargetWeight] = useState(target === null ? '' : String(target).replace('.', ','))
  const [weekendBoost, setWeekendBoost] = useState(String(useDataStore.getState().profile?.weekendBoost ?? DEFAULT_WEEKEND_BOOST))
  const set = (k: keyof GoalsInput) => (v: string) => setF((s) => ({ ...s, [k]: v }))

  let valid = true
  try {
    sanitizeProfile({ goals: f, targetWeight, weekendBoost, updatedAt: 1 })
  } catch {
    valid = false
  }
  const fromMacros = kcalFromMacros({
    protein: parseNum(f.protein) ?? 0,
    fat: parseNum(f.fat) ?? 0,
    carbs: parseNum(f.carbs) ?? 0,
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    void saveProfile({ goals: f, targetWeight, weekendBoost }).catch(() => {}) // помилку покаже тост, профіль відкотиться
    onDone()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
      {/* з'являється, щойно куплено хоч одну тему */}
      <ThemePicker />

      <Group title="Харчування на день">
        <NumberField label="Калорії" suffix="ккал" value={f.kcal} onChange={set('kcal')} inputMode="numeric" />
        <div className="grid grid-cols-3 gap-3">
          <NumberField label="Білки" suffix="г" value={f.protein} onChange={set('protein')} inputMode="numeric" />
          <NumberField label="Жири" suffix="г" value={f.fat} onChange={set('fat')} inputMode="numeric" />
          <NumberField label="Вуглеводи" suffix="г" value={f.carbs} onChange={set('carbs')} inputMode="numeric" />
        </div>
        <p className="text-xs text-muted">
          За БЖВ виходить ≈ <b className="text-fg">{kcal(fromMacros)} ккал</b>
        </p>
        <NumberField
          label="На вихідних калорій більше на"
          hint={weekendPreview(f.kcal, weekendBoost)}
          suffix="%"
          inputMode="numeric"
          value={weekendBoost}
          onChange={setWeekendBoost}
          placeholder="0"
        />
      </Group>

      <Group title="Вага">
        <NumberField
          label="Цільова вага"
          hint="необов’язково"
          suffix="кг"
          value={targetWeight}
          onChange={setTargetWeight}
          placeholder="—"
        />
      </Group>

      <SheetFooter>
        <Button type="submit" disabled={!valid} className="flex-1">
          Зберегти
        </Button>
      </SheetFooter>
    </form>
  )
}

/** Підказка біля поля: «сб–нд: 2 300 ккал» (або «вимкнено»). */
function weekendPreview(kcalStr: string, boostStr: string): string {
  const base = parseNum(kcalStr) ?? 0
  const boost = parseNum(boostStr) ?? 0
  if (!(boost > 0) || !(base > 0)) return 'вимкнено'
  return `сб–нд: ${kcal(Math.round((base * (1 + boost / 100)) / 10) * 10)} ккал`
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-bold tracking-wider text-muted uppercase">{title}</h3>
      {children}
    </section>
  )
}
