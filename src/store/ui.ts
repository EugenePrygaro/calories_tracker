import { create } from 'zustand'
import type { MealType } from '@shared/model.js'
import { addDays, toDateKey, type DateKey } from '@/lib/date'

/** Лише тимчасовий стан інтерфейсу. Дані з сервера — у src/data/store.ts. */
export type Modal =
  | { type: 'add'; meal: MealType }
  | { type: 'edit'; date: DateKey; entryId: string }
  | { type: 'goals' }
  | { type: 'body' }
  | { type: 'achievements' }
  | { type: 'shop' }
  | { type: 'stats' }
  | { type: 'calc' }

interface Toast {
  id: number
  message: string
  /** error — червоний (не вдалося), info — нейтральний (наприклад, «Видалено») */
  tone: 'error' | 'info'
  /** Кнопка дії в тості, напр. «Повернути» */
  action?: { label: string; run: () => void }
}

interface ToastOptions {
  tone?: Toast['tone']
  action?: Toast['action']
}

interface UiState {
  selectedDate: DateKey
  /** Куди перемкнули день: 1 — вперед, -1 — назад. Для напрямку анімації. */
  direction: 1 | -1
  modal: Modal | null
  toast: Toast | null

  shiftDate: (days: number) => void
  goToday: () => void
  openModal: (modal: Modal) => void
  closeModal: () => void
  showToast: (message: string, opts?: ToastOptions) => void
  hideToast: () => void
}

let toastId = 0

export const useUiStore = create<UiState>()((set) => ({
  selectedDate: toDateKey(),
  direction: 1,
  modal: null,
  toast: null,

  shiftDate: (days) =>
    set((s) => ({ selectedDate: addDays(s.selectedDate, days), direction: days < 0 ? -1 : 1 })),
  goToday: () =>
    set((s) => {
      const today = toDateKey()
      return { selectedDate: today, direction: s.selectedDate > today ? -1 : 1 }
    }),
  openModal: (modal) => set({ modal }),
  closeModal: () => set({ modal: null }),
  showToast: (message, opts = {}) =>
    set({ toast: { id: ++toastId, message, tone: opts.tone ?? 'error', ...(opts.action ? { action: opts.action } : {}) } }),
  hideToast: () => set({ toast: null }),
}))

/** Прийом їжі за часом доби — для кнопки «+» внизу екрана. */
export function mealByTime(date = new Date()): MealType {
  const h = date.getHours()
  if (h < 11) return 'breakfast'
  if (h < 16) return 'lunch'
  if (h < 21) return 'dinner'
  return 'snack'
}
