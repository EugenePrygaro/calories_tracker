import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { newGameState, onEntrySaved, registerActivity } from '../shared/game.js'
import { ACHIEVEMENTS, claimAchievement, newlyUnlocked, rewardFor, statsOf } from '../shared/achievements.js'
import { applyDevOp, sanitizeGame } from '../server/game.js'
import { setRedisClient } from '../server/store.js'
import { MemoryRedis } from '../scripts/memory-redis.js'
import entries from '../api/entries.js'
import game from '../api/game.js'

const NOW = Date.UTC(2026, 10, 14, 12) // «сьогодні» = 2026-11-14
const TODAY = '2026-11-14'
const GOALS = { kcal: 2000, protein: 120, fat: 70, carbs: 220 }
const ZERO = { kcal: 0, protein: 0, fat: 0, carbs: 0 }

/** @param {object} over */
const ctx = (over = {}) => ({ date: TODAY, isNewEntry: true, meals: new Set(['breakfast']), totals: ZERO, goals: GOALS, ...over })
const rewards = (events) => events.filter((e) => e.type === 'reward')

// ─── Монети ─────────────────────────────────────────────────────────────────

test('рівнів і XP немає: у стані лише монети', () => {
  const s = newGameState()
  assert.ok(!('xp' in s))
  const { events } = applyDevOp(s, 'addCoins', 400, NOW)
  assert.equal(s.coins, 400)
  assert.deepEqual(events.map((e) => e.type), ['reward'])
})

// ─── Нагороди за день і захист від накрутки ─────────────────────────────────

test('секція прийому їжі: +5 монет один раз на день', () => {
  const s = newGameState()
  const first = onEntrySaved(s, ctx(), NOW)
  assert.deepEqual(rewards(first).map((e) => [e.reason, e.coins]), [['meal', 5]])

  // видалили й додали знову — нічого
  assert.equal(rewards(onEntrySaved(s, ctx(), NOW)).length, 0)

  // інші прийоми — так, але кожен лише раз; максимум 4 на день
  onEntrySaved(s, ctx({ meals: new Set(['breakfast', 'lunch', 'dinner', 'snack']) }), NOW)
  assert.equal(s.coins, 20)
})

test('норма білка ±10% (+15 монет) і калораж ±10% (+25 монет) — раз на день', () => {
  const s = newGameState()
  const near = { kcal: 1800, protein: 108, fat: 60, carbs: 200 } // −10% ккал, −10% білка
  const all = onEntrySaved(s, ctx({ totals: near }), NOW)
  assert.deepEqual(rewards(all).map((e) => [e.reason, e.coins]), [['meal', 5], ['protein', 15], ['kcal', 25]])
  assert.equal(s.coins, 5 + 15 + 25)
  assert.equal(rewards(onEntrySaved(s, ctx({ totals: near }), NOW)).length, 0)
})

test('поза допуском — без нагороди', () => {
  const s = newGameState()
  const ev = rewards(onEntrySaved(s, ctx({ totals: { kcal: 2201, protein: 107, fat: 0, carbs: 0 } }), NOW)) // +10,05% ккал
  assert.deepEqual(ev.map((e) => e.reason), ['meal'])
})

test('записи не на «сьогодні ± 1 день» нагород не дають', () => {
  const s = newGameState()
  assert.equal(onEntrySaved(s, ctx({ date: '2026-11-10' }), NOW).length, 0)
  assert.equal(s.coins, 0)
  assert.ok(rewards(onEntrySaved(s, ctx({ date: '2026-11-13' }), NOW)).length > 0)
})

test('лічильник страв для ачівки — не більше 20 на день', () => {
  const s = newGameState()
  for (let i = 0; i < 30; i++) onEntrySaved(s, ctx(), NOW)
  assert.equal(s.entriesLogged, 20)
})

// ─── Стрік ──────────────────────────────────────────────────────────────────

/** @param {object} over */
const withStreak = (over) => ({ ...newGameState(), streak: 5, bestStreak: 5, lastActiveDate: '2026-11-13', ...over })

