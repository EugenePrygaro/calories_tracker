import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, Plus, Search, X } from 'lucide-react'
import { useState } from 'react'
import { PORTION_LABELS, type Food, type FoodItem } from '@shared/model.js'
import { Button } from '@/components/ui/Button'
import { SheetFooter } from '@/components/ui/Modal'
import { filterFoods } from '@/data/search'
import { useDataStore, useFoods } from '@/data/store'
import { grams, kcal } from '@/lib/format'
import { FoodEditor } from './FoodEditor'

/** Що редагуємо: збережену страву, нову (null) або нічого (список). */
type Editing = { food: FoodItem | null } | null

const collator = new Intl.Collator('uk')

const slide = {
  enter: (dir: number) => ({ x: dir * 28, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir * -28, opacity: 0 }),
}

/** «Мої страви»: список із пошуком → редагування, нова страва, видалення. */
export function FoodsSheet({ foodId }: { foodId?: string | undefined }) {
  const foods = useFoods()
  const loaded = useDataStore((s) => s.foodsLoaded)
  const [query, setQuery] = useState('')
  const [editing, setEditingState] = useState<Editing>(() => {
    const food = foodId ? foods.find((f) => f.id === foodId) : undefined
    return food ? { food } : null
  })
  const [dir, setDir] = useState(1)
  const setEditing = (next: Editing) => {
    setDir(next ? 1 : -1)
    setEditingState(next)
  }

  const list = query.trim() ? filterFoods(foods, query) : [...foods].sort((a, b) => collator.compare(a.name, b.name))

  return (
    <div className="flex flex-1 flex-col gap-3">
      <AnimatePresence initial={false}>
        {editing && (
          <motion.button
            type="button"
            onClick={() => setEditing(null)}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 40 }}
            exit={{ opacity: 0, height: 0 }}
            className="-my-1 flex items-center gap-1 self-start overflow-hidden pr-3 text-sm font-medium text-primary"
          >
            <ChevronLeft className="size-4" /> До списку
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait" initial={false} custom={dir}>
        <motion.div
          key={editing ? (editing.food?.id ?? 'new') : 'list'}
          custom={dir}
          variants={slide}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="flex flex-1 flex-col"
        >
          {editing ? (
            <FoodEditor food={editing.food} onSaved={() => setEditing(null)} onDeleted={() => setEditing(null)} />
          ) : (
            <div className="flex flex-1 flex-col">
              <div className="sticky top-0 z-10 -mx-5 bg-card px-5 pb-3">
                <label className="flex h-12 items-center gap-2 rounded-xl border border-line bg-elevated px-3 focus-within:border-primary">
                  <Search className="size-5 shrink-0 text-muted" />
                  <input
                    type="search"
                    enterKeyHint="search"
                    autoComplete="off"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={`Пошук серед ${foods.length} страв`}
                    className="w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted/60 [&::-webkit-search-cancel-button]:hidden"
                  />
                  {query && (
                    <button type="button" aria-label="Очистити" onClick={() => setQuery('')} className="-mr-1 p-1 text-muted">
                      <X className="size-5" />
                    </button>
                  )}
                </label>
              </div>

              {list.length > 0 ? (
                <ul>
                  {list.map((f) => (
                    <FoodListRow key={f.id} food={f} onPick={() => setEditing({ food: f })} />
                  ))}
                </ul>
              ) : (
                <p className="px-2 py-6 text-center text-sm text-muted">
                  {!loaded
                    ? 'Завантаження…'
                    : query.trim()
                      ? 'Нічого не знайдено'
                      : 'Тут будуть страви, які ви зберегли при додаванні їжі'}
                </p>
              )}

              <SheetFooter>
                <Button variant="ghost" onClick={() => setEditing({ food: null })} className="flex-1">
                  <Plus className="size-5" /> Нова страва
                </Button>
              </SheetFooter>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function FoodListRow({ food, onPick }: { food: Food; onPick: () => void }) {
  const p = food.per100
  const portions = food.portions ?? []
  return (
    <li>
      <button
        type="button"
        onClick={onPick}
        className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors active:bg-elevated"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-medium">{food.name}</span>
          <span className="truncate text-xs text-muted">
            <b className="text-fg">{kcal(p.kcal)}</b> ккал · Б {grams(p.protein)} · Ж {grams(p.fat)} · В {grams(p.carbs)}
            {food.brand && ` · ${food.brand}`}
          </span>
          {portions.length > 0 && (
            <span className="truncate text-xs text-primary">
              {portions.map((x) => `${PORTION_LABELS[x.unit].icon} ${grams(x.grams)} г`).join('  ')}
            </span>
          )}
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted" />
      </button>
    </li>
  )
}
