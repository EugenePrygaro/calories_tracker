import { useMemo } from 'react'
import { analyze, type Analysis, type Forecast } from '@shared/insights.js'
import { useBody, useTargetWeight } from '@/data/store'
import { fromDateKey, toDateKey } from '@/lib/date'
import { useDaySummaries } from '@/lib/stats'

/**
 * Аналіз схуднення з даних, які вже є в браузері (підсумки днів, заміри, ціль) —
 * ті самі розрахунки, що й на сервері для Gemini (shared/insights.js).
 */
export function useInsights(): Analysis {
  const summaries = useDaySummaries()
  const body = useBody()
  const targetWeight = useTargetWeight()
  const today = toDateKey()
  return useMemo(
    () => analyze({ summaries: [...summaries.values()], body, targetWeight, today }),
    [summaries, body, targetWeight, today],
  )
}

/** «березень» (цього року) або «березень 2027». */
export function monthLabel(date: string, today = toDateKey()): string {
  const d = fromDateKey(date)
  const sameYear = date.slice(0, 4) === today.slice(0, 4)
  return d.toLocaleDateString('uk-UA', sameYear ? { month: 'long' } : { month: 'long', year: 'numeric' }).replace(' р.', '')
}

/** Короткий підсумок прогнозу для плашки ваги. null — нема чого сказати. */
export function forecastLabel(f: Forecast | null): string | null {
  if (!f) return null
  switch (f.kind) {
    case 'eta':
      return `ціль ≈ ${monthLabel(f.date)}`
    case 'reached':
      return 'ціль досягнуто'
    case 'stalled':
      return 'вага стоїть'
    case 'away':
      return 'вага йде не до цілі'
    case 'far':
      return 'до цілі понад 2 роки'
  }
}
