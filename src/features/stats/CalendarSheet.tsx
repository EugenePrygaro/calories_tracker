import { CalendarCheck } from 'lucide-react'
import { toDateKey } from '@/lib/date'
import { HEAT_COLORS, useDaySummaries } from '@/lib/stats'
import { useUiStore } from '@/store/ui'
import { MonthView } from './Heatmap'

/**
 * Календар за тапом на дату: місяць, розфарбований як теплова карта дисципліни.
 * Тап по дню — перейти на нього в щоденнику.
 */
export function CalendarSheet({ onDone }: { onDone: () => void }) {
  const map = useDaySummaries()
  const date = useUiStore((s) => s.selectedDate)
  const selectDate = useUiStore((s) => s.selectDate)
  const today = toDateKey()

  const pick = (d: string) => {
    selectDate(d)
    onDone()
  }

  return (
    <div className="flex flex-col gap-4 pb-4">
      <MonthView map={map} today={today} selected={date} initial={date} onSelect={pick} />
      <div className="flex items-center justify-between text-[11px] text-muted">
        <span>Колір — точність КБЖВ</span>
        <span className="flex items-center gap-1">
          {HEAT_COLORS.map((c) => (
            <span key={c} className="size-3 rounded-[3px]" style={{ background: c }} />
          ))}
        </span>
      </div>
      {date !== today && (
        <button
          type="button"
          onClick={() => pick(today)}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-primary/15 text-sm font-bold text-primary active:bg-primary/25"
        >
          <CalendarCheck className="size-4" /> На сьогодні
        </button>
      )}
    </div>
  )
}
