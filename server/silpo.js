/**
 * Пошук у каталозі Сільпо — основне джерело публічного пошуку: українські назви,
 * товари з полиць і харчова цінність на 100 г.
 *
 * Це не документований публічний API, а той, з яким працює сайт silpo.ua, тож формат
 * може змінитися без попередження. Тому все, що приходить, перевіряємо так само суворо,
 * як OFF, а при будь-якому збої пошук іде далі — у Zakaz.ua й Open Food Facts (api/search.js).
 *
 * Харчова цінність є лише в картці товару, тому один пошук — це запит списку
 * й до DETAILS запитів карток паралельно (~150 мс разом). Результат кешується на добу.
 */
import { CATALOG_CODE_RE, CATALOG_IMAGE_RE, LIMITS, canonicalEan } from '../shared/model.js'
import { round1 } from '../shared/nutrition.js'
import { obj, str } from '../shared/validate.js'
import { fetchJson, parseNumber, rankByQuery } from './catalog.js'
import { HttpError, timeLeft } from './http.js'

/** @typedef {import('../shared/model.js').FoodItem} FoodItem */

/** Нульовий branch — загальний каталог без прив'язки до магазину. */
const PRODUCTS_URL = 'https://sf-ecom-api.silpo.ua/v1/uk/branches/00000000-0000-0000-0000-000000000000/products'
const IMAGE_URL = 'https://images.silpo.ua/products/300x300/webp/'
/** Скільки товарів беремо зі списку: пошук Сільпо неточний, тож пересортовуємо самі. */
const LIST_LIMIT = 40
/** Для скількох найкращих тягнемо картки з харчовою цінністю. */
export const DETAILS = 20
const LIST_TIMEOUT_MS = 4000
/** Найдовше чекаємо картку товару (і без дедлайну — AbortSignal.timeout(Infinity) кидає помилку). */
const DETAIL_TIMEOUT_MS = 4000

const SLUG_RE = /^[a-z0-9-]{1,200}$/
const ICON_RE = /^[\w-]{1,100}\.(?:png|jpe?g|webp)$/

/**
 * Калорії з «116/488» (кКал/кДж). Менше з двох чисел — ккал, навіть якщо порядок переплутано.
 * @param {unknown} v
 */
function kcalOf(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  const nums = v.split('/').map(parseNumber).filter((n) => n !== null)
  return nums.length ? Math.min(...nums) : null
}

/**
 * Харчова цінність на 100 г з картки товару (група `nutrient`), або null, якщо калорій немає.
 * @param {unknown} detail
 */
export function silpoNutrients(detail) {
  const groups = obj(detail).attributeGroups
  const group = Array.isArray(groups) ? groups.map(obj).find((g) => g.key === 'nutrient') : undefined
  const attrs = Array.isArray(group?.attributes) ? group.attributes.map(obj) : []
  /** @param {string} key */
  const value = (key) => obj(attrs.find((a) => obj(a.attribute).key === key)?.value).title

  const kcal = kcalOf(value('calorie'))
  if (kcal === null || kcal < 0 || kcal > LIMITS.per100.kcal) return null
  /** @param {string} key */
  const macro = (key) => parseNumber(value(key)) ?? 0
  const protein = macro('proteins')
  const fat = macro('fats')
  const carbs = macro('carbohydrates')
  if ([protein, fat, carbs].some((v) => v < 0 || v > LIMITS.per100.macro)) return null
  return { kcal: round1(kcal), protein: round1(protein), fat: round1(fat), carbs: round1(carbs) }
}

/**
 * Товар зі списку + його картка → FoodItem, або null, якщо товар непридатний.
 * @param {unknown} listItem
 * @param {unknown} detail
 * @returns {FoodItem | null}
 */
export function normalizeSilpo(listItem, detail) {
  const it = obj(listItem)
  const per100 = silpoNutrients(detail)
  if (!per100) return null

  const code = String(it.externalProductId ?? '')
  if (!CATALOG_CODE_RE.test(code)) return null
  const name = str(it.title, LIMITS.nameLength)
  if (!name) return null

  const image = typeof it.icon === 'string' && ICON_RE.test(it.icon) ? IMAGE_URL + it.icon : null
  const barcodes = obj(detail).barcodes
  const barcode = (Array.isArray(barcodes) ? barcodes : []).map(canonicalEan).find(Boolean) ?? null
  return {
    id: `silpo-${code}`,
    name,
    brand: str(it.brandTitle, LIMITS.brandLength) || null,
    per100,
    servingGrams: null,
    source: 'silpo',
    offCode: code,
    barcode,
    imageUrl: image && CATALOG_IMAGE_RE.test(image) ? image : null,
  }
}

