/**
 * GET /api/day?date=YYYY-MM-DD → { entries: Entry[] } усі записи дня, за часом додавання.
 */
import { handler, query, send } from '../server/http.js'
import { KEYS, parseStored, redis } from '../server/store.js'
import { requireDate, sanitizeEntry } from '../shared/validate.js'

export default handler(['GET'], async (req, res) => {
  const date = requireDate(query(req, 'date'))
  const raw = (await redis().hgetall(KEYS.day(date))) ?? {}

  const entries = Object.values(raw)
    .flatMap((value) => {
      try {
        return [sanitizeEntry(parseStored(value))]
      } catch {
        return [] // зіпсований запис не повинен ламати весь день
      }
    })
    .sort((a, b) => a.createdAt - b.createdAt)

  send(res, 200, { entries })
})
