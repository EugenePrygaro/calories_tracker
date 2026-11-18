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
 * `portion` — запис додали порцією («2 штуки»): грами = count × вага однієї. Лише для `weight`;
 * старі записи й записи «в грамах» поля не мають.
 * @typedef {Nutrients & {
 *   id: string,
 *   date: string,
 *   meal: MealType,
 *   mode: EntryMode,
 *   name: string,
 *   grams: number | null,
 *   per100: Nutrients | null,
 *   portion?: EntryPortion,
 *   createdAt: number,
 *   updatedAt: number,
 * }} Entry
 */

/** Скільки яких порцій з'їдено. @typedef {{ unit: PortionUnit, count: number }} EntryPortion */

/**
 * Звідки страва: `own` — створена вручну; з публічних каталогів: `silpo` — Сільпо,
 * `zakaz` — Zakaz.ua, `off` — Open Food Facts.
 * @typedef {'own' | 'off' | 'silpo' | 'zakaz'} FoodSource
 */

/** Страви з публічних каталогів (мають `offCode`). @type {readonly FoodSource[]} */
export const CATALOG_SOURCES = ['off', 'silpo', 'zakaz']

/**
 * Страва/продукт у «Моїх стравах» (ct:foods у Redis). Фото не зберігаємо.
 * `offCode` — код у каталозі-джерелі: штрихкод для Open Food Facts і Zakaz.ua, номер товару для Сільпо
 * (назва поля історична — так воно вже лежить у Redis).
 * `barcode` — штрихкод упаковки (canonicalEan): за ним сканер знаходить страву миттєво й без мережі.
 * @typedef {{
 *   id: string,
 *   name: string,
 *   brand: string | null,
 *   per100: Nutrients,
 *   servingGrams: number | null,
 *   source: FoodSource,
 *   offCode: string | null,
 *   portions?: Portion[],
 *   barcode?: string | null,
 *   createdAt: number,
 *   updatedAt: number,
 * }} Food
 */

/**
 * Одиниця порції: при додаванні обираєш «2 штуки», а не рахуєш грами.
 * @typedef {'piece' | 'slice' | 'chunk' | 'serving' | 'package' | 'glass' | 'tbsp' | 'tsp'} PortionUnit
 */

/**
 * Скільки грамів в одній такій одиниці цієї страви. У страви — не більше однієї порції кожного виду.
 * Старі страви в Redis поля `portions` не мають: sanitizeFood дає [].
 * @typedef {{ unit: PortionUnit, grams: number }} Portion
 */

/**
 * Страва в списку пошуку: «Мої страви» або результат публічного пошуку.
 * Фото (`imageUrl`) є лише в результатів публічного пошуку — посилання на CDN каталогу.
 * @typedef {Omit<Food, 'createdAt' | 'updatedAt'> & { imageUrl?: string | null }} FoodItem
 */

/** @typedef {Nutrients} Goals */

/**
 * Профіль: денні норми й цільова вага (кг, null — не задана).
 * weekendBoost — на скільки % більше калорій у суботу й неділю (0 — вимкнено), див. shared/goals.js
 * @typedef {{ goals: Goals, targetWeight: number | null, weekendBoost: number, updatedAt: number }} Profile
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

/** Одиниці порцій у порядку показу. @type {readonly PortionUnit[]} */
export const PORTION_UNITS = ['piece', 'slice', 'chunk', 'serving', 'package', 'glass', 'tbsp', 'tsp']

/**
 * Назва й емодзі одиниці; `forms` — для лічби: 2 штуки, 5 штук, 1,5 штуки.
 * @type {Readonly<Record<PortionUnit, { label: string, icon: string, forms: { few: string, many: string, fraction: string } }>>}
 */
