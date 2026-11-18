/**
 * GET /api/search?q=…   → { results: FoodItem[] } — публічний пошук продуктів.
 * GET /api/search?ean=… → { results: [FoodItem] | [] } — продукт за штрихкодом (сканер),
 *                          ті самі джерела по черзі, перший знайдений перемагає.
 *
 * Джерела по черзі, наступне — лише коли попередні разом знайшли замало (< MIN_RESULTS)
 * або впали:
 *   1. Сільпо (server/silpo.js) — українські назви й товари з полиць;
 *   2. Zakaz.ua (server/zakaz.js) — Auchan: ті самі бренди й те, чого немає в Сільпо;
 *   3. Open Food Facts (server/off.js) — бренди з інших країн, запити російською.
 *
 * Запит іде через наш сервер, а не з браузера напряму: так джерела бачать коректний
 * User-Agent, ми відсіюємо продукти без калорій і кешуємо відповіді на добу.
 *
 * Два рівні кешу, щоб не витрачати безкоштовні ліміти:
 *   1. CDN Vercel — повторний запит узагалі не викликає функцію;
 *   2. Redis — якщо CDN-копії в цьому регіоні немає, джерела не смикаємо.
 * Неповна відповідь (джерело впало, порожньо) кешується лише в Redis і коротко.
 */
import { HttpError, handler, query, send, sendCdnCached } from '../server/http.js'
import { nameKey } from '../server/catalog.js'
import { MAX_RESULTS, findOffByEan, searchOff } from '../server/off.js'
import { findSilpoByEan, searchSilpo } from '../server/silpo.js'
import { KEYS, parseStored, redis } from '../server/store.js'
import { findZakazByEan, searchZakaz } from '../server/zakaz.js'
import { LIMITS, canonicalEan, normalizeQuery } from '../shared/model.js'

/** @typedef {import('../shared/model.js').FoodItem} FoodItem */

const CACHE_TTL_SEC = 24 * 60 * 60
const SHORT_TTL_SEC = 10 * 60
/** Менше стількох результатів — питаємо наступне джерело. */
const MIN_RESULTS = 5
/** Запас до ліміту функції (maxDuration 10 с у vercel.json). */
const BUDGET_MS = 8500

/**
 * Джерела по черзі. `budgetMs` — скільки найбільше чекаємо джерело, щоб завислий
 * магазин не з'їв час наступних; останнє бере все, що лишилось.
 * @type {{ budgetMs: number, search: (q: string, deadline: number) => Promise<{ results: FoodItem[], partial?: boolean }> }[]}
 */
const SOURCES = [
  { budgetMs: 3500, search: (q, deadline) => searchSilpo(q, { deadline }) },
  { budgetMs: 3500, search: async (q, deadline) => ({ results: await searchZakaz(q, { deadline }) }) },
  { budgetMs: BUDGET_MS, search: async (q, deadline) => ({ results: await searchOff(q, { deadline }) }) },
]

/** Знайдене за штрихкодом не змінюється — тримаємо довго. */
const EAN_TTL_SEC = 30 * 24 * 60 * 60

/**
 * @type {{ budgetMs: number, find: (ean: string, deadline: number) => Promise<FoodItem | null> }[]}
 */
const EAN_SOURCES = [
  { budgetMs: 3500, find: (ean, deadline) => findSilpoByEan(ean, { deadline }) },
  { budgetMs: 3500, find: (ean, deadline) => findZakazByEan(ean, { deadline }) },
  { budgetMs: BUDGET_MS, find: (ean, deadline) => findOffByEan(ean, { deadline }) },
]

export default handler(['GET'], async (req, res) => {
  const rawEan = query(req, 'ean')
  if (rawEan !== undefined) {
    const ean = canonicalEan(rawEan)
    if (!ean) throw new HttpError(400, 'invalid_ean')
    return byEan(ean, res)
  }

  const raw = query(req, 'q')
  const q = normalizeQuery(typeof raw === 'string' ? raw : '')
  if (q.length < LIMITS.searchQuery.min) throw new HttpError(400, 'query_too_short')

  const r = redis()
  const key = KEYS.search(q)
  const cached = parseStored(await r.get(key))
  if (Array.isArray(cached)) return sendCdnCached(res, { results: cached, cached: true }, CACHE_TTL_SEC)

  const { results, complete } = await searchCatalogs(q, Date.now() + BUDGET_MS)
  if (!complete || results.length === 0) {
    await r.set(key, results, { ex: SHORT_TTL_SEC })
    return send(res, 200, { results, cached: false })
  }
  await r.set(key, results, { ex: CACHE_TTL_SEC })
  sendCdnCached(res, { results, cached: false }, CACHE_TTL_SEC)
})

/**
 * Обходить джерела, поки не набереться MIN_RESULTS. Кидає 502, лише якщо не відповіло жодне.
 * Дублікати між джерелами (та сама назва) прибираються — перше джерело важливіше.
 * `complete` — усі опитані джерела відповіли повністю (можна кешувати на добу).
 * @param {string} q
 * @param {number} deadline
 * @returns {Promise<{ results: FoodItem[], complete: boolean }>}
 */
async function searchCatalogs(q, deadline) {
  /** @type {FoodItem[]} */
  const results = []
  const seen = new Set()
  let complete = true
  let anyOk = false
  for (const source of SOURCES) {
    if (results.length >= MIN_RESULTS) break
    try {
      const found = await source.search(q, Math.min(deadline, Date.now() + source.budgetMs))
      anyOk = true
      if (found.partial) complete = false
      for (const item of found.results) {
        const k = nameKey(item.name)
        if (seen.has(k)) continue
        seen.add(k)
        results.push(item)
      }
    } catch {
      complete = false
    }
  }
  if (!anyOk) throw new HttpError(502, 'catalog_unavailable')
  return { results: results.slice(0, MAX_RESULTS), complete }
}

/**
 * Пошук за штрихкодом із кешем: знайдене — 30 діб (і CDN), «немає» — доба,
 * неповна відповідь (джерело впало, а інші не знайшли) — 10 хвилин лише в Redis.
 * @param {string} ean
 * @param {import('../server/http.js').ApiResponse} res
 */
async function byEan(ean, res) {
  const r = redis()
  const key = KEYS.ean(ean)
  const cached = parseStored(await r.get(key))
  if (Array.isArray(cached)) return send(res, 200, { results: cached, cached: true })

  const deadline = Date.now() + BUDGET_MS
  let complete = true
  let anyOk = false
  for (const source of EAN_SOURCES) {
    try {
      const item = await source.find(ean, Math.min(deadline, Date.now() + source.budgetMs))
      anyOk = true
      if (item) {
        await r.set(key, [item], { ex: EAN_TTL_SEC })
        return sendCdnCached(res, { results: [item], cached: false }, CACHE_TTL_SEC)
      }
    } catch {
      complete = false
    }
  }
  if (!anyOk) throw new HttpError(502, 'catalog_unavailable')
  await r.set(key, [], { ex: complete ? CACHE_TTL_SEC : SHORT_TTL_SEC })
  send(res, 200, { results: [], cached: false })
}
