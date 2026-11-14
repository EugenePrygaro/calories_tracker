import { ChevronLeft, ChevronRight, Flame, Plus } from 'lucide-react'
import { ProgressBar } from '@/components/ProgressBar'
import { db } from '@/db/db'
import { useDayTotals, useGoals } from '@/db/hooks'
import { formatDateKey } from '@/lib/date'
import { useUiStore } from '@/store/ui'

const MACROS = [
  { key: 'protein', label: 'Білки', bar: 'bg-protein' },
  { key: 'fat', label: 'Жири', bar: 'bg-fat' },
  { key: 'carbs', label: 'Вуглеводи', bar: 'bg-carbs' },
] as const

export default function App() {
  const date = useUiStore((s) => s.selectedDate)
  const shiftDate = useUiStore((s) => s.shiftDate)
  const goals = useGoals()
  const totals = useDayTotals(date)

  // Тимчасова кнопка, щоб перевірити ланцюжок Dexie → useLiveQuery → UI.
  const addTestEntry = () =>
    db.entries.add({
      date,
      meal: 'snack',
      foodId: null,
      name: 'Тестовий запис',
      grams: 100,
      kcal: 150,
      protein: 10,
      fat: 5,
      carbs: 15,
      createdAt: Date.now(),
    })

  return (
    <main className="mx-auto flex max-w-md flex-col gap-6 px-4 py-6">
      <header className="flex items-center justify-between">
        <button onClick={() => shiftDate(-1)} className="rounded-full p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800" aria-label="Попередній день">
          <ChevronLeft className="size-5" />
        </button>
        <h1 className="text-lg font-semibold">{formatDateKey(date)}</h1>
        <button onClick={() => shiftDate(1)} className="rounded-full p-2 hover:bg-zinc-200 dark:hover:bg-zinc-800" aria-label="Наступний день">
          <ChevronRight className="size-5" />
        </button>
      </header>

      <section className="flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-sm dark:bg-zinc-900">
        <div className="flex items-center gap-2">
          <Flame className="size-5 text-brand-500" />
          <span className="text-2xl font-bold tabular-nums">{Math.round(totals.kcal)}</span>
          <span className="text-zinc-500">/ {goals.kcal} ккал</span>
        </div>
        <ProgressBar value={totals.kcal} max={goals.kcal} className="h-3" />

        <div className="grid grid-cols-3 gap-3">
          {MACROS.map((m) => (
            <div key={m.key} className="flex flex-col gap-1">
              <span className="text-xs text-zinc-500">{m.label}</span>
              <span className="text-sm font-medium tabular-nums">
                {Math.round(totals[m.key])} / {goals[m.key]} г
              </span>
              <ProgressBar value={totals[m.key]} max={goals[m.key]} barClassName={m.bar} />
            </div>
          ))}
        </div>
      </section>

      <button
        onClick={addTestEntry}
        className="flex items-center justify-center gap-2 rounded-2xl bg-brand-500 py-3 font-medium text-white active:scale-[0.98]"
      >
        <Plus className="size-5" /> Додати тестовий запис
      </button>
    </main>
  )
}
