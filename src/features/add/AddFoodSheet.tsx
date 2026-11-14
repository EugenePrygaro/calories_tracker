import { ChevronLeft } from 'lucide-react'
import { useState } from 'react'
import { MEAL_LABELS, MEAL_TYPES, type FoodItem, type MealType } from '@shared/model.js'
import { Segmented } from '@/components/ui/Segmented'
import { ManualStep } from './ManualStep'
import { PortionStep } from './PortionStep'
import { QuickStep } from './QuickStep'
import { SearchStep } from './SearchStep'

type Step =
  | { type: 'search' }
  | { type: 'portion'; item: FoodItem }
  | { type: 'manual' }
  | { type: 'quick' }

const MEAL_OPTIONS = MEAL_TYPES.map((m) => ({ value: m, label: MEAL_LABELS[m] }))

/**
 * Додавання їжі: спершу пошук (мої страви + Open Food Facts),
 * далі порція. Якщо нічого не знайшли — вручну або швидкий запис.
 */
export function AddFoodSheet({ initialMeal, onDone }: { initialMeal: MealType; onDone: () => void }) {
  const [meal, setMeal] = useState<MealType>(initialMeal)
  const [step, setStep] = useState<Step>({ type: 'search' })
  const [query, setQuery] = useState('') // лишається при поверненні «Назад»

  return (
    <div className="flex flex-1 flex-col gap-3">
      <Segmented label="Прийом їжі" value={meal} options={MEAL_OPTIONS} onChange={setMeal} />

      {step.type !== 'search' && (
        <button
          type="button"
          onClick={() => setStep({ type: 'search' })}
          className="-my-1 flex h-10 items-center gap-1 self-start pr-3 text-sm font-medium text-primary"
        >
          <ChevronLeft className="size-4" /> До пошуку
        </button>
      )}

      {step.type === 'search' && (
        <SearchStep
          query={query}
          onQuery={setQuery}
          onPick={(item) => setStep({ type: 'portion', item })}
          onManual={() => setStep({ type: 'manual' })}
          onQuick={() => setStep({ type: 'quick' })}
        />
      )}
      {step.type === 'portion' && <PortionStep item={step.item} meal={meal} onDone={onDone} />}
      {step.type === 'manual' && <ManualStep meal={meal} initialName={query.trim()} onDone={onDone} />}
      {step.type === 'quick' && <QuickStep meal={meal} onDone={onDone} />}
    </div>
  )
}
