/**
 * Модель даних, спільна для клієнта (src/) і серверних функцій (api/).
 * Чистий JS з JSDoc-типами: Vercel запускає його без компіляції, а tsc перевіряє.
 */

/** @typedef {'breakfast' | 'lunch' | 'dinner' | 'snack'} MealType */
/** @typedef {'weight' | 'quick'} EntryMode */

/**
 * Калорії та БЖВ. Для запису — підсумок порції, для `per100` — на 100 г.
 * @typedef {{ kcal: number, protein: number, fat: number, carbs: number }} Nutrients
 */

/**
 * Запис щоденника (mealLog).
 * `weight` — є вага і цінність на 100 г, підсумок рахується з них.
 * `quick`  — лише готові цифри, ваги немає.
 * @typedef {Nutrients & {
 *   id: string,
 *   date: string,
 *   meal: MealType,
 *   mode: EntryMode,
 *   name: string,
 *   grams: number | null,
 *   per100: Nutrients | null,
 *   createdAt: number,
 *   updatedAt: number,
 * }} Entry
 */

/**
 * Звідки страва: `own` — створена вручну, `off` — збережена з Open Food Facts.
 * @typedef {'own' | 'off'} FoodSource
 */

/**
 * Страва/продукт у «Моїх стравах» (ct:foods у Redis). Фото не зберігаємо.
 * @typedef {{
 *   id: string,
 *   name: string,
 *   brand: string | null,
 *   per100: Nutrients,
 *   servingGrams: number | null,
 *   source: FoodSource,
 *   offCode: string | null,
 *   createdAt: number,
 *   updatedAt: number,
 * }} Food
 */

/**
 * Страва в списку пошуку: «Мої страви» або результат публічного пошуку.
 * Фото (`imageUrl`) є лише в результатів публічного пошуку — посилання на CDN Open Food Facts.
 * @typedef {Omit<Food, 'createdAt' | 'updatedAt'> & { imageUrl?: string | null }} FoodItem
 */

/** @typedef {Nutrients} Goals */

/**
 * Профіль: денні норми й цільова вага (кг, null — не задана).
 * @typedef {{ goals: Goals, targetWeight: number | null, updatedAt: number }} Profile
 */

/** @typedef {'weight' | 'chest' | 'waist' | 'hips'} BodyField */

/**
 * Заміри тіла за день (ct:body у Redis, ключ — дата). Вага в кг, об'єми в см;
 * null — цього дня не міряли.
 * @typedef {{
 *   date: string,
 *   weight: number | null,
 *   chest: number | null,
 *   waist: number | null,
 *   hips: number | null,
 *   updatedAt: number,
 * }} BodyRecord
 */

/** @type {readonly BodyField[]} */
export const BODY_FIELDS = ['weight', 'chest', 'waist', 'hips']

/** @type {Readonly<Record<BodyField, { label: string, unit: string }>>} */
export const BODY_LABELS = {
  weight: { label: 'Вага', unit: 'кг' },
  chest: { label: 'Груди', unit: 'см' },
  waist: { label: 'Талія', unit: 'см' },
  hips: { label: 'Стегна', unit: 'см' },
}

/** @type {readonly MealType[]} */
export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack']

/** @type {Readonly<Record<MealType, string>>} */
export const MEAL_LABELS = {
  breakfast: 'Сніданок',
  lunch: 'Обід',
  dinner: 'Вечеря',
  snack: 'Перекуси',
}

/** @type {Readonly<Goals>} */
export const DEFAULT_GOALS = { kcal: 2000, protein: 120, fat: 70, carbs: 220 }

export const QUICK_ADD_NAME = 'Швидкий запис'

export const LIMITS = {
  nameLength: 80,
  brandLength: 60,
  searchQuery: { min: 2, max: 60 },
  grams: { min: 0.1, max: 5000 },
  per100: { kcal: 1000, macro: 100 },
  quick: { kcal: 10000, macro: 1000 },
  goals: { kcal: { min: 500, max: 10000 }, macro: { min: 0, max: 1000 } },
  body: { weight: { min: 20, max: 400 }, cm: { min: 20, max: 300 } },
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const ID_RE = /^[A-Za-z0-9-]{8,64}$/
export const OFF_CODE_RE = /^\d{4,20}$/
/** Приймаємо фото лише з CDN Open Food Facts. */
export const OFF_IMAGE_RE = /^https:\/\/images\.openfoodfacts\.org\/[^\s"'<>]+$/

/** Нормалізований пошуковий запит: нижній регістр, без зайвих пробілів. */
export function normalizeQuery(/** @type {string} */ q) {
  return q.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, LIMITS.searchQuery.max)
}
