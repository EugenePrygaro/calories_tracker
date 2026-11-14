import { useLiveQuery } from 'dexie-react-hooks'
import type { DateKey } from '@/lib/date'
import { DEFAULT_GOALS, db } from './db'
import type { DiaryEntry, Goals, Nutrients } from './types'

export function useGoals(): Goals {
  return useLiveQuery(() => db.goals.get('current'), []) ?? DEFAULT_GOALS
}

export function useEntries(date: DateKey): DiaryEntry[] | undefined {
  return useLiveQuery(() => db.entries.where('date').equals(date).sortBy('createdAt'), [date])
}

export function sumNutrients(items: readonly Nutrients[]): Nutrients {
  return items.reduce<Nutrients>(
    (acc, i) => ({
      kcal: acc.kcal + i.kcal,
      protein: acc.protein + i.protein,
      fat: acc.fat + i.fat,
      carbs: acc.carbs + i.carbs,
    }),
    { kcal: 0, protein: 0, fat: 0, carbs: 0 },
  )
}

export function useDayTotals(date: DateKey): Nutrients {
  const entries = useEntries(date)
  return sumNutrients(entries ?? [])
}
