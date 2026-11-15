/**
 * Перевірка й нормалізація даних. Сервер довіряє лише результату цих функцій;
 * клієнт проганяє через них дані перед відправкою, тож форма не дасть
 * зберегти те, що сервер потім відхилить.
 */
import {
  DATE_RE,
  DEFAULT_GOALS,
  ID_RE,
  LIMITS,
  MEAL_TYPES,
  OFF_CODE_RE,
  QUICK_ADD_NAME,
} from './model.js'
import { round1, scale } from './nutrition.js'
import { DEFAULT_WEEKEND_BOOST } from './goals.js'

/** @typedef {import('./model.js').Entry} Entry */
/** @typedef {import('./model.js').Food} Food */
/** @typedef {import('./model.js').Goals} Goals */
/** @typedef {import('./model.js').Profile} Profile */
/** @typedef {import('./model.js').MealType} MealType */
/** @typedef {import('./model.js').Nutrients} Nutrients */
/** @typedef {import('./model.js').BodyRecord} BodyRecord */

export class ValidationError extends Error {
  /** @param {string} field */
  constructor(field) {
    super(`invalid_${field}`)
    this.name = 'ValidationError'
    this.field = field
  }
}

/** @param {unknown} v @returns {Record<string, unknown>} */
export const obj = (v) =>
  v && typeof v === 'object' && !Array.isArray(v) ? /** @type {Record<string, unknown>} */ (v) : {}

/** @param {unknown} v */
const isBlank = (v) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

/** Рядок без зайвих пробілів, обрізаний до max. @param {unknown} v @param {number} max */
export const str = (v, max) =>
  typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max).trim() : ''

/**
 * Число з рядка або числа; кома як десятковий роздільник теж приймається.
 * @param {unknown} v @param {string} field @param {number} min @param {number} max
 */
function num(v, field, min, max) {
  if (isBlank(v)) throw new ValidationError(field)
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(',', '.'))
  if (!Number.isFinite(n) || n < min || n > max) throw new ValidationError(field)
  return round1(n)
}

/** @param {unknown} v @param {string} field @param {number} min @param {number} max */
const optNum = (v, field, min, max) => (isBlank(v) ? 0 : num(v, field, min, max))

/**
 * Мітка часу; не з майбутнього понад добу (інакше LWW-запис став би «вічним»).
 * @param {unknown} v @param {string} field
 */
function timestamp(v, field) {
  if (typeof v !== 'number' || !Number.isSafeInteger(v) || v <= 0 || v > Date.now() + 86_400_000) {
    throw new ValidationError(field)
  }
  return v
}

/** @param {unknown} v @returns {string} */
export function requireId(v) {
  if (typeof v !== 'string' || !ID_RE.test(v)) throw new ValidationError('id')
  return v
}

