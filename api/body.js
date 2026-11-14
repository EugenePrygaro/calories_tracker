/**
 * Заміри тіла: вага й об'єми, один запис на день.
 * GET    /api/body                  → { records: BodyRecord[] } (за датою, від старих)
 * PUT    /api/body?date=… {record}  → { applied, record }  (перемагає більший updatedAt)
 * DELETE /api/body?date=…           → { ok }
 *
 * Записів небагато (≤ 1 на день), тож історія віддається цілком одним HGETALL —
 * графік будується на клієнті без додаткових запитів.
 */
import { handler, HttpError, query, readJson, send } from '../server/http.js'
import { KEYS, parseStored, redis } from '../server/store.js'
import { requireDate, sanitizeBodyRecord } from '../shared/validate.js'

/** @param {unknown} value */
function storedRecord(value) {
  try {
    return sanitizeBodyRecord(parseStored(value))
  } catch {
    return null
  }
}

export default handler(['GET', 'PUT', 'DELETE'], async (req, res) => {
  const r = redis()

  if (req.method === 'GET') {
    const raw = (await r.hgetall(KEYS.body)) ?? {}
    const records = Object.values(raw)
      .map(storedRecord)
      .filter((x) => x !== null)
      .sort((a, b) => a.date.localeCompare(b.date))
    return send(res, 200, { records })
  }

  const date = requireDate(query(req, 'date'))

  if (req.method === 'PUT') {
    const record = sanitizeBodyRecord(readJson(req).record)
    if (record.date !== date) throw new HttpError(400, 'date_mismatch')
    const existing = storedRecord(await r.hget(KEYS.body, date))
    if (existing && existing.updatedAt > record.updatedAt) {
      return send(res, 200, { applied: false, record: existing })
    }
    await r.hset(KEYS.body, { [date]: record })
    return send(res, 200, { applied: true, record })
  }

  await r.hdel(KEYS.body, date)
  send(res, 200, { ok: true })
})
