/** @typedef {import('./model.js').Nutrients} Nutrients */

/** @type {Readonly<Nutrients>} */
export const ZERO = { kcal: 0, protein: 0, fat: 0, carbs: 0 }

/** @param {number} n */
export const round1 = (n) => Math.round(n * 10) / 10

/**
 * Цінність порції з цінності на 100 г.
 * @param {Nutrients} per100
 * @param {number} grams
 * @returns {Nutrients}
 */
export function scale(per100, grams) {
  const k = grams / 100
  return {
    kcal: round1(per100.kcal * k),
    protein: round1(per100.protein * k),
    fat: round1(per100.fat * k),
    carbs: round1(per100.carbs * k),
  }
}

/**
 * @param {readonly Nutrients[]} items
 * @returns {Nutrients}
 */
export function sum(items) {
  const total = items.reduce(
    (acc, i) => ({
      kcal: acc.kcal + i.kcal,
      protein: acc.protein + i.protein,
      fat: acc.fat + i.fat,
      carbs: acc.carbs + i.carbs,
    }),
    { ...ZERO },
  )
  return {
    kcal: round1(total.kcal),
    protein: round1(total.protein),
    fat: round1(total.fat),
    carbs: round1(total.carbs),
  }
}

/** Калорійність за БЖВ (4 / 9 / 4 ккал на грам). */
export function kcalFromMacros(/** @type {Omit<Nutrients, 'kcal'>} */ m) {
  return Math.round(m.protein * 4 + m.fat * 9 + m.carbs * 4)
}

/** Відсоток виконання цілі, 0 при нульовій цілі. */
export function percent(/** @type {number} */ value, /** @type {number} */ goal) {
  return goal > 0 ? Math.round((value / goal) * 100) : 0
}
