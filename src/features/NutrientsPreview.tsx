import type { Nutrients } from '@shared/model.js'
import { grams, kcal } from '@/lib/format'

/** Підсумок порції перед збереженням. */
export function NutrientsPreview({ value, label = 'Разом' }: { value: Nutrients; label?: string }) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3">
      <div className="flex flex-col">
        <span className="text-xs text-muted">{label}</span>
        <span className="text-xl font-bold">
          {kcal(value.kcal)} <span className="text-sm font-normal text-muted">ккал</span>
        </span>
      </div>
      <div className="flex gap-3 text-xs">
        <span className="text-protein">Б {grams(value.protein)}</span>
        <span className="text-fat">Ж {grams(value.fat)}</span>
        <span className="text-carbs">В {grams(value.carbs)}</span>
      </div>
    </div>
  )
}
