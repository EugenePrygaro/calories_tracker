import type { DateKey } from '@/lib/date'

export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack'] as const
export type MealType = (typeof MEAL_TYPES)[number]

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Сніданок',
  lunch: 'Обід',
  dinner: 'Вечеря',
  snack: 'Перекус',
}

/** Харчова цінність на 100 г продукту. */
export interface Nutrients {
  kcal: number
  protein: number
  fat: number
  carbs: number
}

/** Продукт у власному довіднику користувача. */
export interface Food extends Nutrients {
  id?: number
  name: string
  /** Розмір типової порції в грамах (опційно, для швидкого додавання). */
  servingGrams?: number
  isFavorite: 0 | 1
  createdAt: number
  updatedAt: number
}

/**
 * Запис у щоденнику.
 * Нутрієнти копіюються з продукту на момент додавання (snapshot), щоб
 * редагування чи видалення продукту не переписувало історію.
 */
export interface DiaryEntry extends Nutrients {
  id?: number
  date: DateKey
  meal: MealType
  foodId: number | null
  name: string
  grams: number
  createdAt: number
}

/** Денні цілі. Зберігаються одним рядком з id = 'current'. */
export interface Goals extends Nutrients {
  id: 'current'
  waterMl: number
}

export interface WeightEntry {
  date: DateKey
  kg: number
}
