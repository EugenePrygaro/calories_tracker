import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accuracy, deficitOf, heatLevel, summarize } from '../shared/stats.js'
import { portionCap, solvePortions, totalsOf } from '../shared/portion.js'
import { loadSummaries, refreshDaySummary } from '../server/stats.js'
import { KEYS, setRedisClient } from '../server/store.js'
import { MemoryRedis } from '../scripts/memory-redis.js'
import entries from '../api/entries.js'

const GOALS = { kcal: 2000, protein: 120, fat: 70, carbs: 220 }
const day = (over = {}) => ({ date: '2026-11-10', kcal: 2000, protein: 120, fat: 70, carbs: 220, entries: 3, goals: GOALS, ...over })

// ─── Точність і теплова карта ────────────────────────────────────────────────

test('точність: 100% у нормі, 10% відхилення скрізь → 0,9, відхилення понад 100% обмежене', () => {
  assert.equal(accuracy(day()), 1)
  assert.ok(Math.abs(accuracy(day({ kcal: 2200, protein: 108, fat: 77, carbs: 198 })) - 0.9) < 1e-9)
  assert.equal(accuracy(day({ kcal: 9000, protein: 999, fat: 999, carbs: 999 })), 0)
})

test('день із читмілом — точний, навіть із перебором', () => {
  assert.equal(accuracy(day({ kcal: 4000, cheat: true })), 1)
  assert.equal(heatLevel(day({ kcal: 4000, cheat: true })), 4)
})

test('рівень теплової карти: 0 без записів, далі 1…4 за точністю', () => {
  assert.equal(heatLevel(undefined), 0)
  assert.equal(heatLevel(day({ entries: 0 })), 0)
  assert.equal(heatLevel(day()), 4)
  assert.equal(heatLevel(day({ kcal: 2300, protein: 100, fat: 80, carbs: 260 })), 3) // ~15%
  assert.equal(heatLevel(day({ kcal: 1400, protein: 60, fat: 40, carbs: 150 })), 2) // ~62%
  assert.equal(heatLevel(day({ kcal: 1000, protein: 40, fat: 30, carbs: 100 })), 1) // ~44%
})

test('дефіцит: норма − з’їдене', () => {
  assert.equal(deficitOf(day({ kcal: 1700 })), 300)
  assert.equal(deficitOf(day({ kcal: 2300 })), -300)
})

test('summarize: суми дня + знімок цілей', () => {
  const s = summarize('2026-11-10', [
    { kcal: 500, protein: 30, fat: 10, carbs: 60 },
    { kcal: 300.4, protein: 10, fat: 5, carbs: 40 },
  ], GOALS)
  assert.equal(s.entries, 2)
  assert.equal(Math.round(s.kcal), 800)
  assert.deepEqual(s.goals, GOALS)
})

// ─── Калькулятор порцій ──────────────────────────────────────────────────────

const RICE = { kcal: 130, protein: 2.7, fat: 0.3, carbs: 28 }
const CHICKEN = { kcal: 165, protein: 31, fat: 3.6, carbs: 0 }
const OIL = { kcal: 884, protein: 0, fat: 100, carbs: 0 }

test('одна страва, лише калорії: грами = калорії / ккал на грам', () => {
  assert.deepEqual(solvePortions([CHICKEN], { kcal: 330 }), [200])
})

test('кілька страв, лише калорії: калорії діляться порівну', () => {
  const g = solvePortions([RICE, CHICKEN], { kcal: 600 })
  const t = totalsOf([RICE, CHICKEN], g)
  assert.ok(Math.abs(t.kcal - 600) < 10, `ккал ${t.kcal}`)
  assert.ok(Math.abs(RICE.kcal * (g[0] ?? 0) / 100 - 300) < 10)
})

