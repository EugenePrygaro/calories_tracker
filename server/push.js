/**
 * Web Push: підписки пристроїв (ct:push — endpoint → підписка), відправка через web-push (VAPID).
 *
 * Змінні середовища (Vercel → Settings → Environment Variables):
 *   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY — пара ключів (згенерувати: npx web-push generate-vapid-keys)
 *   VAPID_SUBJECT — mailto: або https-адреса власника (вимога протоколу)
 *   CRON_SECRET   — довільний секрет; Vercel Cron передає його в Authorization, чужі запити відхиляємо
 */
import { sendNotification, setVapidDetails } from 'web-push'
import { obj } from '../shared/validate.js'
import { newPushState } from '../shared/notify.js'
import { HttpError } from './http.js'
import { KEYS, parseStored } from './store.js'

/** @typedef {import('./store.js').RedisClient} RedisClient */
/** @typedef {import('../shared/notify.js').PushMessage} PushMessage */
/** @typedef {import('../shared/notify.js').PushState} PushState */
/** @typedef {{ endpoint: string, keys: { p256dh: string, auth: string } }} Subscription */
/** @typedef {{ subscription: Subscription, tzOffset: number, createdAt: number }} StoredSub */

export function vapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY ?? ''
}

let configured = false
function configure() {
  if (configured) return
  const pub = process.env.VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (!pub || !priv) throw new HttpError(500, 'push_not_configured')
  setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:owner@example.com', pub, priv)
  configured = true
}

/** Перевірка підписки з браузера (PushSubscription.toJSON()). @param {unknown} input @returns {Subscription} */
export function sanitizeSubscription(input) {
  const o = obj(input)
  const keys = obj(o.keys)
  const ok = (/** @type {unknown} */ v, max = 512) => typeof v === 'string' && v.length > 0 && v.length <= max
  if (!ok(o.endpoint, 1024) || !String(o.endpoint).startsWith('https://') || !ok(keys.p256dh) || !ok(keys.auth)) {
    throw new HttpError(400, 'invalid_subscription')
  }
  return { endpoint: String(o.endpoint), keys: { p256dh: String(keys.p256dh), auth: String(keys.auth) } }
}

/** @param {RedisClient} r @returns {Promise<StoredSub[]>} */
export async function loadSubscriptions(r) {
  return Object.values((await r.hgetall(KEYS.push)) ?? {}).flatMap((v) => {
    const o = obj(parseStored(v))
    try {
      const tz = Number(o.tzOffset)
      return [{ subscription: sanitizeSubscription(o.subscription), tzOffset: Number.isInteger(tz) && Math.abs(tz) <= 840 ? tz : 0, createdAt: Number(o.createdAt) || 0 }]
    } catch {
      return []
    }
  })
}

/** @param {RedisClient} r @returns {Promise<PushState>} */
export async function loadPushState(r) {
  const o = obj(parseStored(await r.get(KEYS.pushState)))
  const s = newPushState()
  if (typeof o.lastRunDate === 'string') s.lastRunDate = o.lastRunDate
  if (typeof o.lastRescue === 'number') s.lastRescue = o.lastRescue
  if (typeof o.shieldsUsedSeen === 'number') s.shieldsUsedSeen = o.shieldsUsedSeen
  return s
}

/** @type {(sub: Subscription, payload: string) => Promise<unknown>} */
let sender = async (sub, payload) => {
  configure()
  return sendNotification(sub, payload, { TTL: 6 * 3600, urgency: 'normal' })
}

/** Для тестів: підмінити відправку. @param {typeof sender} fn */
export function setPushSender(fn) {
  sender = fn
}

/**
 * Надіслати повідомлення на всі пристрої. Пристрої, яких більше немає (404/410), прибираємо.
 * @param {RedisClient} r @param {StoredSub[]} subs @param {PushMessage[]} messages
 * @returns {Promise<number>} скільки доставлено
 */
export async function sendToAll(r, subs, messages) {
  let sent = 0
  for (const s of subs) {
    for (const m of messages) {
      try {
        await sender(s.subscription, JSON.stringify(m))
        sent++
      } catch (err) {
        const status = /** @type {{ statusCode?: number }} */ (err).statusCode
        if (status === 404 || status === 410) {
          await r.hdel(KEYS.push, s.subscription.endpoint)
          break
        }
        console.error('push failed', status ?? err)
      }
    }
  }
  return sent
}
