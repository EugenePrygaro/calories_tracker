/**
 * Сховище: Upstash Redis.
 *
 * Ключі:
 *   ct:day:<YYYY-MM-DD>  hash    id запису → Entry (усі записи одного дня)
 *   ct:profile           string  Profile { goals, updatedAt }
 *   ct:foods             hash    id страви → Food («Мої страви»)
 *   ct:body              hash    дата → BodyRecord (вага й об'єми, один запис на день)
 *   ct:game              string  GameState: калокоїни, стрік, щити, магазин, ачівки
 *   ct:summary           hash    дата → DaySummary (підсумок дня для статистики, див. server/stats.js)
 *   ct:summary:ready     string  позначка: підсумки вже побудовано з наявних днів
 *   ct:usage             hash    id страви → { n, last } — «Нещодавні» й «Часті» в пошуку (server/usage.js)
 *   ct:usage:ready       string  позначка: лічильники вже побудовано з історії
 *   ct:push              hash    endpoint → підписка пристрою на пуші (server/push.js)
 *   ct:push:state        string  що й коли вже надіслано вечірнім кроном (shared/notify.js)
 *   ct:search:<запит>    string  FoodItem[] — кеш публічного пошуку (Сільпо, Zakaz.ua, OFF), TTL 1 доба
 *   ct:ean:<штрихкод>    string  FoodItem[] (0 або 1) — кеш пошуку за штрихкодом, TTL 30 діб (не знайдено — доба)
 *
 * Один hash на день: знімок дня читається одним HGETALL,
 * а зміна чи видалення запису — один HSET / HDEL.
 */
import { Redis } from '@upstash/redis'
import { HttpError } from './http.js'

/**
 * Лише ті команди, які використовує проєкт (див. також scripts/memory-redis.js).
 * @typedef {{
 *   get(key: string): Promise<unknown>,
 *   set(key: string, value: unknown, opts?: { ex: number }): Promise<unknown>,
 *   hget(key: string, field: string): Promise<unknown>,
 *   hgetall(key: string): Promise<Record<string, unknown> | null>,
 *   hset(key: string, values: Record<string, unknown>): Promise<unknown>,
 *   hdel(key: string, ...fields: string[]): Promise<unknown>,
 *   keys(pattern: string): Promise<string[]>,
 * }} RedisClient
 */

export const KEYS = {
  /** @param {string} date */
  day: (date) => `ct:day:${date}`,
  profile: 'ct:profile',
  foods: 'ct:foods',
  body: 'ct:body',
  game: 'ct:game',
  summary: 'ct:summary',
  summaryReady: 'ct:summary:ready',
  usage: 'ct:usage',
  usageReady: 'ct:usage:ready',
  push: 'ct:push',
  pushState: 'ct:push:state',
  /** @param {string} query нормалізований запит */
  search: (query) => `ct:search:${query}`,
  /** @param {string} ean canonicalEan */
  ean: (ean) => `ct:ean:${ean}`,
}

/** @type {RedisClient | null} */
let client = null

/** Для тестів і локального сервера: підставити свій клієнт. @param {RedisClient} custom */
export function setRedisClient(custom) {
  client = custom
}

/** @returns {RedisClient} */
export function redis() {
  if (client) return client
  // Інтеграція Upstash у Vercel створює KV_REST_API_*, прямий акаунт — UPSTASH_REDIS_REST_*.
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN
  if (!url || !token) throw new HttpError(500, 'storage_not_configured')
  client = /** @type {RedisClient} */ (/** @type {unknown} */ (new Redis({ url, token })))
  return client
}

/**
 * Upstash зазвичай сам розбирає JSON, але значення могло прийти й рядком.
 * @param {unknown} value
 */
export function parseStored(value) {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}
