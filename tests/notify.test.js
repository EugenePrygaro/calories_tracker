import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newGameState } from '../shared/game.js'
import { RESCUE_MESSAGES, daysWord, liveStreak, newPushState, planNotifications } from '../shared/notify.js'
import { setPushSender } from '../server/push.js'
import { KEYS, setRedisClient } from '../server/store.js'
import { MemoryRedis } from '../scripts/memory-redis.js'
import cron from '../api/cron.js'

const GOALS = { kcal: 2000, protein: 120, fat: 70, carbs: 220 }
const sum = (date, kcal, entries = 3) => ({ date, kcal, protein: 0, fat: 0, carbs: 0, entries, goals: GOALS })
const game = (over = {}) => Object.assign(newGameState(), { streak: 12, lastActiveDate: '2026-11-16' }, over)

test('відмінки: 1 день, 2 дні, 5 днів, 11 днів, 21 день', () => {
  assert.deepEqual([1, 2, 4, 5, 11, 12, 21, 22, 25, 101].map(daysWord), [
    '1 день', '2 дні', '4 дні', '5 днів', '11 днів', '12 днів', '21 день', '22 дні', '25 днів', '101 день',
  ])
})

test('порятунок серії: лише якщо сьогодні нічого не записано; текст із числом днів', () => {
  const today = '2026-11-17' // вівторок
  const none = planNotifications({ today, game: game(), summaries: [], state: newPushState(), random: () => 0 })
  assert.equal(none.messages.length, 1)
  assert.equal(none.messages[0].title, 'Твоя серія в 12 днів пише заповіт')
  assert.equal(none.messages[0].body, 'Я так і знав.')

  const logged = planNotifications({ today, game: game(), summaries: [sum(today, 900)], state: newPushState(), random: () => 0 })
  assert.equal(logged.messages.length, 0)
})

test('текст порятунку не повторюється двічі поспіль', () => {
  const today = '2026-11-17'
  const state = { ...newPushState(), lastRescue: 0 }
  const r = planNotifications({ today, game: game(), summaries: [], state, random: () => 0 })
  assert.equal(r.state.lastRescue, 1)
  assert.equal(r.messages[0].title, '⚡ Терміново: 12-денна серія на межі зникнення')
  assert.equal(RESCUE_MESSAGES.length, 4)
})

test('серія, що вже фактично обірвалась, — 0', () => {
  assert.equal(liveStreak(game({ lastActiveDate: '2026-11-16' }), '2026-11-17'), 12)
  assert.equal(liveStreak(game({ lastActiveDate: '2026-11-15' }), '2026-11-17'), 12) // 1 пропуск — безкоштовний
  assert.equal(liveStreak(game({ lastActiveDate: '2026-11-13', shields: 0 }), '2026-11-17'), 0)
  assert.equal(liveStreak(game({ lastActiveDate: '2026-11-13', shields: 2 }), '2026-11-17'), 12)
})

test('заморозка: сповіщення, коли лічильник витрачених зріс; перший запуск лише запам\u2019ятовує', () => {
  const today = '2026-11-17'
  const g = game()
  g.counters.shieldsUsed = 3
  const first = planNotifications({ today, game: g, summaries: [sum(today, 900)], state: newPushState() })
  assert.equal(first.messages.length, 0)
  assert.equal(first.state.shieldsUsedSeen, 3)
  g.counters.shieldsUsed = 4
  const next = planNotifications({ today: '2026-11-18', game: g, summaries: [sum('2026-11-18', 900)], state: first.state })
  assert.deepEqual(next.messages.map((m) => m.title), ['Заморозку витратив ❄️'])
})

test('підсумок тижня в неділю: мало днів / дефіцит / профіцит', () => {
  const sunday = '2026-11-22'
  const week = (kcal, days) => ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'].slice(0, days).map((d) => sum(d, kcal))
  const st = { ...newPushState(), shieldsUsedSeen: 0 }
  const few = planNotifications({ today: sunday, game: game(), summaries: week(1800, 3), state: st })
  assert.ok(few.messages.some((m) => m.title === 'Записано 3 з 7 днів' && m.body === 'А решта де?'))

  const def = planNotifications({ today: sunday, game: game(), summaries: week(1600, 7), state: st })
  assert.deepEqual(def.messages.map((m) => [m.title, m.body]), [['Тиждень: −2 800 ккал', 'Молодець. Не розслабляйся.']])

  const sur = planNotifications({ today: sunday, game: game(), summaries: week(2300, 7), state: st })
  assert.equal(sur.messages[0].title, 'Тиждень: +2 100 ккал 🍰')
  assert.equal(sur.messages[0].body, 'Ну ти дав.')

  // будній день — без підсумку
  const tue = planNotifications({ today: '2026-11-17', game: game(), summaries: week(1600, 2), state: st })
  assert.ok(!tue.messages.some((m) => m.tag === 'week'))
})

test('кронова функція: шле на всі пристрої, удруге за день — нічого, мертві підписки прибирає', async () => {
  const r = new MemoryRedis()
  setRedisClient(r)
  const sub = (id) => ({ subscription: { endpoint: 'https://push.example/' + id, keys: { p256dh: 'p', auth: 'a' } }, tzOffset: 0, createdAt: 1 })
  await r.hset(KEYS.push, { 'https://push.example/a': sub('a'), 'https://push.example/gone': sub('gone') })
  const sent = []
  setPushSender(async (s, payload) => {
    if (s.endpoint.endsWith('gone')) throw Object.assign(new Error('gone'), { statusCode: 410 })
    sent.push(JSON.parse(payload).title)
  })
  const call = async () => {
    let body
    const res = { setHeader() {}, status() { return this }, json(v) { body = v; return this }, end() {} }
    await cron({ method: 'GET', headers: {}, query: {} }, res)
    return body
  }
  const first = await call()
  assert.ok(first.sent >= 1)
  assert.ok(sent.some((t) => t.includes('серія') || t.includes('Годі') || t.includes('Вогник')))
  assert.deepEqual(Object.keys((await r.hgetall(KEYS.push)) ?? {}), ['https://push.example/a'])
  const second = await call()
  assert.equal(second.sent, 0)
})
