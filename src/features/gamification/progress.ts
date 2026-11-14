/**
 * Прогрес гравця: рівень, досвід, серія днів, монети.
 *
 * ⚠️ Поки що ЗАГЛУШКА з фіксованими значеннями — лише щоб зверстати верхню
 * панель за макетом. Справжні правила (за що даємо досвід і монети, як рахуємо
 * серію днів) і зберігання в Redis з'являться в задачі про гейміфікацію.
 */
export interface PlayerProgress {
  level: number
  /** Досвід у межах поточного рівня, 0…1 */
  levelProgress: number
  /** Скільки днів поспіль ведеться щоденник */
  streak: number
  coins: number
}

const PLACEHOLDER: PlayerProgress = { level: 12, levelProgress: 0.62, streak: 14, coins: 450 }

export function usePlayerProgress(): PlayerProgress {
  return PLACEHOLDER
}
