/**
 * Записи щоденника. id генерує клієнт, тож обидва запити ідемпотентні —
 * повторна відправка з черги синхронізації нічого не зламає.
 *
 * PUT    /api/entries?id=…          { entry } → створити або замінити
 * DELETE /api/entries?id=…&date=…            → видалити
 *
 * Конфлікти: перемагає версія з більшим updatedAt. Якщо на сервері новіша,
 * відповідь { applied: false, entry } з серверною версією.
 */
import { handler, HttpError, query, readJson, send } from '../server/http.js'
import { KEYS, parseStored, redis } from '../server/store.js'
import { requireDate, requireId, sanitizeEntry } from '../shared/validate.js'

/** @param {unknown} value */
function storedEntry(value) {
  try {
    return sanitizeEntry(parseStored(value))
  } catch {
    return null
  }
}

export default handler(['PUT', 'DELETE'], async (req, res) => {
  const id = requireId(query(req, 'id'))
  const r = redis()

  if (req.method === 'PUT') {
    const entry = sanitizeEntry(readJson(req).entry)
    if (entry.id !== id) throw new HttpError(400, 'id_mismatch')

    const key = KEYS.day(entry.date)
    const existing = storedEntry(await r.hget(key, id))
    if (existing && existing.updatedAt > entry.updatedAt) {
      return send(res, 200, { applied: false, entry: existing })
    }
    await r.hset(key, { [id]: entry })
    return send(res, 200, { applied: true, entry })
  }

  const date = requireDate(query(req, 'date'))
  await r.hdel(KEYS.day(date), id)
  send(res, 200, { ok: true })
})
