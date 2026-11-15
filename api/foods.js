/**
 * «Мої страви» — особистий каталог.
 * GET    /api/foods             → { foods: Food[], usage } (нещодавно змінені першими;
 *                                  usage — id → { n, last } для «Нещодавні» / «Часті»)
 * PUT    /api/foods?id=… {food} → { applied, food }  (перемагає більший updatedAt)
 * DELETE /api/foods?id=…        → { ok }
 *
 * Каталог особистий і невеликий, тож віддаємо його цілком,
 * а фільтрує клієнт — пошук по своїх стравах миттєвий.
 */
import { handler, HttpError, query, readJson, send } from '../server/http.js'
import { KEYS, parseStored, redis } from '../server/store.js'
import { loadUsage } from '../server/usage.js'
import { requireId, sanitizeFood } from '../shared/validate.js'

/** @param {unknown} value */
function storedFood(value) {
  try {
    return sanitizeFood(parseStored(value))
  } catch {
    return null
  }
}

export default handler(['GET', 'PUT', 'DELETE'], async (req, res) => {
  const r = redis()

  if (req.method === 'GET') {
    const raw = (await r.hgetall(KEYS.foods)) ?? {}
    const foods = Object.values(raw)
      .map(storedFood)
      .filter((f) => f !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt)
    return send(res, 200, { foods, usage: await loadUsage(r) })
  }

  const id = requireId(query(req, 'id'))

  if (req.method === 'PUT') {
    const food = sanitizeFood(readJson(req).food)
    if (food.id !== id) throw new HttpError(400, 'id_mismatch')
    const existing = storedFood(await r.hget(KEYS.foods, id))
    if (existing && existing.updatedAt > food.updatedAt) {
      return send(res, 200, { applied: false, food: existing })
    }
    await r.hset(KEYS.foods, { [id]: food })
    return send(res, 200, { applied: true, food })
  }

  await r.hdel(KEYS.foods, id)
  send(res, 200, { ok: true })
})
