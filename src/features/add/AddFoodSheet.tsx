import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft } from 'lucide-react'
import { useState } from 'react'
import { MEAL_LABELS, MEAL_TYPES, type FoodItem, type MealType } from '@shared/model.js'
import { Segmented } from '@/components/ui/Segmented'
import { haptic } from '@/lib/haptics'
import { ManualStep } from './ManualStep'
import { PortionStep } from './PortionStep'
import { QuickStep } from './QuickStep'
import { SearchStep } from './SearchStep'
import { YesterdayStep } from './YesterdayStep'

type Step =
  | { type: 'search' }
  | { type: 'portion'; item: FoodItem }
  | { type: 'manual' }
  | { type: 'quick' }
  | { type: 'yesterday' }

const MEAL_OPTIONS = MEAL_TYPES.map((m) => ({ value: m, label: MEAL_LABELS[m] }))

/** Крок виїжджає справа, коли йдемо вперед, і зліва — коли повертаємось до пошуку. */
const slide = {
  enter: (dir: number) => ({ x: dir * 28, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir * -28, opacity: 0 }),
}

/**
 * Додавання їжі: спершу пошук (мої страви + Open Food Facts),
 * далі порція. Якщо нічого не знайшли — вручну або швидкий запис.
 * «З учора» — швидко скопіювати страви з учорашнього раціону.
 */
export function AddFoodSheet({ initialMeal, onDone }: { initialMeal: MealType; onDone: () => void }) {
  const [meal, setMeal] = useState<MealType>(initialMeal)
  const [step, setStepState] = useState<Step>({ type: 'search' })
  const [dir, setDir] = useState(1)
  const [query, setQuery] = useState('') // лишається при поверненні «Назад»

  const go = (next: Step) => {
    setDir(next.type === 'search' ? -1 : 1)
    setStepState(next)
  }
  const pickMeal = (m: MealType) => {
    haptic()
    setMeal(m)
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      <Segmented label="Прийом їжі" value={meal} options={MEAL_OPTIONS} onChange={pickMeal} />

      <AnimatePresence initial={false}>
        {step.type !== 'search' && (
          <motion.button
            type="button"
            onClick={() => go({ type: 'search' })}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 40 }}
            exit={{ opacity: 0, height: 0 }}
            className="-my-1 flex items-center gap-1 self-start overflow-hidden pr-3 text-sm font-medium text-primary"
          >
            <ChevronLeft className="size-4" /> До пошуку
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait" initial={false} custom={dir}>
        <motion.div
          key={step.type}
          custom={dir}
          variants={slide}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="flex flex-1 flex-col"
        >
          {step.type === 'search' && (
            <SearchStep
              query={query}
              onQuery={setQuery}
              onPick={(item) => go({ type: 'portion', item })}
              onManual={() => go({ type: 'manual' })}
              onQuick={() => go({ type: 'quick' })}
              onYesterday={() => go({ type: 'yesterday' })}
            />
          )}
          {step.type === 'portion' && <PortionStep item={step.item} meal={meal} onDone={onDone} />}
          {step.type === 'manual' && <ManualStep meal={meal} initialName={query.trim()} onDone={onDone} />}
          {step.type === 'quick' && <QuickStep meal={meal} onDone={onDone} />}
          {step.type === 'yesterday' && <YesterdayStep meal={meal} onDone={onDone} />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