test('стрік: учора → +1; той самий день — без змін', () => {
  const s = withStreak({})
  registerActivity(s, TODAY, [])
  assert.equal(s.streak, 6)
  registerActivity(s, TODAY, [])
  assert.equal(s.streak, 6)
})

test('стрік: пропуск 1 дня — безкоштовно, щити не витрачаються, сповіщення', () => {
  const s = withStreak({ lastActiveDate: '2026-11-12', shields: 2 })
  const events = []
  registerActivity(s, TODAY, events)
  assert.equal(s.streak, 6)
  assert.equal(s.shields, 2)
  assert.deepEqual(s.notice, { date: TODAY, missed: 1, usedShields: 0, streak: 6 })
  assert.ok(events.some((e) => e.type === 'rescue'))
})

test('стрік: пропуск 1 дня без щитів — теж зберігається', () => {
  const s = withStreak({ lastActiveDate: '2026-11-12', shields: 0 })
  registerActivity(s, TODAY, [])
  assert.equal(s.streak, 6)
})

test('стрік: пропуск 2 днів — другий день списує 1 щит', () => {
  const s = withStreak({ lastActiveDate: '2026-11-11', shields: 2 })
  registerActivity(s, TODAY, [])
  assert.equal(s.streak, 6)
  assert.equal(s.shields, 1)
  assert.equal(s.notice?.usedShields, 1)
})

test('стрік: пропуск 2 днів без щитів — скидання до 1', () => {
  const s = withStreak({ lastActiveDate: '2026-11-11', shields: 0 })
  const events = []
  registerActivity(s, TODAY, events)
  assert.equal(s.streak, 1)
  assert.ok(events.some((e) => e.type === 'streakReset'))
})

test('стрік: пропуск 3 днів з 1 щитом — не вистачає, скидання, щит не згорає', () => {
  const s = withStreak({ lastActiveDate: '2026-11-10', shields: 1 })
  registerActivity(s, TODAY, [])
  assert.equal(s.streak, 1)
  assert.equal(s.shields, 1)
})

test('стрік: пропуск 3 днів з 2 щитами — серія врятована (1-й день безкоштовний)', () => {
  const s = withStreak({ lastActiveDate: '2026-11-10', shields: 2 })
  registerActivity(s, TODAY, [])
  assert.equal(s.streak, 6)
  assert.equal(s.shields, 0)
})

test('стрік: кожні 7 днів +100 монет (один раз за тиждень серії)', () => {
  const s = withStreak({ streak: 6, streakWeeksPaid: 0 })
  const events = []
  registerActivity(s, TODAY, events)
  assert.equal(s.streak, 7)
  assert.equal(s.coins, 100)
  assert.equal(s.streakWeeksPaid, 1)
})

test('серія днів у нормі білка', () => {
  const s = newGameState()
  const hit = { kcal: 0, protein: 120, fat: 0, carbs: 0 }
  onEntrySaved(s, ctx({ date: '2026-11-13', totals: hit }), NOW)
  onEntrySaved(s, ctx({ date: '2026-11-14', totals: hit }), NOW)
  assert.equal(s.proteinStreak, 2)
  assert.equal(s.bestProteinStreak, 2)
})

// ─── Ачівки ─────────────────────────────────────────────────────────────────

test('ачівки: забрати нагороду лише після досягнення і лише раз', () => {
  const s = { ...newGameState(), bestStreak: 7 }
  const stats = statsOf(s, 0)
  assert.throws(() => claimAchievement(s, 'on_fire_2', stats, NOW), /not_reached/)
  assert.throws(() => claimAchievement(s, 'nope', stats, NOW), /unknown/)
  const events = claimAchievement(s, 'on_fire_1', stats, NOW)
  assert.deepEqual(rewards(events).map((e) => e.coins), [90]) // 7 днів × 1,3 × 10
  assert.throws(() => claimAchievement(s, 'on_fire_1', stats, NOW), /already_claimed/)
  assert.equal(ACHIEVEMENTS.length, 39)
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, 39) // id унікальні
})

