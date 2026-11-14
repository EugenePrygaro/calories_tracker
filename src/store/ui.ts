import { create } from 'zustand'
import type { MealType } from '@/db/types'
import { addDays, toDateKey, type DateKey } from '@/lib/date'

/**
 * Лише тимчасовий стан інтерфейсу. Усе, що має пережити перезавантаження
 * сторінки (продукти, записи, цілі), живе в Dexie.
 */
export type Modal =
  | { type: 'addFood'; meal: MealType }
  | { type: 'editEntry'; entryId: number }
  | { type: 'goals' }

interface UiState {
  selectedDate: DateKey
  modal: Modal | null

  setDate: (date: DateKey) => void
  shiftDate: (days: number) => void
  goToday: () => void
  openModal: (modal: Modal) => void
  closeModal: () => void
}

export const useUiStore = create<UiState>()((set) => ({
  selectedDate: toDateKey(),
  modal: null,

  setDate: (selectedDate) => set({ selectedDate }),
  shiftDate: (days) => set((s) => ({ selectedDate: addDays(s.selectedDate, days) })),
  goToday: () => set({ selectedDate: toDateKey() }),
  openModal: (modal) => set({ modal }),
  closeModal: () => set({ modal: null }),
}))
