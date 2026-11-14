/**
 * Записи щоденника. id генерує клієнт, тож обидва запити ідемпотентні —
 * повторна відправка (наприклад, після обриву мережі) нічого не зламає.
 *
 * PUT    /api/entries?id=…          { entry } → створити або замінити
 *        &source=copy                          запис скопійовано з учора (рахується для ачівки)
 * DELETE /api/entries?id=…&date=…            → видалити
 *
 * Конфлікти: перемагає версія з більшим updatedAt. Якщо на сервері новіша,
 * відповідь { applied: false, entry } з серверною версією.
 */
import { handler, HttpError, query, readJson, send } from '../server/http.js'
import { processEntrySaved } from '../server/game.js'
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

/**
 * Зсув часового поясу клієнта (Date#getTimezoneOffset, хвилини) із заголовка X-TZ-Offset.
 * @param {import('../server/http.js').ApiRequest} req
 */
function tzOffset(req) {
  const raw = Number(req.headers['x-tz-offset'])
  return Number.isInteger(raw) && Math.abs(raw) <= 840 ? raw : 0
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
    // Нагороди рахує сервер: клієнт отримує вже готовий стан гри й події для анімацій.
    // Запис уже збережено. Якщо гра не порахувалась (збій Redis) — не валимо запит,
    // інакше клієнт відкотить збережений запис і повтор створить дублікат.
    let game
    try {
      game = await processEntrySaved(r, entry, existing, {
        tzOffset: tzOffset(req),
        copiedFromYesterday: query(req, 'source') === 'copy',
      })
    } catch (err) {
      console.error('game processing failed', err)
    }
    return send(res, 200, { applied: true, entry, ...(game ? { game } : {}) })
  }

  const date = requireDate(query(req, 'date'))
  await r.hdel(KEYS.day(date), id)
  send(res, 200, { ok: true })
})
