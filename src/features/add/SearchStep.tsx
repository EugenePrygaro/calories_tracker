import { ChevronRight, History, LoaderCircle, PencilLine, RotateCcw, Search, X } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { LIMITS, type FoodItem } from '@shared/model.js'
import { Button } from '@/components/ui/Button'
import { SheetFooter } from '@/components/ui/Modal'
import { filterFoods, useOffSearch } from '@/data/search'
import { loadDay, useDataStore, useDay, useFoods } from '@/data/store'
import { addDays } from '@/lib/date'
import { cn } from '@/lib/cn'
import { useUiStore } from '@/store/ui'
import { FoodRow } from './FoodRow'

interface SearchStepProps {
  query: string
  onQuery: (q: string) => void
  onPick: (item: FoodItem) => void
  onManual: () => void
  onYesterday: () => void
}

type Sort = 'recent' | 'frequent' | 'all'
const SORTS: { value: Sort; label: string }[] = [
  { value: 'recent', label: 'Нещодавні' },
  { value: 'frequent', label: 'Часті' },
  { value: 'all', label: 'Усі' },
]
/** Скільки страв показувати в «Нещодавні» / «Часті». */
const TOP = 15

export function SearchStep({ query, onQuery, onPick, onManual, onYesterday }: SearchStepProps) {
  const foods = useFoods()
  const foodsLoaded = useDataStore((s) => s.foodsLoaded)
  const usage = useDataStore((s) => s.foodUsage)
  const [sort, setSort] = useState<Sort>('recent')
  const savedIds = new Set(foods.map((f) => f.id))
  const used = foods.filter((f) => usage[f.id])
  // з пошуковим запитом — шукаємо серед усіх; без запиту — нещодавні / часті / усі
  const mine = query.trim()
    ? filterFoods(foods, query).slice(0, 30)
    : sort === 'recent'
      ? [...used].sort((a, b) => (usage[b.id]?.last ?? 0) - (usage[a.id]?.last ?? 0)).slice(0, TOP)
      : sort === 'frequent'
        ? [...used].sort((a, b) => (usage[b.id]?.n ?? 0) - (usage[a.id]?.n ?? 0)).slice(0, TOP)
        : foods
  const off = useOffSearch(query)
  const searching = query.trim().length >= LIMITS.searchQuery.min
  const yesterday = addDays(useUiStore((s) => s.selectedDate), -1)
  const yesterdayDay = useDay(yesterday)
  const yesterdayCount = yesterdayDay.entries.length
  // підтягуємо вчорашній день заздалегідь — щоб показати, скільки там страв
  useEffect(() => {
    if (!yesterdayDay.loaded) void loadDay(yesterday)
  }, [yesterdayDay.loaded, yesterday])

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

      {/* Швидкий шлях: повторити вчорашнє (ховаємо, коли щось шукають) */}
      {!query && (
        <button
          type="button"
          onClick={onYesterday}
          className="mb-3 flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/10 px-3 py-2.5 text-left transition-colors active:bg-primary/20"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary">
            <History className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold">Скопіювати з учора</span>
            <span className="block text-xs text-muted">
              {yesterdayCount > 0 ? `Учора записано страв: ${yesterdayCount}` : 'Швидко повторити вчорашній раціон'}
            </span>
          </span>
          <ChevronRight className="size-4 shrink-0 text-primary" />
        </button>
      )}

      <Section title="Мої страви" count={foodsLoaded && query.trim() ? mine.length : undefined}>
        {!query.trim() && (
          <div role="radiogroup" aria-label="Порядок моїх страв" className="flex gap-1.5 px-1 pb-2">
            {SORTS.map((s) => (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={sort === s.value}
                onClick={() => setSort(s.value)}
                className={cn(
                  'h-8 rounded-full px-3 text-xs font-bold ring-1 ring-inset transition-colors',
                  sort === s.value ? 'bg-primary/15 text-primary ring-primary/40' : 'bg-white/[0.04] text-muted ring-white/[0.06]',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        {mine.length > 0 ? (
          <ul>
            {mine.map((f) => (
              <FoodRow key={f.id} item={f} onPick={onPick} />
            ))}
          </ul>
        ) : (
          <Hint>
            {!foodsLoaded
              ? 'Завантаження…'
              : query.trim()
                ? 'Нічого не знайдено'
                : 'Тут з’являться страви, які ви додаєте найчастіше'}
          </Hint>
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
        <Button variant="ghost" onClick={onManual} className="flex-1 px-3 text-sm whitespace-nowrap">
          <PencilLine className="size-4" /> Ввести вручну
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
