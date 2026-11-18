/**
 * GET /api/stats               → { days: DaySummary[] } підсумки всіх днів із записами (графіки й теплова карта).
 * GET /api/stats?foods=<дата>  → { foods: FoodBreakdown } що дає найбільше калорій за 28 днів до дати
 *                                («Як іде схуднення»; дата — сьогодні за місцевим часом клієнта).
 */
import { handler, query, send } from '../server/http.js'
import { loadFoodBreakdown } from '../server/insights.js'
import { loadSummaries } from '../server/stats.js'
import { redis } from '../server/store.js'
import { requireDate } from '../shared/validate.js'

export default handler(['GET'], async (req, res) => {
  const foodsFor = query(req, 'foods')
  if (foodsFor !== undefined) return send(res, 200, { foods: await loadFoodBreakdown(redis(), requireDate(foodsFor)) })
  send(res, 200, { days: await loadSummaries(redis()) })
})