export const PORTION_LABELS = {
  piece: { label: 'штука', icon: '🥚', forms: { few: 'штуки', many: 'штук', fraction: 'штуки' } },
  slice: { label: 'скибочка', icon: '🍕', forms: { few: 'скибочки', many: 'скибочок', fraction: 'скибочки' } },
  chunk: { label: 'шматок', icon: '🍬', forms: { few: 'шматки', many: 'шматків', fraction: 'шматка' } },
  serving: { label: 'порція', icon: '🥣', forms: { few: 'порції', many: 'порцій', fraction: 'порції' } },
  package: { label: 'упаковка', icon: '🥡', forms: { few: 'упаковки', many: 'упаковок', fraction: 'упаковки' } },
  glass: { label: 'склянка', icon: '🥛', forms: { few: 'склянки', many: 'склянок', fraction: 'склянки' } },
  tbsp: { label: 'ст. ложка', icon: '🥄', forms: { few: 'ст. ложки', many: 'ст. ложок', fraction: 'ст. ложки' } },
  tsp: { label: 'ч. ложка', icon: '🍯', forms: { few: 'ч. ложки', many: 'ч. ложок', fraction: 'ч. ложки' } },
}

const PLURAL = new Intl.PluralRules('uk')

/**
 * Одиниця в потрібній формі для кількості: 1 штука, 2 штуки, 5 штук, 21 штука, 1,5 штуки.
 * @param {PortionUnit} unit @param {number} count
 */
export function portionUnitLabel(unit, count) {
  const { label, forms } = PORTION_LABELS[unit]
  if (!Number.isInteger(count)) return forms.fraction
  const rule = PLURAL.select(count)
  return rule === 'one' ? label : rule === 'few' ? forms.few : forms.many
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
  portionCount: { min: 0.1, max: 100 },
  grams: { min: 0.1, max: 5000 },
  per100: { kcal: 1000, macro: 100 },
  quick: { kcal: 10000, macro: 1000 },
  goals: { kcal: { min: 500, max: 10000 }, macro: { min: 0, max: 1000 } },
  weekendBoost: { min: 0, max: 50 },
  body: { weight: { min: 20, max: 400 }, cm: { min: 20, max: 300 } },
}

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const ID_RE = /^[A-Za-z0-9-]{8,64}$/
/** Код товару в публічному каталозі (`offCode`). */
export const CATALOG_CODE_RE = /^\d{4,20}$/
/** Приймаємо фото лише з CDN каталогів: Open Food Facts, Сільпо, Zakaz.ua. */
export const CATALOG_IMAGE_RE =
  /^https:\/\/(?:images\.openfoodfacts\.org|images\.silpo\.ua|img\d?\.zakaz\.ua)\/[^\s"'<>]+$/

/**
 * Штрихкод в одному вигляді, щоб однакові коди збігались незалежно від джерела.
 * За правилами GTIN: нулі попереду не змінюють код, тож їх прибираємо й доповнюємо до
 * EAN-8 (≤ 8 цифр) або EAN-13: Zakaz.ua «04820…» (GTIN-14) → «4820…», «00000096385074» → «96385074»,
 * UPC-A (12 цифр) → EAN-13 з нулем попереду. Перевіряє контрольну цифру; некоректний код → null.
 * @param {unknown} raw
 * @returns {string | null}
 */
export function canonicalEan(raw) {
  const s = typeof raw === 'string' ? raw.trim() : typeof raw === 'number' ? String(raw) : ''
  if (!/^\d{8}$|^\d{12,14}$/.test(s)) return null
  // контрольна цифра GTIN: ваги 3 і 1 справа наліво (без самої контрольної); нулі попереду на неї не впливають
  const digits = [...s].map(Number)
  const check = digits.pop()
  const total = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0)
  if ((10 - (total % 10)) % 10 !== check) return null
  const core = s.replace(/^0+/, '')
  const out = core.length <= 8 ? core.padStart(8, '0') : core.padStart(13, '0')
  return out.length <= 13 ? out : null // 14 цифр без нуля попереду — код ящика, не товару
}

/** Нормалізований пошуковий запит: нижній регістр, без зайвих пробілів. */
export function normalizeQuery(/** @type {string} */ q) {
  return q.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, LIMITS.searchQuery.max)
}
