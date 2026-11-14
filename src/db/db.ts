import Dexie, { type EntityTable } from 'dexie'
import type { DiaryEntry, Food, Goals, WeightEntry } from './types'

export const DEFAULT_GOALS: Goals = {
  id: 'current',
  kcal: 2000,
  protein: 120,
  fat: 70,
  carbs: 220,
  waterMl: 2000,
}

class CaloriesDB extends Dexie {
  foods!: EntityTable<Food, 'id'>
  entries!: EntityTable<DiaryEntry, 'id'>
  goals!: EntityTable<Goals, 'id'>
  weights!: EntityTable<WeightEntry, 'date'>

  constructor() {
    super('calories-tracker')

    // Схема описує лише індексовані поля. Будь-яка зміна індексів —
    // новий this.version(N + 1) з .upgrade(), стару версію не чіпаємо.
    this.version(1).stores({
      foods: '++id, name, isFavorite, updatedAt',
      entries: '++id, date, [date+meal], foodId',
      goals: 'id',
      weights: 'date',
    })

    this.on('populate', (tx) => {
      void tx.table('goals').add(DEFAULT_GOALS)
    })
  }
}

export const db = new CaloriesDB()

// Просимо браузер не видаляти IndexedDB при нестачі місця (особливо важливо для Safari).
if (typeof navigator !== 'undefined' && navigator.storage?.persist) {
  void navigator.storage.persisted().then((ok) => {
    if (!ok) void navigator.storage.persist()
  })
}
