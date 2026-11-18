import { motion } from 'framer-motion'
import { BookOpen, ChevronRight } from 'lucide-react'
import { useFoods } from '@/data/store'
import { useUiStore } from '@/store/ui'

/** Скільки назв показати на плашці. */
const PREVIEW = 4

/** Плашка «Мої страви» на головній: кількість і кілька останніх. Тап — шторка зі списком. */
export function FoodsCard() {
  const foods = useFoods()
  const openModal = useUiStore((s) => s.openModal)
  const withPortions = foods.filter((f) => (f.portions ?? []).length > 0).length

  return (
    <motion.div data-main-card whileTap={{ scale: 0.985 }} className="card relative flex flex-col gap-3 rounded-3xl p-5">
      <button
        type="button"
        onClick={() => openModal({ type: 'foods' })}
        aria-label={`Мої страви: ${foods.length}. Редагувати, порції, видалення`}
        className="absolute inset-0 rounded-3xl"
      />
      <header className="pointer-events-none flex items-center gap-2">
        <BookOpen className="size-5 text-primary" strokeWidth={1.8} />
        <h2 className="flex-1 text-base font-bold">Мої страви</h2>
        <span className="text-[11px] text-muted">
          {foods.length}
          {withPortions > 0 && ` · з порціями ${withPortions}`}
        </span>
        <ChevronRight className="size-4 text-muted" />
      </header>
      <p className="pointer-events-none truncate text-sm text-muted">
        {foods.length > 0
          ? foods
              .slice(0, PREVIEW)
              .map((f) => f.name)
              .join(' · ')
          : 'Зберігайте страви при додаванні їжі — тут їх можна змінити й задати порції'}
      </p>
    </motion.div>
  )
}
