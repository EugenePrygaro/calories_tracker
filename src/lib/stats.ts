import { useMemo } from 'react'
import { goalsForDate } from '@shared/goals.js'
import { deficitOf, summarize, type DaySummary } from '@shared/stats.js'
import { useDataStore, useGame } from '@/data/store'
import { addDays } from '@/lib/date'

/**
 * Підсумки днів: серверні + свіжіші дні, відкриті в цій сесії (щойно додані записи
 * видно в статистиці одразу, без повторного запиту). Ключ — дата YYYY-MM-DD.
 */
export function useDaySummaries(): Map<string, DaySummary> {
  const stats = useDataStore((s) => s.stats)
  const days = useDataStore((s) => s.days)
  const profile = useDataStore((s) => s.profile)
  const cheatDays = useGame()?.cheatDays
  return useMemo(() => {
    const map = new Map((stats ?? []).map((d) => [d.date, d]))
    for (const [date, day] of Object.entries(days)) {
      if (!day.loaded || day.error) continue
      if (day.entries.length === 0) map.delete(date)
      // цілі дня — зі знімка сервера, якщо він є (історія не переписується новими нормами)
      else map.set(date, summarize(date, day.entries, map.get(date)?.goals ?? goalsForDate(profile, date)))
    }
    // дні з читмілом — успішні (див. accuracy)
    for (const date of cheatDays ?? []) {
      const s = map.get(date)
      if (s) map.set(date, { ...s, cheat: true })
    }
    return map
  }, [stats, days, profile, cheatDays])
}

/** Дати від from до to включно. */
export function dateRange(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

export interface PeriodTotals {
  /** днів із записами */
  logged: number
  /** днів у періоді */
  days: number
  avgKcal: number
  /** сумарний дефіцит, ккал (від'ємний — профіцит) */
  deficit: number
}

/** Підсумки за період по днях із записами. Сьогодні не враховується — день ще не закінчився. */
export function periodTotals(map: Map<string, DaySummary>, dates: readonly string[], today: string): PeriodTotals {
  const done = dates.filter((d) => d < today)
  const logged = done.map((d) => map.get(d)).filter((s): s is DaySummary => !!s)
  const kcal = logged.reduce((a, s) => a + s.kcal, 0)
  return {
    logged: logged.length,
    days: done.length,
    avgKcal: logged.length ? kcal / logged.length : 0,
    deficit: logged.reduce((a, s) => a + deficitOf(s), 0),
  }
}

/** Колір клітинки теплової карти за рівнем 0…4 (як на GitHub — насиченість акценту). */
export const HEAT_COLORS = [
  'rgb(255 255 255 / 0.05)',
  'color-mix(in oklab, var(--accent-primary) 22%, transparent)',
  'color-mix(in oklab, var(--accent-primary) 45%, transparent)',
  'color-mix(in oklab, var(--accent-primary) 70%, transparent)',
  'var(--accent-primary)',
] as const
