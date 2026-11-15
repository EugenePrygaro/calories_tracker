/**
 * Як часто й коли востаннє додавали кожну страву — для «Нещодавні» / «Часті» в пошуку.
 * ct:usage — hash: id страви → { n, last }. Оновлюється, коли новий запис додано зі страви;
 * для історії, записаної раніше, будується один раз за назвами страв (позначка ct:usage:ready).
 */
import { DATE_RE } from '../shared/model.js'
import { obj, sanitizeEntry, sanitizeFood } from '../shared/validate.js'
import { KEYS, parseStored } from './store.js'

/** @typedef {import('./store.js').RedisClient} RedisClient */
/** @typedef {{ n: number, last: number }} FoodUsage */

/** @param {unknown} v @returns {FoodUsage | null} */
function sanitizeUsage(v) {
  const o = obj(parseStored(v))
  const n = typeof o.n === 'number' && Number.isFinite(o.n) ? Math.max(Math.floor(o.n), 0) : 0
  const last = typeof o.last === 'number' && Number.isFinite(o.last) ? o.last : 0
  return n > 0 ? { n, last } : null
}

/**
 * Страву щойно додали в щоденник.
 * @param {RedisClient} r @param {string} foodId @param {number} at
 */
export async function recordUsage(r, foodId, at) {
  const prev = sanitizeUsage(await r.hget(KEYS.usage, foodId))
  await r.hset(KEYS.usage, { [foodId]: { n: (prev?.n ?? 0) + 1, last: Math.max(prev?.last ?? 0, at) } })
}

/**
 * Лічильники всіх страв. Уперше — будує їх з наявних днів, зіставляючи записи зі стравами за назвою.
 * @param {RedisClient} r @returns {Promise<Record<string, FoodUsage>>}
 */
export async function loadUsage(r) {
  if (!(await r.get(KEYS.usageReady))) {
    /** @type {Map<string, string>} назва (без регістру) → id страви */
    const byName = new Map()
    for (const v of Object.values((await r.hgetall(KEYS.foods)) ?? {})) {
      try {
        const f = sanitizeFood(parseStored(v))
        byName.set(f.name.trim().toLowerCase(), f.id)
      } catch {
        // зіпсована страва — пропускаємо
      }
    }
    /** @type {Record<string, FoodUsage>} */
    const built = {}
    for (const key of await r.keys(KEYS.day('*'))) {
      if (!DATE_RE.test(key.slice(KEYS.day('').length))) continue
      for (const v of Object.values((await r.hgetall(key)) ?? {})) {
        try {
          const e = sanitizeEntry(parseStored(v))
          const id = byName.get(e.name.trim().toLowerCase())
          if (!id) continue
          const u = (built[id] ??= { n: 0, last: 0 })
          u.n++
          u.last = Math.max(u.last, e.createdAt)
        } catch {
          // пропускаємо
        }
      }
    }
    if (Object.keys(built).length) await r.hset(KEYS.usage, built)
    await r.set(KEYS.usageReady, 1)
  }
  /** @type {Record<string, FoodUsage>} */
  const out = {}
  for (const [id, v] of Object.entries((await r.hgetall(KEYS.usage)) ?? {})) {
    const u = sanitizeUsage(v)
    if (u) out[id] = u
  }
  return out
}
