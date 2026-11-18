/**
 * «Як іде схуднення» на сервері: що дає найбільше калорій — із записів за 28 днів
 * (решта аналізу рахується на клієнті з підсумків днів і замірів, shared/insights.js).
 */
import { WINDOW_DAYS, addDays, foodBreakdown } from '../shared/insights.js'
import { entriesOf } from './stats.js'
import { KEYS, parseStored } from './store.js'

/** @typedef {import('./store.js').RedisClient} RedisClient */
/** @typedef {import('../shared/insights.js').FoodBreakdown} FoodBreakdown */

const DAY_SEC = 24 * 60 * 60

/**
 * Що дає найбільше калорій за WINDOW_DAYS завершених днів до today. Записи всіх днів —
 * паралельно (по одному HGETALL на день), результат кешується до кінця доби: минулі дні вже не зміняться.
 * @param {RedisClient} r @param {string} today
 * @returns {Promise<FoodBreakdown>}
 */
export async function loadFoodBreakdown(r, today) {
  const key = KEYS.foodMix(today)
  const cached = parseStored(await r.get(key))
  if (cached && typeof cached === 'object' && Array.isArray(/** @type {FoodBreakdown} */ (cached).foods)) {
    return /** @type {FoodBreakdown} */ (cached)
  }
  const dates = Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(today, -(i + 1)))
  const days = await Promise.all(dates.map((d) => r.hgetall(KEYS.day(d)).then(entriesOf)))
  const result = foodBreakdown(days.flat(), dates.length)
  await r.set(key, result, { ex: DAY_SEC })
  return result
}
