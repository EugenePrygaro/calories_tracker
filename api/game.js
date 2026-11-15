/**
 * Гейміфікація.
 * GET  /api/game                                  → { game }
 * POST /api/game { action: 'claim', id }          → { game, events }  забрати нагороду ачівки
 * POST /api/game { action: 'dismissNotice' }      → { game, events }  закрити «серію врятовано»
 * POST /api/game { action: 'seen', id }           → { game, events }  модалку ачівки показано (не вискакувати знову)
 * POST /api/game { action: 'buy', item }          → { game, events }  купити товар у магазині
 * POST /api/game { action: 'use', item }          → { game, events }  використати товар з інвентарю
 * POST /api/game { action: 'theme', theme }       → { game, events }  увімкнути куплену тему ('default' — стандартна,
 *                                                                     'random' — щодня випадковий естетичний стиль)
 * POST /api/game { action: 'dev', op, amount }    → { game, events }  тестові дії (див. server/game.js)
 *
 * Калокоїни за їжу тут не нараховуються — це робить api/entries.js при збереженні запису.
 */
import { ClaimError, claimAchievement, isAchievementId, statsOf } from '../shared/achievements.js'
import { ShopError, buyItem, consumeItem, setTheme } from '../shared/shop.js'
import { sanitizeFood } from '../shared/validate.js'
import { applyDevOp, devToolsEnabled, loadGame, saveGame } from '../server/game.js'
import { handler, HttpError, readJson, send } from '../server/http.js'
import { KEYS, parseStored, redis } from '../server/store.js'

/** Кількість власних страв — для ачівок «Свій рецепт». @param {import('../server/store.js').RedisClient} r */
async function countOwnFoods(r) {
  const raw = (await r.hgetall(KEYS.foods)) ?? {}
  return Object.values(raw).filter((v) => {
    try {
      return sanitizeFood(parseStored(v)).source === 'own'
    } catch {
      return false
    }
  }).length
}

/** Часовий пояс клієнта (Date#getTimezoneOffset) — що для нього «сьогодні». @param {import('node:http').IncomingMessage} req */
function tzOffset(req) {
  const tz = Number(req.headers['x-tz-offset'])
  return Number.isInteger(tz) && Math.abs(tz) <= 840 ? tz : 0
}

/** Помилка магазину → 4xx з кодом, який клієнт перекладе. @param {unknown} err */
function shopHttpError(err) {
  if (err instanceof ShopError) return new HttpError(err.code === 'unknown' ? 404 : 409, err.code)
  return err
}

export default handler(['GET', 'POST'], async (req, res) => {
  const r = redis()
  let state = await loadGame(r)

  if (req.method === 'GET') return send(res, 200, { game: state })

  const body = readJson(req)
  /** @type {import('../shared/game.js').GameEvent[]} */
  let events = []

  switch (body.action) {
    case 'claim': {
      const id = typeof body.id === 'string' ? body.id : ''
      try {
        events = claimAchievement(state, id, statsOf(state, await countOwnFoods(r)))
      } catch (err) {
        if (err instanceof ClaimError) throw new HttpError(err.code === 'unknown' ? 404 : 409, err.code)
        throw err
      }
      break
    }
    case 'dismissNotice':
      if (!state.notice) return send(res, 200, { game: state, events }) // нічого не змінилось
      state.notice = null
      break
    case 'seen': {
      if (!isAchievementId(body.id)) throw new HttpError(404, 'unknown')
      const id = String(body.id)
      if (id in state.seen) return send(res, 200, { game: state, events })
      state.seen[id] = Date.now()
      break
    }
    case 'buy':
      try {
        events = buyItem(state, body.item)
      } catch (err) {
        throw shopHttpError(err)
      }
      break
    case 'use':
      try {
        events = consumeItem(state, body.item, Date.now(), tzOffset(req))
      } catch (err) {
        throw shopHttpError(err)
      }
      break
    case 'theme':
      try {
        const unchanged = body.theme === 'random' ? state.dailyRandomTheme : body.theme === state.activeTheme && !state.dailyRandomTheme
        if (unchanged) return send(res, 200, { game: state, events })
        setTheme(state, body.theme)
      } catch (err) {
        throw shopHttpError(err)
      }
      break
    case 'dev': {
      if (!devToolsEnabled()) throw new HttpError(403, 'dev_tools_disabled')
      const amount = Number(body.amount ?? 0)
      if (!Number.isFinite(amount) || Math.abs(amount) > 1_000_000) throw new HttpError(400, 'invalid_amount')
      ;({ state, events } = applyDevOp(state, String(body.op), amount, Date.now(), typeof body.id === 'string' ? body.id : '', tzOffset(req)))
      break
    }
    default:
      throw new HttpError(400, 'unknown_action')
  }

  await saveGame(r, state)
  send(res, 200, { game: state, events })
})
