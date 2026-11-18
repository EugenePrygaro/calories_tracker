/**
 * Пошук у публічному каталозі Open Food Facts (search-a-licious) — запасне джерело,
 * коли Сільпо (server/silpo.js) недоступне чи знайшло замало.
 * Старий cgi/search.pl часто віддає 503, тому використовуємо новий пошук.
 * Дані OFF — ODbL.
 */
import { CATALOG_CODE_RE, CATALOG_IMAGE_RE, LIMITS, canonicalEan } from '../shared/model.js'
import { round1 } from '../shared/nutrition.js'
import { obj, str } from '../shared/validate.js'
import { HttpError, timeLeft } from './http.js'

/** @typedef {import('../shared/model.js').FoodItem} FoodItem */

const SEARCH_URL = 'https://search.openfoodfacts.org/search'
const FIELDS = [
  'code',
  'product_name',
  'product_name_uk',
  'product_name_en',
  'brands',
  'serving_quantity',
  'image_front_small_url',
  'nutriments',
].join(',')
/** Найдовше чекаємо OFF, навіть якщо до дедлайну ще далеко. */
const TIMEOUT_MS = 8000

/** OFF просить, щоб клієнти представлялися (без особистих даних). */
export const USER_AGENT = 'CaloriesTracker/0.1 (personal PWA)'
export const MAX_RESULTS = 25

const ENTITIES = /** @type {Record<string, string>} */ ({ quot: '"', amp: '&', apos: "'", '#39': "'", lt: '<', gt: '>', nbsp: ' ' })

/** OFF інколи віддає назви з HTML-сутностями: «Йогурт &quot;Абрикос&quot;». @param {unknown} v */
function text(v) {
  return typeof v === 'string' ? v.replace(/&(quot|amp|apos|#39|lt|gt|nbsp);/g, (_, e) => ENTITIES[e] ?? '') : v
}

/** @param {unknown} v */
function finite(v) {
  const n = typeof v === 'string' && v.trim() ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}

/**
 * Один результат OFF → FoodItem, або null, якщо продукт непридатний.
 * Головний фільтр: без `energy-kcal_100g` продукт у видачу не потрапляє.
 * @param {unknown} hit
 * @returns {FoodItem | null}
 */
export function normalizeOffHit(hit) {
  const h = obj(hit)
  const n = obj(h.nutriments)

  const kcal = finite(n['energy-kcal_100g'])
  if (kcal === null || kcal < 0 || kcal > LIMITS.per100.kcal) return null

  /** @param {string} key */
  const macro = (key) => finite(n[key]) ?? 0
  const protein = macro('proteins_100g')
  const fat = macro('fat_100g')
  const carbs = macro('carbohydrates_100g')
  if ([protein, fat, carbs].some((v) => v < 0 || v > LIMITS.per100.macro)) return null

  const code = typeof h.code === 'string' && CATALOG_CODE_RE.test(h.code) ? h.code : null
  if (!code) return null

  const name = [h.product_name_uk, h.product_name, h.product_name_en]
    .map((v) => str(text(v), LIMITS.nameLength))
    .find(Boolean)
  if (!name) return null

  const brands = Array.isArray(h.brands) ? h.brands : typeof h.brands === 'string' ? h.brands.split(',') : []
  const brand = brands.map((b) => str(text(b), LIMITS.brandLength)).find(Boolean) ?? null

  const serving = finite(h.serving_quantity)
  const image = h.image_front_small_url

  return {
    id: `off-${code}`,
    name,
    brand,
    per100: { kcal: round1(kcal), protein: round1(protein), fat: round1(fat), carbs: round1(carbs) },
    servingGrams:
      serving !== null && serving >= LIMITS.grams.min && serving <= LIMITS.grams.max ? round1(serving) : null,
    source: 'off',
    offCode: code,
    barcode: canonicalEan(code),
    imageUrl: typeof image === 'string' && CATALOG_IMAGE_RE.test(image) ? image : null,
  }
}

const PRODUCT_URL = 'https://world.openfoodfacts.org/api/v2/product/'

/**
 * Продукт за штрихкодом (офіційний API OFF). Немає продукту чи калорій → null; OFF недоступний → HttpError.
 * @param {string} ean canonicalEan
 * @param {{ deadline?: number, fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<FoodItem | null>}
 */
export async function findOffByEan(ean, { deadline = Infinity, fetchImpl = fetch } = {}) {
  const timeout = Math.min(TIMEOUT_MS, timeLeft(deadline))
  if (timeout <= 0) throw new HttpError(502, 'catalog_unavailable')
  /** @type {Response} */
  let res
  try {
    res = await fetchImpl(`${PRODUCT_URL}${ean}.json?fields=${FIELDS}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeout),
    })
  } catch {
    throw new HttpError(502, 'catalog_unavailable')
  }
  if (res.status === 404) return null // OFF відповідає 404, коли продукту немає
  if (!res.ok) throw new HttpError(502, 'catalog_unavailable')
  const data = obj(await res.json().catch(() => null))
  if (data.status !== 1) return null
  return normalizeOffHit({ ...obj(data.product), code: ean })
}

/**
 * @param {string} query нормалізований запит (shared/model.js normalizeQuery)
 * @param {{ deadline?: number, fetchImpl?: typeof fetch }} [opts] deadline — мітка часу, після якої не чекаємо
 * @returns {Promise<FoodItem[]>}
 */
export async function searchOff(query, { deadline = Infinity, fetchImpl = fetch } = {}) {
  const url = `${SEARCH_URL}?q=${encodeURIComponent(query)}&page_size=50&langs=uk,en&fields=${FIELDS}`
  const timeout = Math.min(TIMEOUT_MS, timeLeft(deadline))
  if (timeout <= 0) throw new HttpError(502, 'catalog_unavailable')
  /** @type {Response} */
  let res
  try {
    res = await fetchImpl(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeout),
    })
  } catch {
    throw new HttpError(502, 'catalog_unavailable')
  }
  if (!res.ok) throw new HttpError(502, 'catalog_unavailable')

  const data = obj(await res.json().catch(() => null))
  const hits = Array.isArray(data.hits) ? data.hits : []

  /** @type {FoodItem[]} */
  const results = []
  const seen = new Set()
  for (const hit of hits) {
    const item = normalizeOffHit(hit)
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    results.push(item)
    if (results.length >= MAX_RESULTS) break
  }
  return results
}
