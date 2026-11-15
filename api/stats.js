/**
 * GET /api/stats → { days: DaySummary[] } підсумки всіх днів із записами (для графіків і теплової карти).
 */
import { handler, send } from '../server/http.js'
import { loadSummaries } from '../server/stats.js'
import { redis } from '../server/store.js'

export default handler(['GET'], async (_req, res) => {
  send(res, 200, { days: await loadSummaries(redis()) })
})