test('щойно отримані ачівки: досягнуто, не забрано, ще не показано', () => {
  const s = { ...newGameState(), bestStreak: 7 }
  assert.deepEqual(newlyUnlocked(s, statsOf(s, 1)).map((a) => a.id), ['on_fire_1', 'recipes-1'])
  s.seen['on_fire_1'] = 1
  assert.deepEqual(newlyUnlocked(s, statsOf(s, 1)).map((a) => a.id), ['recipes-1'])
  claimAchievement(s, 'recipes-1', statsOf(s, 1), NOW)
  assert.equal(s.seen['recipes-1'], NOW) // забрана нагорода = показано
  assert.deepEqual(newlyUnlocked(s, statsOf(s, 1)), [])
})

test('dev: видати й скинути ачівку', () => {
  const s = newGameState()
  applyDevOp(s, 'unlockAchievement', 0, NOW, 'protein-14')
  assert.deepEqual(newlyUnlocked(s, statsOf(s, 0)).map((a) => a.id), ['protein-14'])
  claimAchievement(s, 'protein-14', statsOf(s, 0), NOW)
  // видати повторно — знову можна отримати
  applyDevOp(s, 'unlockAchievement', 0, NOW, 'protein-14')
  assert.ok(!('protein-14' in s.claimed))
  applyDevOp(s, 'relockAchievement', 0, NOW, 'protein-14')
  assert.deepEqual(newlyUnlocked(s, statsOf(s, 0)), [])
  assert.throws(() => applyDevOp(s, 'unlockAchievement', 0, NOW, 'nope'), /unknown_achievement/)
})

test('економіка ачівок: нагорода за складністю, у межах серії — зростає з метою', () => {
  assert.equal(rewardFor(7, 1.3), 90) // «На вогні I»
  assert.equal(rewardFor(0.5, 1), 10) // мінімум
  assert.equal(rewardFor(17, 1.2), 200) // від 100 — до десятків
  const bySeries = new Map()
  for (const a of ACHIEVEMENTS) bySeries.set(a.series, [...(bySeries.get(a.series) ?? []), a])
  for (const [series, list] of bySeries) {
    const sorted = [...list].sort((x, y) => x.goal - y.goal)
    for (let i = 1; i < sorted.length; i++) assert.ok(sorted[i].reward > sorted[i - 1].reward, series)
  }
})

test('стан гри з Redis: старі id ачівок переносяться на нові', () => {
  const s = sanitizeGame({ claimed: { 'streak-7': 5, 'recipes-1': 6 }, seen: { 'streak-30': 7 } })
  assert.deepEqual(s.claimed, { on_fire_1: 5, 'recipes-1': 6 })
  assert.deepEqual(s.seen, { on_fire_2: 7 })
})

// ─── Лічильники нових ачівок ────────────────────────────────────────────────

const ALL_MEALS = new Set(['breakfast', 'lunch', 'dinner', 'snack'])

test('повний день, точний калораж, баланс макросів — раз на день', () => {
  const s = newGameState()
  const perfect = { kcal: 2005, protein: 125, fat: 66, carbs: 230 } // ±10 ккал, усі макроси ±10%
  onEntrySaved(s, ctx({ meals: ALL_MEALS, totals: perfect }), NOW)
  onEntrySaved(s, ctx({ meals: ALL_MEALS, totals: perfect }), NOW)
  const c = s.counters
  assert.deepEqual([c.fullSlotsDays, c.exactCalorieDays, c.perfectMacroDays, c.carbsDays, c.fatDays], [1, 1, 1, 1, 1])
})

test('сумарні калорії: лише приріст понад максимум дня (без накрутки)', () => {
  const s = newGameState()
  onEntrySaved(s, ctx({ totals: { ...ZERO, kcal: 500 } }), NOW)
  onEntrySaved(s, ctx({ totals: { ...ZERO, kcal: 300 } }), NOW) // видалили запис
  onEntrySaved(s, ctx({ totals: { ...ZERO, kcal: 500 } }), NOW) // додали знову
  onEntrySaved(s, ctx({ totals: { ...ZERO, kcal: 800 } }), NOW)
  assert.equal(s.counters.totalCalories, 800)
})

