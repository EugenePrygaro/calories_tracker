/**
 * Статистика: підсумок дня (для графіків калорій і дефіциту) і точність попадання в КБЖВ
 * (для теплової карти дисципліни). Чиста логіка — спільна для сервера й клієнта.
 */
import { sum } from './nutrition.js'

/** @typedef {import('./model.js').Entry} Entry */
/** @typedef {import('./model.js').Goals} Goals */

/**
 * Підсумок одного дня. Цілі — знімок на момент останньої зміни дня,
 * щоб зміна норм пізніше не переписувала історію точності.
 * @typedef {{
 *   date: string,
 *   kcal: number,
 *   protein: number,
 *   fat: number,
 *   carbs: number,
 *   entries: number,
 *   goals: Goals,
 *   cheat?: boolean,
 * }} DaySummary
 * cheat — у цей день використано «Читміл-квиток»: день зараховано як успішний.
 */

/** @param {string} date @param {readonly Entry[]} entries @param {Goals} goals @returns {DaySummary} */
export function summarize(date, entries, goals) {
  const t = sum(entries)
  return { date, kcal: t.kcal, protein: t.protein, fat: t.fat, carbs: t.carbs, entries: entries.length, goals: { ...goals } }
}

/** Вага кожного показника в точності: калорії важать найбільше. */
export const ACCURACY_WEIGHTS = { kcal: 0.4, protein: 0.25, fat: 0.175, carbs: 0.175 }

/**
 * Точність дня, 0…1: 1 − зважене середнє відхилень від норм (кожне не більше 100%).
 * Відхилення 10% по всіх показниках → 0,9.
 * @param {Pick<DaySummary, 'kcal' | 'protein' | 'fat' | 'carbs' | 'goals' | 'cheat'>} s
 */
export function accuracy(s) {
  if (s.cheat) return 1 // читміл: день зараховано як точний
  let total = 0
  let weights = 0
  for (const key of /** @type {const} */ (['kcal', 'protein', 'fat', 'carbs'])) {
    const goal = s.goals[key]
    if (!(goal > 0)) continue
    total += ACCURACY_WEIGHTS[key] * Math.min(Math.abs(s[key] - goal) / goal, 1)
    weights += ACCURACY_WEIGHTS[key]
  }
  return weights > 0 ? 1 - total / weights : 0
}

/** Пороги рівнів теплової карти (точність ≥ …): 4 — «точний день» (≥ 85%), 3 — ≥ 75%, 2 — ≥ 60%. */
export const LEVEL_THRESHOLDS = [0.85, 0.75, 0.6]

/**
 * Рівень клітинки теплової карти: 0 — записів немає, 1…4 — що вище, то точніше.
 * @param {DaySummary | undefined} s @returns {0 | 1 | 2 | 3 | 4}
 */
export function heatLevel(s) {
  if (!s || s.entries === 0) return 0
  const a = accuracy(s)
  if (a >= (LEVEL_THRESHOLDS[0] ?? 1)) return 4
  if (a >= (LEVEL_THRESHOLDS[1] ?? 1)) return 3
  if (a >= (LEVEL_THRESHOLDS[2] ?? 1)) return 2
  return 1
}

/** Дефіцит дня, ккал: додатний — з'їдено менше норми, від'ємний — профіцит. @param {DaySummary} s */
export const deficitOf = (s) => s.goals.kcal - s.kcal

/** Скільки ккал ≈ 1 кг жиру (для «≈ кг» біля сумарного дефіциту). */
export const KCAL_PER_KG = 7700
