/**
 * Спільне для магазинних каталогів (server/silpo.js, server/zakaz.js):
 * запит JSON з таймаутом, розбір чисел і пересортування видачі під запит.
 */
import { HttpError } from './http.js'
import { USER_AGENT } from './off.js'

/** Слова з назви/запиту: літери й цифри, апостроф — один варіант. @param {string} s */
function words(s) {
  return s
    .toLowerCase()
    .replace(/[’ʼ`]/g, "'")
    .split(/[^\p{L}\d']+/u)
    .filter(Boolean)
}

/**
 * Основа слова без закінчення: «курячі» → «куря», «яйця» → «яйц», «сир» → «сир».
 * Грубо, але досить, щоб «курячі яйця» знаходило «Яйця курячі С1».
 * @param {string} w
 */
function stem(w) {
  return w.length > 4 ? w.slice(0, -2) : w.length === 4 ? w.slice(0, 3) : w
}

/**
 * Пересортування видачі під запит (пошук магазинів неточний): спершу ті, де є більше
 * слів запиту, серед них — ті, що з такого слова починаються («Банан чіпси» вище за
 * «Пюре з бананом»). Товари без жодного слова запиту відкидаються; решта зберігає порядок джерела.
 * @template {{ title: string }} T
 * @param {T[]} items
 * @param {string} query
 * @returns {T[]}
 */
export function rankByQuery(items, query) {
  const stems = words(query).map(stem)
  if (stems.length === 0) return items
  return items
    .map((item, index) => {
      const title = words(item.title)
      const matched = stems.filter((s) => title.some((w) => w.startsWith(s))).length
      const leads = stems.some((s) => title[0]?.startsWith(s)) ? 1 : 0
      return { item, index, score: matched * 2 + leads, matched }
    })
    .filter((r) => r.matched > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((r) => r.item)
}

/**
 * Перше число з поля каталогу: 16, "16", "489,6", "14.00г".
 * @param {unknown} v
 * @returns {number | null}
 */
export function parseNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const m = typeof v === 'string' ? v.match(/\d+(?:[.,]\d+)?/) : null
  return m ? Number(m[0].replace(',', '.')) : null
}

/**
 * Ключ для прибирання дублікатів між джерелами: назва без регістру, пробілів і лапок.
 * @param {string} name
 */
export function nameKey(name) {
  return name.toLowerCase().replace(/[^\p{L}\d]+/gu, '')
}

/**
 * GET → JSON. Будь-яка проблема (мережа, таймаут, не 2xx, не JSON) — HttpError 502.
 * @param {string} url
 * @param {{ timeout: number, fetchImpl: typeof fetch, headers?: Record<string, string> }} opts
 * @returns {Promise<unknown>}
 */
export async function fetchJson(url, { timeout, fetchImpl, headers = {} }) {
  if (timeout <= 0) throw new HttpError(502, 'catalog_unavailable')
  try {
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...headers },
      signal: AbortSignal.timeout(timeout),
    })
    if (!res.ok) throw new Error(String(res.status))
    return await res.json()
  } catch {
    throw new HttpError(502, 'catalog_unavailable')
  }
}