test('з білком: підбирає більше курки, щоб влучити і в калорії, і в білок', () => {
  const per100 = [RICE, CHICKEN]
  const g = solvePortions(per100, { kcal: 600, protein: 50 })
  const t = totalsOf(per100, g)
  assert.ok(Math.abs(t.kcal - 600) < 20, `ккал ${t.kcal}`)
  assert.ok(Math.abs(t.protein - 50) < 4, `білок ${t.protein}`)
  assert.ok((g[1] ?? 0) >= 100, `курка ${g[1]} г`) // білок майже весь з курки
})

test('з жирами: олію додає лише стільки, скільки бракує жиру', () => {
  const per100 = [RICE, CHICKEN, OIL]
  const g = solvePortions(per100, { kcal: 700, protein: 45, fat: 20, carbs: 70 })
  const t = totalsOf(per100, g)
  assert.ok(Math.abs(t.fat - 20) < 4, `жир ${t.fat}`)
  assert.ok((g[2] ?? 0) < 25, `олія ${g[2]} г`) // дрібна порція — округлення до 1 г
  assert.ok(g.every((x) => x >= 0))
})

test('порція обмежена: краще недобрати жирів, ніж запропонувати 2 кг салату', () => {
  const SALAD = { kcal: 35, protein: 0.9, fat: 2, carbs: 3.4 }
  const caps = [540, 450, 450]
  const g = solvePortions([RICE, CHICKEN, SALAD], { kcal: 946, protein: 36, fat: 43, carbs: 101 }, caps)
  assert.ok(g.every((x, i) => x <= (caps[i] ?? 0)), g.join('/'))
  const t = totalsOf([RICE, CHICKEN, SALAD], g)
  assert.ok(Math.abs(t.kcal - 946) < 95, `ккал ${t.kcal}`) // калорії — головне, навіть коли жир недосяжний
  assert.equal(portionCap(150), 450)
  assert.equal(portionCap(20), 300)
  assert.equal(portionCap(null), 600)
})

test('порожній вибір або нуль калорій — нулі', () => {
  assert.deepEqual(solvePortions([], { kcal: 500 }), [])
  assert.deepEqual(solvePortions([RICE], { kcal: 0 }), [0])
})

// ─── Підсумки на сервері ─────────────────────────────────────────────────────

const call = async (handlerFn, method, url, body) => {
  const u = new URL(url, 'http://x')
  let status = 0
  let payload
  const res = {
    setHeader() {},
    status(s) {
      status = s
      return this
    },
    json(v) {
      payload = v
      return this
    },
    end() {},
  }
  await handlerFn({ method, query: Object.fromEntries(u.searchParams), headers: {}, body }, res)
  return { status, payload }
}

test('підсумок дня оновлюється при додаванні й видаленні записів', async () => {
  const r = new MemoryRedis()
  setRedisClient(r)
  const entry = {
    id: 'entry-0001',
    date: '2026-11-10',
    meal: 'lunch',
    mode: 'quick',
    name: 'Обід',
    kcal: 700,
    protein: 40,
    fat: 20,
    carbs: 80,
    createdAt: 1,
    updatedAt: 1,
  }
  await call(entries, 'PUT', '/api/entries?id=entry-0001', { entry })
  const saved = await r.hgetall(KEYS.summary)
  assert.equal(saved?.['2026-11-10']?.kcal, 700)

  await call(entries, 'DELETE', '/api/entries?id=entry-0001&date=2026-11-10')
  assert.equal((await r.hgetall(KEYS.summary))?.['2026-11-10'], undefined)
})