/** Дата YYYY-MM-DD, яка реально існує (без 2026-02-30). @param {unknown} v @returns {string} */
export function requireDate(v) {
  if (typeof v !== 'string' || !DATE_RE.test(v)) throw new ValidationError('date')
  const d = new Date(`${v}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== v) {
    throw new ValidationError('date')
  }
  return v
}

/** @param {unknown} v @returns {MealType} */
function requireMeal(v) {
  const meal = MEAL_TYPES.find((m) => m === v)
  if (!meal) throw new ValidationError('meal')
  return meal
}

/** Харчова цінність на 100 г: калорії обов'язкові, БЖВ за замовчуванням 0. @param {unknown} input @returns {Nutrients} */
export function sanitizePer100(input) {
  const p = obj(input)
  return {
    kcal: num(p.kcal, 'kcal', 0, LIMITS.per100.kcal),
    protein: optNum(p.protein, 'protein', 0, LIMITS.per100.macro),
    fat: optNum(p.fat, 'fat', 0, LIMITS.per100.macro),
    carbs: optNum(p.carbs, 'carbs', 0, LIMITS.per100.macro),
  }
}

/**
 * Повний запис щоденника. Для режиму `weight` підсумок завжди
 * перераховується з `per100` і `grams` — підсумку від клієнта не довіряємо.
 * @param {unknown} input
 * @returns {Entry}
 */
export function sanitizeEntry(input) {
  const o = obj(input)
  const base = {
    id: requireId(o.id),
    date: requireDate(o.date),
    meal: requireMeal(o.meal),
    createdAt: timestamp(o.createdAt, 'createdAt'),
    updatedAt: timestamp(o.updatedAt, 'updatedAt'),
  }

  if (o.mode === 'weight') {
    const name = str(o.name, LIMITS.nameLength)
    if (!name) throw new ValidationError('name')
    const grams = num(o.grams, 'grams', LIMITS.grams.min, LIMITS.grams.max)
    const per100 = sanitizePer100(o.per100)
    return { ...base, mode: 'weight', name, grams, per100, ...scale(per100, grams) }
  }

  if (o.mode === 'quick') {
    return {
      ...base,
      mode: 'quick',
      name: str(o.name, LIMITS.nameLength) || QUICK_ADD_NAME,
      grams: null,
      per100: null,
      kcal: num(o.kcal, 'kcal', 0, LIMITS.quick.kcal),
      protein: num(o.protein, 'protein', 0, LIMITS.quick.macro),
      fat: optNum(o.fat, 'fat', 0, LIMITS.quick.macro),
      carbs: optNum(o.carbs, 'carbs', 0, LIMITS.quick.macro),
    }
  }

  throw new ValidationError('mode')
}

/**
 * Страва з «Моїх страв».
 * @param {unknown} input
 * @returns {Food}
 */
export function sanitizeFood(input) {
  const o = obj(input)
  const name = str(o.name, LIMITS.nameLength)
  if (!name) throw new ValidationError('name')

  const source = o.source === 'off' ? 'off' : o.source === 'own' ? 'own' : null
  if (!source) throw new ValidationError('source')
  const offCode = typeof o.offCode === 'string' && OFF_CODE_RE.test(o.offCode) ? o.offCode : null
  if (source === 'off' && !offCode) throw new ValidationError('offCode')

  return {
    id: requireId(o.id),
    name,
    brand: str(o.brand, LIMITS.brandLength) || null,
    per100: sanitizePer100(o.per100),
    servingGrams: isBlank(o.servingGrams)
      ? null
      : num(o.servingGrams, 'servingGrams', LIMITS.grams.min, LIMITS.grams.max),
    source,
    offCode,
    createdAt: timestamp(o.createdAt, 'createdAt'),
    updatedAt: timestamp(o.updatedAt, 'updatedAt'),
  }
}

/** @param {unknown} input @returns {Goals} */
export function sanitizeGoals(input) {
  const o = obj(input)
  const { kcal, macro } = LIMITS.goals
  return {
    kcal: Math.round(num(o.kcal, 'kcal', kcal.min, kcal.max)),
    protein: Math.round(num(o.protein, 'protein', macro.min, macro.max)),
    fat: Math.round(num(o.fat, 'fat', macro.min, macro.max)),
    carbs: Math.round(num(o.carbs, 'carbs', macro.min, macro.max)),
  }
}

/** @param {unknown} input @returns {Profile} */
export function sanitizeProfile(input) {
  const o = obj(input)
  const { weight } = LIMITS.body
  return {
    goals: sanitizeGoals(o.goals),
    targetWeight: isBlank(o.targetWeight) ? null : num(o.targetWeight, 'targetWeight', weight.min, weight.max),
    // старий профіль без поля — надбавка за замовчуванням
    weekendBoost: isBlank(o.weekendBoost)
      ? DEFAULT_WEEKEND_BOOST
      : Math.round(num(o.weekendBoost, 'weekendBoost', LIMITS.weekendBoost.min, LIMITS.weekendBoost.max)),
    updatedAt: timestamp(o.updatedAt, 'updatedAt'),
  }
}

/**
 * Заміри тіла за день. Порожнє поле — null (не міряли), але хоча б одне має бути.
 * @param {unknown} input
 * @returns {BodyRecord}
 */
export function sanitizeBodyRecord(input) {
  const o = obj(input)
  const { weight, cm } = LIMITS.body
  /** @param {string} field @param {{ min: number, max: number }} range */
  const measure = (field, range) => (isBlank(o[field]) ? null : num(o[field], field, range.min, range.max))
  const record = {
    date: requireDate(o.date),
    weight: measure('weight', weight),
    chest: measure('chest', cm),
    waist: measure('waist', cm),
    hips: measure('hips', cm),
    updatedAt: timestamp(o.updatedAt, 'updatedAt'),
  }
  if (record.weight === null && record.chest === null && record.waist === null && record.hips === null) {
    throw new ValidationError('empty')
  }
  return record
}

/** Профіль за замовчуванням: updatedAt = 0, тож будь-яке збереження його перекриє. */
export const DEFAULT_PROFILE = /** @type {Readonly<Profile>} */ ({
  goals: DEFAULT_GOALS,
  targetWeight: null,
  weekendBoost: DEFAULT_WEEKEND_BOOST,
  updatedAt: 0,
})