test('рання пташка й нічний дожор — за місцевим часом клієнта', () => {
  const s = newGameState()
  const kyiv = -120 // UTC+2
  onEntrySaved(s, ctx({ entry: { meal: 'breakfast', createdAt: Date.UTC(2026, 10, 14, 6) }, tzOffset: kyiv }), NOW) // 08:00
  onEntrySaved(s, ctx({ entry: { meal: 'snack', createdAt: Date.UTC(2026, 10, 14, 21) }, tzOffset: kyiv }), NOW) // 23:00
  onEntrySaved(s, ctx({ entry: { meal: 'breakfast', createdAt: Date.UTC(2026, 10, 14, 9) }, tzOffset: kyiv }), NOW) // 11:00, і вже був
  assert.equal(s.counters.earlyBreakfasts, 1)
  assert.equal(s.counters.lateSnacks, 1)
})

test('редагування ваги — не більше 3 за день', () => {
  const s = newGameState()
  for (let i = 0; i < 6; i++) onEntrySaved(s, ctx({ isNewEntry: false, weightEdited: true }), NOW)
  assert.equal(s.counters.editWeight, 3)
})

test('неділі поспіль, витрачені щити, повернення після скидання, рекорди монет і щитів', () => {
  const s = newGameState()
  registerActivity(s, '2026-11-15', []) // неділя
  registerActivity(s, '2026-11-22', []) // наступна неділя, пропуск тижня → скидання серії
  assert.equal(s.counters.bestSundayStreak, 2)
  assert.equal(s.counters.comebacks, 1)

  const r = { ...newGameState(), streak: 3, lastActiveDate: '2026-11-11', shields: 2 }
  registerActivity(r, TODAY, []) // пропуск 2 днів → 1 щит
  assert.equal(r.counters.shieldsUsed, 1)

  const m = newGameState()
  applyDevOp(m, 'addCoins', 1200, NOW)
  applyDevOp(m, 'addCoins', -500, NOW)
  applyDevOp(m, 'addShields', 2, NOW)
  assert.equal(m.counters.maxCoins, 1200)
  assert.equal(m.counters.maxShieldsHeld, 2)
})

test('«Скопіювати з учора»: рахується натискання, не більше 5 за день', () => {
  const s = newGameState()
  for (let i = 0; i < 8; i++) onEntrySaved(s, ctx({ copiedFromYesterday: true }), NOW)
  onEntrySaved(s, ctx({ copiedFromYesterday: false }), NOW) // звичайний запис — не рахується
  assert.equal(s.counters.copyYesterday, 5)
})

test('«сьогодні» — за місцевим часом; завтрашні дати нагород не дають', () => {
  const s = newGameState()
  assert.equal(onEntrySaved(s, ctx({ date: '2026-11-15' }), NOW).length, 0) // завтра за UTC
  // 23:30 у Києві 14-го = 21:30 UTC; але о 00:30 15-го за Києвом (22:30 UTC 14-го) «сьогодні» вже 15-те
  const kyivAfterMidnight = Date.UTC(2026, 10, 14, 22, 30)
  const k = newGameState()
  assert.ok(onEntrySaved(k, ctx({ date: '2026-11-15', tzOffset: -120 }), kyivAfterMidnight).length > 0)
  assert.ok(onEntrySaved(k, ctx({ date: '2026-11-14', tzOffset: -120, meals: new Set(['lunch']) }), kyivAfterMidnight).length > 0) // учора — можна
})

test('сумарні калорії: не більше max(2 × ціль, 5000) за день', () => {
  const s = newGameState()
  onEntrySaved(s, ctx({ totals: { ...ZERO, kcal: 50_000 } }), NOW)
  assert.equal(s.counters.totalCalories, 5000)
})

test('серія білка: дописаний «вчора» після «сьогодні» подовжує серію', () => {
  const s = newGameState()
  const hit = { kcal: 0, protein: 120, fat: 0, carbs: 0 }
  onEntrySaved(s, ctx({ date: '2026-11-14', totals: hit }), NOW)
  onEntrySaved(s, ctx({ date: '2026-11-13', totals: hit }), NOW)
  assert.equal(s.proteinStreak, 2)
  assert.equal(s.lastProteinDate, '2026-11-14')
})

