/**
 * GET /api/search?q=… → { results: FoodItem[] } з Open Food Facts.
 *
 * Запит іде через наш сервер, а не з браузера напряму: так OFF бачить коректний
 * User-Agent, ми відсіюємо продукти без `energy-kcal_100g` і кешуємо відповіді
 * на добу (OFF повільний і має ліміти на кількість запитів).
 *
 * Два рівні кешу, щоб не витрачати безкоштовні ліміти:
 *   1. CDN Vercel — повторний запит узагалі не викликає функцію;
 *   2. Redis — якщо CDN-копії в цьому регіоні немає, OFF не смикаємо.
 */
import { HttpError, handler, query, send, sendCdnCached } from '../server/http.js'
import { searchOff } from '../server/off.js'
import { KEYS, parseStored, redis } from '../server/store.js'
import { LIMITS, normalizeQuery } from '../shared/model.js'

const CACHE_TTL_SEC = 24 * 60 * 60
const EMPTY_TTL_SEC = 10 * 60

export default handler(['GET'], async (req, res) => {
  const raw = query(req, 'q')
  const q = normalizeQuery(typeof raw === 'string' ? raw : '')
  if (q.length < LIMITS.searchQuery.min) throw new HttpError(400, 'query_too_short')

  const r = redis()
  const key = KEYS.offSearch(q)
  const cached = parseStored(await r.get(key))
  if (Array.isArray(cached)) return sendCdnCached(res, { results: cached, cached: true }, CACHE_TTL_SEC)

  const results = await searchOff(q)
  // Порожня відповідь може бути збоєм OFF — кешуємо коротко і не на CDN
  if (results.length === 0) {
    await r.set(key, results, { ex: EMPTY_TTL_SEC })
    return send(res, 200, { results, cached: false })
  }
  await r.set(key, results, { ex: CACHE_TTL_SEC })
  sendCdnCached(res, { results, cached: false }, CACHE_TTL_SEC)
})
