/**
 * Підписка на пуш-сповіщення.
 * GET    /api/push                                → { publicKey, subscribed: кількість пристроїв }
 * POST   /api/push { subscription, tzOffset }     → { ok }  зберегти/оновити підписку пристрою
 * POST   /api/push { action: 'test' }             → { sent } тестове сповіщення на всі пристрої
 * DELETE /api/push { endpoint }                   → { ok }  відписати пристрій
 */
import { handler, HttpError, readJson, send } from '../server/http.js'
import { loadSubscriptions, sanitizeSubscription, sendToAll, vapidPublicKey } from '../server/push.js'
import { KEYS, redis } from '../server/store.js'

export default handler(['GET', 'POST', 'DELETE'], async (req, res) => {
  const r = redis()

  if (req.method === 'GET') {
    const subs = await loadSubscriptions(r)
    return send(res, 200, { publicKey: vapidPublicKey(), subscribed: subs.length })
  }

  const body = readJson(req)

  if (req.method === 'DELETE') {
    if (typeof body.endpoint !== 'string') throw new HttpError(400, 'invalid_endpoint')
    await r.hdel(KEYS.push, body.endpoint)
    return send(res, 200, { ok: true })
  }

  if (body.action === 'test') {
    const sent = await sendToAll(r, await loadSubscriptions(r), [
      { title: 'Перевірка зв’язку 📡', body: 'Працює. Тепер не відкрутишся.', tag: 'test' },
    ])
    return send(res, 200, { sent })
  }

  const subscription = sanitizeSubscription(body.subscription)
  const tz = Number(body.tzOffset)
  await r.hset(KEYS.push, {
    [subscription.endpoint]: { subscription, tzOffset: Number.isInteger(tz) && Math.abs(tz) <= 840 ? tz : 0, createdAt: Date.now() },
  })
  send(res, 200, { ok: true })
})
