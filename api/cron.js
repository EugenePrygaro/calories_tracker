/**
 * Вечірні пуш-сповіщення — Vercel Cron щодня о 20:00 UTC (vercel.json → crons).
 * GET /api/cron → { sent, messages }
 *
 * Без підписок нічого не читає й не надсилає. «Сьогодні» — за часовим поясом пристрою з підписки.
 * Захист: якщо задано CRON_SECRET, приймаємо лише запит із Authorization: Bearer <секрет>.
 */
import { localToday } from '../shared/game.js'
import { planNotifications } from '../shared/notify.js'
import { loadGame } from '../server/game.js'
import { handler, HttpError, send } from '../server/http.js'
import { loadPushState, loadSubscriptions, sendToAll } from '../server/push.js'
import { loadSummaries } from '../server/stats.js'
import { KEYS, redis } from '../server/store.js'

export default handler(['GET'], async (req, res) => {
  const secret = process.env.CRON_SECRET
  if (secret && req.headers.authorization !== `Bearer ${secret}`) throw new HttpError(401, 'unauthorized')

  const r = redis()
  const subs = await loadSubscriptions(r)
  if (subs.length === 0) return send(res, 200, { sent: 0, messages: [] })

  const now = Date.now()
  const today = localToday(now, subs[0]?.tzOffset ?? 0)
  const [game, summaries, state] = await Promise.all([loadGame(r), loadSummaries(r), loadPushState(r)])
  const plan = planNotifications({ today, game, summaries, state })
  const sent = plan.messages.length ? await sendToAll(r, subs, plan.messages) : 0
  await r.set(KEYS.pushState, plan.state)
  send(res, 200, { sent, messages: plan.messages.map((m) => m.tag) })
})