test('loadSummaries: уперше будує підсумки з усіх наявних днів, потім читає готові', async () => {
  const r = new MemoryRedis()
  const e = (id, date, kcal) => ({ id, date, meal: 'lunch', mode: 'quick', name: 'x', kcal, protein: 0, fat: 0, carbs: 0, createdAt: 1, updatedAt: 1 })
  await r.hset(KEYS.day('2026-11-01'), { 'entry-000a': e('entry-000a', '2026-11-01', 1500) })
  await r.hset(KEYS.day('2026-11-03'), { 'entry-000b': e('entry-000b', '2026-11-03', 1800), 'entry-000c': e('entry-000c', '2026-11-03', 200) })
  const days = await loadSummaries(r)
  assert.deepEqual(days.map((d) => [d.date, d.kcal]), [['2026-11-01', 1500], ['2026-11-03', 2000]])
  assert.ok(await r.get(KEYS.summaryReady))

  // далі — лише точкові оновлення
  await r.hset(KEYS.day('2026-11-04'), { 'entry-000d': e('entry-000d', '2026-11-04', 900) })
  assert.equal((await loadSummaries(r)).length, 2)
  await refreshDaySummary(r, '2026-11-04')
  assert.equal((await loadSummaries(r)).length, 3)
})

// ─── «Нещодавні» й «Часті» ───────────────────────────────────────────────────

test('лічильники страв: будуються з історії за назвою, далі — при додаванні зі страви', async () => {
  const { loadUsage, recordUsage } = await import('../server/usage.js')
  const r = new MemoryRedis()
  const food = { id: 'food-0001', name: 'Гречка варена', brand: null, per100: RICE, servingGrams: 200, source: 'own', offCode: null, createdAt: 1, updatedAt: 1 }
  await r.hset(KEYS.foods, { [food.id]: food })
  const e = (id, date, at) => ({ id, date, meal: 'lunch', mode: 'weight', name: 'гречка варена ', grams: 200, per100: RICE, createdAt: at, updatedAt: at })
  await r.hset(KEYS.day('2026-11-01'), { 'entry-0001': e('entry-0001', '2026-11-01', 100) })
  await r.hset(KEYS.day('2026-11-02'), { 'entry-0002': e('entry-0002', '2026-11-02', 200) })
  assert.deepEqual(await loadUsage(r), { 'food-0001': { n: 2, last: 200 } })
  await recordUsage(r, 'food-0001', 300)
  assert.deepEqual(await loadUsage(r), { 'food-0001': { n: 3, last: 300 } })
})

// ─── Норма на вихідних ───────────────────────────────────────────────────────

test('вихідні: калорій більше на weekendBoost % (за замовчуванням 15%), БЖВ ті самі', async () => {
  const { goalsForDate, isWeekend } = await import('../shared/goals.js')
  const profile = { goals: GOALS, weekendBoost: 15 }
  assert.equal(isWeekend('2026-11-14'), true) // субота
  assert.equal(isWeekend('2026-11-16'), false) // понеділок
  assert.deepEqual(goalsForDate(profile, '2026-11-15'), { ...GOALS, kcal: 2300 })
  assert.deepEqual(goalsForDate(profile, '2026-11-16'), GOALS)
  assert.deepEqual(goalsForDate({ goals: GOALS, weekendBoost: 0 }, '2026-11-15'), GOALS)
  assert.equal(goalsForDate(null, '2026-11-15').kcal, 2300) // без профілю — норми за замовчуванням +15%
})

test('вихідні: нагорода за норму й підсумок дня рахуються від збільшеної норми', async () => {
  const r = new MemoryRedis()
  setRedisClient(r)
  await r.set(KEYS.profile, { goals: GOALS, targetWeight: null, weekendBoost: 15, updatedAt: 1 })
  const now = Date.now()
  const today = new Date(now)
  // запис на сьогодні (нагороди лише за сьогодні/вчора); очікувана норма залежить від дня тижня
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const entry = { id: 'entry-weekend', date: key, meal: 'lunch', mode: 'quick', name: 'Обід', kcal: 2300, protein: 0, fat: 0, carbs: 0, createdAt: now, updatedAt: now }
  await call(entries, 'PUT', '/api/entries?id=entry-weekend', { entry })
  const summary = (await r.hgetall(KEYS.summary))?.[key]
  const { isWeekend } = await import('../shared/goals.js')
  assert.equal(summary?.goals.kcal, isWeekend(key) ? 2300 : 2000)
})
