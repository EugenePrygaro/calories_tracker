import { LoaderCircle, PencilLine, RotateCcw, Search, X, Zap } from 'lucide-react'
import type { ReactNode } from 'react'
import { LIMITS, type FoodItem } from '@shared/model.js'
import { Button } from '@/components/ui/Button'
import { SheetFooter } from '@/components/ui/Modal'
import { filterFoods, useOffSearch } from '@/data/search'
import { useDataStore, useFoods } from '@/data/store'
import { FoodRow } from './FoodRow'

interface SearchStepProps {
  query: string
  onQuery: (q: string) => void
  onPick: (item: FoodItem) => void
  onManual: () => void
  onQuick: () => void
}

export function SearchStep({ query, onQuery, onPick, onManual, onQuick }: SearchStepProps) {
  const foods = useFoods()
  const foodsLoaded = useDataStore((s) => s.foodsLoaded)
  const savedIds = new Set(foods.map((f) => f.id))
  const mine = filterFoods(foods, query).slice(0, 30)
  const off = useOffSearch(query)
  const searching = query.trim().length >= LIMITS.searchQuery.min

  return (
    <div className="flex flex-1 flex-col">
      <div className="sticky top-0 z-10 -mx-5 bg-card px-5 pb-3">
        <label className="flex h-12 items-center gap-2 rounded-xl border border-line bg-elevated px-3 focus-within:border-primary">
          <Search className="size-5 shrink-0 text-muted" />
          <input
            type="search"
            enterKeyHint="search"
            autoComplete="off"
            autoFocus
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Пошук страви або продукту"
            className="w-full min-w-0 bg-transparent text-base outline-none placeholder:text-muted/60 [&::-webkit-search-cancel-button]:hidden"
          />
          {query && (
            <button type="button" aria-label="Очистити" onClick={() => onQuery('')} className="-mr-1 p-1 text-muted">
              <X className="size-5" />
            </button>
          )}
        </label>
      </div>

      <Section title="Мої страви" count={foodsLoaded ? mine.length : undefined}>
        {mine.length > 0 ? (
          <ul>
            {mine.map((f) => (
              <FoodRow key={f.id} item={f} onPick={onPick} />
            ))}
          </ul>
        ) : (
          <Hint>{!foodsLoaded ? 'Завантаження…' : 'Нічого не знайдено'}</Hint>
        )}
      </Section>

      {searching && (
        <Section title="Публічний пошук" count={off.status === 'done' ? off.results.length : undefined}>
          {off.status === 'loading' && (
            <Hint>
              <LoaderCircle className="size-4 animate-spin" /> Шукаємо…
            </Hint>
          )}
          {off.status === 'error' && (
            <button type="button" onClick={off.retry} className="flex items-center gap-2 px-2 py-3 text-sm text-warning">
              <RotateCcw className="size-4" /> Помилка пошуку · Повторити
            </button>
          )}
          {off.status === 'done' &&
            (off.results.length > 0 ? (
              <ul>
                {off.results.map((item) => (
                  <FoodRow key={item.id} item={item} saved={savedIds.has(item.id)} onPick={onPick} />
                ))}
              </ul>
            ) : (
              <Hint>Нічого не знайдено</Hint>
            ))}
        </Section>
      )}

      <SheetFooter>
        <Button variant="ghost" onClick={onManual} className="flex-1 px-3 whitespace-nowrap">
          <PencilLine className="size-4" /> Вручну
        </Button>
        <Button variant="ghost" onClick={onQuick} className="flex-1 px-3 whitespace-nowrap">
          <Zap className="size-4" /> Швидкий запис
        </Button>
      </SheetFooter>
    </div>
  )
}

function Section({ title, count, children }: { title: string; count?: number | undefined; children: ReactNode }) {
  return (
    <section className="flex flex-col pb-2">
      <h3 className="flex items-baseline gap-2 px-2 pt-1 pb-1 text-xs font-bold tracking-wider text-muted uppercase">
        {title}
        {count !== undefined && <span className="font-normal opacity-70">{count}</span>}
      </h3>
      {children}
    </section>
  )
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="flex items-center gap-2 px-2 py-3 text-sm text-muted">{children}</p>
}