test('стан гри з Redis: відсутні й биті поля не ламають', () => {
  const s = sanitizeGame({ xp: 500, coins: 'abc', days: { bad: {}, '2026-11-14': { meals: ['lunch', 'x'] } }, notice: { date: 'no' } })
  assert.ok(!('xp' in s)) // старе поле XP відкидається
  assert.equal(s.coins, 0)
  assert.deepEqual(Object.keys(s.days), ['2026-11-14'])
  assert.deepEqual(s.days['2026-11-14']?.meals, ['lunch'])
  assert.equal(s.notice, null)
})

// ─── API ────────────────────────────────────────────────────────────────────

async function call(fn, { method = 'GET', query = {}, body } = {}) {
  const res = {
    statusCode: 0, body: undefined, headers: {},
    status(c) { this.statusCode = c; return this },
    setHeader(k, v) { this.headers[k] = v },
    json(b) { this.body = b },
  }
  await fn({ method, query, body, headers: {} }, res)
  return res
}

beforeEach(() => setRedisClient(new MemoryRedis()))

test('API: запис їжі одразу повертає нагороди; повторне збереження — без нагород', async () => {
  const date = new Date().toISOString().slice(0, 10)
  const entry = { id: 'game-entry-01', date, meal: 'lunch', mode: 'quick', name: 'Обід', kcal: 600, protein: 40, createdAt: 1, updatedAt: 1 }
  const first = await call(entries, { method: 'PUT', query: { id: entry.id }, body: { entry } })
  assert.equal(first.body.game.game.coins, 5)
  assert.equal(first.body.game.game.streak, 1)
  assert.ok(first.body.game.events.some((e) => e.type === 'reward' && e.reason === 'meal'))

  const again = await call(entries, { method: 'PUT', query: { id: entry.id }, body: { entry: { ...entry, updatedAt: 2 } } })
  assert.equal(again.body.game.events.filter((e) => e.type === 'reward').length, 0)

  const state = await call(game)
  assert.equal(state.body.game.coins, 5)
})

test('API: запис з source=copy рахується для «Дня бабака»', async () => {
  const date = new Date().toISOString().slice(0, 10)
  const mk = (id) => ({ id, date, meal: 'snack', mode: 'quick', name: 'Копія', kcal: 100, protein: 5, createdAt: 1, updatedAt: 1 })
  await call(entries, { method: 'PUT', query: { id: 'copy-entry-01', source: 'copy' }, body: { entry: mk('copy-entry-01') } })
  await call(entries, { method: 'PUT', query: { id: 'copy-entry-02' }, body: { entry: mk('copy-entry-02') } })
  assert.equal((await call(game)).body.game.counters.copyYesterday, 1)
})

test('API: claim і dev-дії', async () => {
  const dev = await call(game, { method: 'POST', body: { action: 'dev', op: 'setStreak', amount: 7 } })
  assert.equal(dev.body.game.streak, 7)

  const claim = await call(game, { method: 'POST', body: { action: 'claim', id: 'on_fire_1' } })
  assert.equal(claim.statusCode, 200)
  assert.equal(claim.body.game.coins, 90)
  assert.equal((await call(game, { method: 'POST', body: { action: 'claim', id: 'on_fire_1' } })).statusCode, 409)

  assert.equal((await call(game, { method: 'POST', body: { action: 'dev', op: 'hack' } })).statusCode, 400)

  const seen = await call(game, { method: 'POST', body: { action: 'seen', id: 'meals-10' } })
  assert.ok('meals-10' in seen.body.game.seen)
  assert.equal((await call(game, { method: 'POST', body: { action: 'seen', id: 'nope' } })).statusCode, 404)
  const reset = await call(game, { method: 'POST', body: { action: 'dev', op: 'reset' } })
  assert.equal(reset.body.game.coins, 0)
})
