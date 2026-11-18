/**
 * Пошук у каталозі Zakaz.ua (вітрина Auchan, Novus, Metro та інших мереж) — друге джерело:
 * коли Сільпо недоступне або знайшло замало. Українські назви, харчова цінність на 100 г
 * прямо в результатах пошуку — один запит на весь пошук.
 *
 * Як і в Сільпо, це не документований публічний API, а той, з яким працює сайт zakaz.ua,
 * тож усе, що приходить, перевіряємо, а при збої пошук іде в Open Food Facts.
 */
import { CATALOG_CODE_RE, CATALOG_IMAGE_RE, LIMITS, canonicalEan } from '../shared/model.js'
import { round1 } from '../shared/nutrition.js'
import { obj, str } from '../shared/validate.js'
import { fetchJson, parseNumber, rankByQuery } from './catalog.js'
import { HttpError, timeLeft } from './http.js'
import { USER_AGENT } from './off.js'

/** @typedef {import('../shared/model.js').FoodItem} FoodItem */

/** Auchan, Київ: найширший асортимент і найкраще покриття КБЖВ серед мереж Zakaz.ua. */
const STORE_ID = '48246401'
const SEARCH_URL = `https://stores-api.zakaz.ua/stores/${STORE_ID}/products/search/`
/** Беремо з запасом: пошук неточний, тож пересортовуємо самі. */
const PER_PAGE = 40
const TIMEOUT_MS = 4000
const KJ_PER_KCAL = 4.184

/**
 * Калорії з «108.00ккал»; якщо вказано лише кДж — переводимо.
 * @param {unknown} v
 */
function kcalOf(v) {
  const n = parseNumber(v)
  if (n === null) return null
  return typeof v === 'string' && /кдж|kj/i.test(v) && !/ккал|kcal/i.test(v) ? n / KJ_PER_KCAL : n
}

/**
 * Товар із пошуку Zakaz.ua → FoodItem, або null, якщо товар непридатний (немає калорій тощо).
 * @param {unknown} product
 * @returns {FoodItem | null}
 */
export function normalizeZakaz(product) {
  const p = obj(product)
  const nf = obj(p.nutrition_facts)

  const kcal = kcalOf(nf.ingredient_energy)
  if (kcal === null || kcal < 0 || kcal > LIMITS.per100.kcal) return null
  /** @param {string} key */
  const macro = (key) => parseNumber(nf[key]) ?? 0
  const protein = macro('ingredient_protein')
  const fat = macro('ingredient_fat')
  const carbs = macro('ingredient_carbohydrates')
  if ([protein, fat, carbs].some((v) => v < 0 || v > LIMITS.per100.macro)) return null

  const code = typeof p.ean === 'string' && CATALOG_CODE_RE.test(p.ean) ? p.ean : null
  if (!code) return null
  const name = str(p.title, LIMITS.nameLength)
  if (!name) return null

  const image = obj(p.img).s200x200
  return {
    id: `zakaz-${code}`,
    name,
    brand: str(obj(p.producer).trademark, LIMITS.brandLength) || null,
    per100: { kcal: round1(kcal), protein: round1(protein), fat: round1(fat), carbs: round1(carbs) },
    servingGrams: null,
    source: 'zakaz',
    offCode: code,
    barcode: canonicalEan(code),
    imageUrl: typeof image === 'string' && CATALOG_IMAGE_RE.test(image) ? image : null,
  }
}

/**
 * Пошук у Zakaz.ua. Кидає HttpError, якщо каталог недоступний.
 * @param {string} query нормалізований запит
 * @param {{ deadline?: number, fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<FoodItem[]>}
 */
export async function searchZakaz(query, { deadline = Infinity, fetchImpl = fetch } = {}) {
  const data = obj(
    await fetchJson(`${SEARCH_URL}?q=${encodeURIComponent(query)}&per_page=${PER_PAGE}`, {
      timeout: Math.min(TIMEOUT_MS, timeLeft(deadline)),
      fetchImpl,
      // без цього назви приходять англійською
      headers: { 'Accept-Language': 'uk' },
    }),
  )
  const products = (Array.isArray(data.results) ? data.results : [])
    .map(obj)
    .filter((p) => typeof p.title === 'string')

  /** @type {FoodItem[]} */
  const results = []
  const seen = new Set()
  for (const p of rankByQuery(/** @type {(Record<string, unknown> & { title: string })[]} */ (products), query)) {
    const item = normalizeZakaz(p)
    if (!item || seen.has(item.id)) continue
    seen.add(item.id)
    results.push(item)
  }
  return results
}

/**
 * Товар за штрихкодом: картка товару Zakaz.ua (у них EAN — 14 цифр із нулем попереду).
 * Немає товару чи калорій → null; каталог недоступний → HttpError.
 * @param {string} ean canonicalEan
 * @param {{ deadline?: number, fetchImpl?: typeof fetch }} [opts]
 * @returns {Promise<FoodItem | null>}
 */
export async function findZakazByEan(ean, { deadline = Infinity, fetchImpl = fetch } = {}) {
  const timeout = Math.min(TIMEOUT_MS, timeLeft(deadline))
  if (timeout <= 0) throw new HttpError(502, 'catalog_unavailable')
  /** @type {Response} */
  let res
  try {
    res = await fetchImpl(`https://stores-api.zakaz.ua/stores/${STORE_ID}/products/${ean.padStart(14, '0')}/`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', 'Accept-Language': 'uk' },
      signal: AbortSignal.timeout(timeout),
    })
  } catch {
    throw new HttpError(502, 'catalog_unavailable')
  }
  if (res.status === 404) return null
  if (!res.ok) throw new HttpError(502, 'catalog_unavailable')
  const data = obj(await res.json().catch(() => null))
  const item = normalizeZakaz(data.product ?? data)
  return item && item.barcode === ean ? item : null
}
