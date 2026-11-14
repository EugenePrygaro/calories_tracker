import type { BodyField, BodyRecord } from '@shared/model.js'

export interface Measure {
  value: number
  date: string
  /** Зміна відносно попереднього заміру цього ж параметра (null — попереднього немає). */
  delta: number | null
}

/** Останнє значення параметра і зміна відносно попереднього заміру. Записи — за датою від старих. */
export function latestMeasure(records: readonly BodyRecord[], field: BodyField): Measure | null {
  let last: BodyRecord | null = null
  let prev: BodyRecord | null = null
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i]
    if (!r || r[field] === null) continue
    if (!last) last = r
    else {
      prev = r
      break
    }
  }
  const value = last?.[field]
  if (!last || value === null || value === undefined) return null
  const prevValue = prev?.[field]
  return {
    value,
    date: last.date,
    delta: prevValue === null || prevValue === undefined ? null : Math.round((value - prevValue) * 10) / 10,
  }
}

/** Точки ваги для графіка (лише дні, коли важились). */
export function weightSeries(records: readonly BodyRecord[]): { date: string; value: number }[] {
  return records.flatMap((r) => (r.weight === null ? [] : [{ date: r.date, value: r.weight }]))
}

/** Перша зафіксована вага — точка відліку прогресу до цілі. */
export function startWeight(records: readonly BodyRecord[]): number | null {
  return records.find((r) => r.weight !== null)?.weight ?? null
}

/**
 * Прогрес до цільової ваги, 0…1: від першого заміру до цілі.
 * Працює в обидва боки — і для схуднення, і для набору.
 */
export function targetProgress(start: number, current: number, target: number): number {
  if (start === target) return current === target ? 1 : 0
  return Math.min(Math.max((start - current) / (start - target), 0), 1)
}
