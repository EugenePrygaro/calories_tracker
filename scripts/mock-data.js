/**
 * Мокові дані для розробки: «Мої страви» і записи на сьогодні.
 * Використовуються автоматично локальним сервером (порожня база)
 * і скриптом `npm run seed` (для будь-якої адреси, зокрема Vercel).
 * Id детерміновані — повторний запуск нічого не дублює.
 */
import { sanitizeBodyRecord, sanitizeEntry, sanitizeFood } from '../shared/validate.js'

/** @typedef {import('../shared/model.js').Food} Food */
/** @typedef {import('../shared/model.js').Entry} Entry */
/** @typedef {import('../shared/model.js').MealType} MealType */

/** [slug, назва, ккал, Б, Ж, В на 100 г, типова порція г] */
/** @type {[string, string, number, number, number, number, number][]} */
const FOODS = [
  ['oatmeal', 'Вівсянка на воді', 88, 3, 1.7, 15, 250],
  ['buckwheat', 'Гречка варена', 110, 4.2, 1.1, 21.3, 200],
  ['rice', 'Рис білий варений', 130, 2.7, 0.3, 28, 180],
  ['chicken', 'Куряче філе запечене', 165, 31, 3.6, 0, 150],
  ['egg', 'Яйце куряче варене', 155, 12.6, 10.6, 1.1, 55],
  ['cottage', 'Сир кисломолочний 5%', 121, 17, 5, 1.8, 200],
  ['yogurt', 'Йогурт грецький 2%', 73, 10, 2, 3.6, 150],
  ['banana', 'Банан', 89, 1.1, 0.3, 22.8, 120],
  ['apple', 'Яблуко', 52, 0.3, 0.2, 13.8, 180],
  ['ryebread', 'Хліб житній', 259, 8.5, 3.3, 48.3, 40],
  ['borscht', 'Борщ український', 49, 1.6, 2.4, 5.3, 350],
  ['vareniki', 'Вареники з картоплею', 148, 4.1, 3.5, 25, 200],
  ['salad', 'Салат з огірків і помідорів', 35, 0.9, 2, 3.4, 150],
  ['latte', 'Кава з молоком', 38, 1.9, 1.5, 4.3, 250],
  ['peanut', 'Арахісова паста', 588, 25, 50, 20, 20],
]

/** Що «з'їдено» сьогодні: [прийом, slug, грами, година:хвилина] */
/** @type {[MealType, string, number, string][]} */
const TODAY = [
  ['breakfast', 'oatmeal', 250, '08:10'],
  ['breakfast', 'banana', 120, '08:12'],
  ['breakfast', 'latte', 250, '08:15'],
  ['lunch', 'borscht', 350, '13:05'],
  ['lunch', 'ryebread', 40, '13:06'],
  ['lunch', 'chicken', 150, '13:20'],
  ['snack', 'yogurt', 150, '16:40'],
]

/** @param {number} [now] @returns {Food[]} */
export function mockFoods(now = Date.now()) {
  return FOODS.map(([slug, name, kcal, protein, fat, carbs, servingGrams], i) =>
    sanitizeFood({
      id: `seed-food-${slug}`,
      name,
      brand: null,
      per100: { kcal, protein, fat, carbs },
      servingGrams,
      source: 'own',
      offCode: null,
      createdAt: now - i,
      updatedAt: now - i,
    }),
  )
}

/**
 * @param {string} date YYYY-MM-DD
 * @param {Food[]} foods
 * @returns {Entry[]}
 */
export function mockEntries(date, foods) {
  const bySlug = new Map(foods.map((f) => [f.id.replace('seed-food-', ''), f]))
  const [y = 0, m = 1, d = 1] = date.split('-').map(Number)

  return TODAY.flatMap(([meal, slug, grams, time], i) => {
    const food = bySlug.get(slug)
    if (!food) return []
    const [hh = 0, mm = 0] = time.split(':').map(Number)
    const at = new Date(y, m - 1, d, hh, mm).getTime()
    return [
      sanitizeEntry({
        id: `seed-${date}-${i + 1}`,
        date,
        meal,
        mode: 'weight',
        name: food.name,
        grams,
        per100: food.per100,
        createdAt: at,
        updatedAt: at,
      }),
    ]
  })
}

/** Сьогоднішня дата за місцевим часом. */
export function todayKey() {
  const t = new Date()
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
}

/** @typedef {import('../shared/model.js').BodyRecord} BodyRecord */

/** @param {Date} d */
const keyOf = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Поточні (сьогоднішні) значення в мокових даних. */
export const MOCK_CURRENT = { weight: 76, chest: 100, waist: 87, hips: 110 }

/** Об'єми, заміряні раніше: [днів тому, груди, талія, стегна]. Сьогоднішні — MOCK_CURRENT. */
/** @type {[number, number, number, number][]} */
const MEASUREMENTS = [
  [28, 98.5, 85, 108],
  [14, 99, 86, 109],
]

/**
 * Історія замірів за останній місяць: вага кожні 2 дні росте з 73 до 76 кг
 * з невеликими коливаннями; об'єми раз на 2 тижні. Детермінована — без Math.random.
 * @param {number} [now]
 * @returns {BodyRecord[]}
 */
export function mockBody(now = Date.now()) {
  /** @type {BodyRecord[]} */
  const out = []
  const DAYS = 30
  const FROM = 73
  for (let back = DAYS; back >= 0; back -= 2) {
    const d = new Date(now)
    d.setDate(d.getDate() - back)
    const t = (DAYS - back) / DAYS // 0 → 1
    // Коливання гаснуть на краях, тож перший замір рівно 73, останній — рівно 76.
    const noise = Math.sin(t * Math.PI) * (0.35 * Math.sin(back * 1.3) + 0.15 * Math.cos(back * 0.7))
    const weight = Math.round((FROM + (MOCK_CURRENT.weight - FROM) * t + noise) * 10) / 10
    const m = back === 0 ? [0, MOCK_CURRENT.chest, MOCK_CURRENT.waist, MOCK_CURRENT.hips] : MEASUREMENTS.find(([b]) => b === back)
    out.push(
      sanitizeBodyRecord({
        date: keyOf(d),
        weight,
        chest: m?.[1] ?? null,
        waist: m?.[2] ?? null,
        hips: m?.[3] ?? null,
        updatedAt: d.getTime(),
      }),
    )
  }
  return out
}

/** Цільова вага для мокового профілю. */
export const MOCK_TARGET_WEIGHT = 60
