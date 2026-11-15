/**
 * Денна норма для конкретної дати: на вихідних (сб, нд) калорій більше на weekendBoost %.
 * Це враховується всюди — на екрані, у нагородах за норму, у статистиці й тепловій карті.
 */
import { DEFAULT_GOALS } from './model.js'

/** @typedef {import('./model.js').Goals} Goals */

/** Скільки відсотків калорій додаємо на вихідних за замовчуванням. */
export const DEFAULT_WEEKEND_BOOST = 15

/** Субота чи неділя (дата YYYY-MM-DD; день тижня від часового поясу не залежить). @param {string} date */
export function isWeekend(date) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return day === 0 || day === 6
}

/**
 * Норма на дату: калорії на вихідних × (1 + boost/100), округлено до 10 ккал. БЖВ — без змін.
 * @param {{ goals: Goals, weekendBoost?: number } | null | undefined} profile
 * @param {string} date
 * @returns {Goals}
 */
export function goalsForDate(profile, date) {
  const goals = profile?.goals ?? DEFAULT_GOALS
  const boost = profile?.weekendBoost ?? DEFAULT_WEEKEND_BOOST
  if (!(boost > 0) || !isWeekend(date)) return goals
  return { ...goals, kcal: Math.round((goals.kcal * (1 + boost / 100)) / 10) * 10 }
}
