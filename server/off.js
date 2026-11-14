/**
 * Пошук у публічному каталозі Open Food Facts (search-a-licious).
 * Старий cgi/search.pl часто віддає 503, тому використовуємо новий пошук.
 * Дані OFF — ODbL, в інтерфейсі є підпис джерела.
 */
import { LIMITS, OFF_CODE_RE, OFF_IMAGE_RE } from '../shared/model.js'
import { round1 } from '../shared/nutrition.js'
import { obj, str } from '../shared/validate.js'
import { HttpError } from './http.js'

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

  const code = typeof h.code === 'string' && OFF_CODE_RE.test(h.code) ? h.code : null
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
    imageUrl: typeof image === 'string' && OFF_IMAGE_RE.test(image) ? image : null,
  }
}

/**
 * @param {string} query нормалізований запит (shared/model.js normalizeQuery)
 * @param {typeof fetch} [fetchImpl] для тестів
 * @returns {Promise<FoodItem[]>}
 */
export async function searchOff(query, fetchImpl = fetch) {
  const url = `${SEARCH_URL}?q=${encodeURIComponent(query)}&page_size=50&langs=uk,en&fields=${FIELDS}`
  /** @type {Response} */
  let res
  try {
    res = await fetchImpl(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(8000),
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