/**
 * Пошук у Сільпо. Кидає HttpError, якщо недоступний сам пошук або не відкрилась жодна картка.
 * `partial` — частина карток не завантажилась (результат не варто кешувати надовго).
 * @param {string} query нормалізований запит
 * @param {{ deadline?: number, fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<{ results: FoodItem[], partial: boolean }>}
 */
export async function searchSilpo(query, { deadline = Infinity, fetchImpl = fetch } = {}) {
  const list = obj(
    await fetchJson(`${PRODUCTS_URL}?limit=${LIST_LIMIT}&search=${encodeURIComponent(query)}`, {
      timeout: Math.min(LIST_TIMEOUT_MS, timeLeft(deadline)),
      fetchImpl,
    }),
  )
  const items = (Array.isArray(list.items) ? list.items : [])
    .map(obj)
    .filter((it) => typeof it.title === 'string' && typeof it.slug === 'string' && SLUG_RE.test(it.slug))
  const top = rankByQuery(/** @type {(Record<string, unknown> & { title: string, slug: string })[]} */ (items), query)
    .slice(0, DETAILS)
  if (top.length === 0) return { results: [], partial: false }

  const timeout = Math.min(DETAIL_TIMEOUT_MS, timeLeft(deadline))
  const details = await Promise.allSettled(
    top.map((it) => fetchJson(`${PRODUCTS_URL}/${it.slug}`, { timeout, fetchImpl })),
  )
  const failed = details.filter((d) => d.status === 'rejected').length
  if (failed === top.length) throw new HttpError(502, 'catalog_unavailable')

  /** @type {FoodItem[]} */
  const results = []
  const seen = new Set()
  details.forEach((d, i) => {
    const item = d.status === 'fulfilled' ? normalizeSilpo(top[i], d.value) : null
    if (!item || seen.has(item.id)) return
    seen.add(item.id)
    results.push(item)
  })
  return { results, partial: failed > 0 }
}

/**
 * Товар за штрихкодом: пошук Сільпо приймає EAN як запит; беремо той, у чиїй картці є саме цей код.
 * Немає → null; Сільпо недоступне → HttpError.
 * @param {string} ean canonicalEan
 * @param {{ deadline?: number, fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<FoodItem | null>}
 */
export async function findSilpoByEan(ean, { deadline = Infinity, fetchImpl = fetch } = {}) {
  const list = obj(
    await fetchJson(`${PRODUCTS_URL}?limit=3&search=${ean}`, {
      timeout: Math.min(LIST_TIMEOUT_MS, timeLeft(deadline)),
      fetchImpl,
    }),
  )
  const items = (Array.isArray(list.items) ? list.items : [])
    .map(obj)
    .filter((it) => typeof it.slug === 'string' && SLUG_RE.test(it.slug))
  // картки кандидатів — паралельно: одна збійна не заважає перевірити решту
  const timeout = Math.min(DETAIL_TIMEOUT_MS, timeLeft(deadline))
  const details = await Promise.allSettled(
    items.map((it) => fetchJson(`${PRODUCTS_URL}/${it.slug}`, { timeout, fetchImpl })),
  )
  for (const [i, d] of details.entries()) {
    if (d.status !== 'fulfilled') continue
    const detail = obj(d.value)
    const barcodes = Array.isArray(detail.barcodes) ? detail.barcodes.map(canonicalEan) : []
    if (!barcodes.includes(ean)) continue
    const item = normalizeSilpo(items[i], detail)
    return item ? { ...item, barcode: ean } : null
  }
  // не знайшли, але частина карток не відкрилась — відповідь неповна (кешувати як «немає» не можна)
  if (details.some((d) => d.status === 'rejected')) throw new HttpError(502, 'catalog_unavailable')
  return null
}
