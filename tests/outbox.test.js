import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bodyKey, enqueue, entryKey, foodKey, overlayBody, overlayDay, overlayFoods, overlayProfile, requeueFront } from '../shared/outbox.js'

const entry = (id, over = {}) => ({
  id,
  date: '2026-11-17',
  meal: 'lunch',
  mode: 'quick',
  name: id,
  grams: null,
  per100: null,
  kcal: 100,
  protein: 0,
  fat: 0,
  carbs: 0,
  createdAt: 1,
  updatedAt: 1,
  ...over,
})
const put = (e, extra = {}) => ({ kind: 'putEntry', key: entryKey(e.id), entry: e, isNew: false, ...extra })
const del = (e) => ({ kind: 'deleteEntry', key: entryKey(e.id), id: e.id, date: e.date })

test('кілька збережень одного запису → одне, з ознаками першого (новий, foodId)', () => {
  const a1 = entry('a')
  const a2 = entry('a', { kcal: 150, updatedAt: 2 })
  let q = enqueue([], put(a1, { isNew: true, foodId: 'food-1' }))
  q = enqueue(q, put(a2))
  assert.equal(q.length, 1)
  assert.equal(q[0].entry.kcal, 150)
  assert.equal(q[0].isNew, true)
  assert.equal(q[0].foodId, 'food-1')
})

test('створили й видалили офлайн → у черзі нічого; видалили серверний → лише видалення', () => {
  const a = entry('a')
  assert.deepEqual(enqueue(enqueue([], put(a, { isNew: true })), del(a)), [])
  const q = enqueue(enqueue([], put(a)), del(a))
  assert.equal(q.length, 1)
  assert.equal(q[0].kind, 'deleteEntry')
  // видалили й повернули («Повернути» в тості) → лише збереження
  const back = enqueue(q, put(entry('a', { updatedAt: 3 })))
  assert.equal(back.length, 1)
  assert.equal(back[0].kind, 'putEntry')
})

test('порядок різних об’єктів зберігається', () => {
  const q = [put(entry('a')), put(entry('b')), del(entry('c'))].reduce((acc, op) => enqueue(acc, op), [])
  assert.deepEqual(q.map((o) => o.key), ['entry:a', 'entry:b', 'entry:c'])
})

test('requeueFront: невдалий новий запис + новіша версія в черзі → одна, вже «нова»', () => {
  const failed = put(entry('a'), { isNew: true, source: 'copy' })
  const q = requeueFront([put(entry('a', { kcal: 300 }))], failed)
  assert.equal(q.length, 1)
  assert.equal(q[0].entry.kcal, 300)
  assert.equal(q[0].isNew, true)
  assert.equal(q[0].source, 'copy')
  // поки летів — видалили: сервер так і не дізнається
  assert.deepEqual(requeueFront([del(entry('a'))], failed), [])
  // інакше — на початок черги
  assert.deepEqual(requeueFront([put(entry('b'))], failed).map((o) => o.key), ['entry:a', 'entry:b'])
})

test('накладання черги на дані з сервера: день, заміри, профіль', () => {
  const server = [entry('a', { createdAt: 1 }), entry('b', { createdAt: 2 })]
  const q = [put(entry('c', { createdAt: 3 })), del(entry('a')), put(entry('x', { date: '2026-11-16' }))]
  assert.deepEqual(overlayDay(server, '2026-11-17', q).map((e) => e.id), ['b', 'c'])

  const rec = (date, weight) => ({ date, weight, chest: null, waist: null, hips: null, updatedAt: 1 })
  const body = overlayBody([rec('2026-11-01', 75)], [{ kind: 'putBody', key: bodyKey('2026-11-17'), record: rec('2026-11-17', 74) }])
  assert.deepEqual(body.map((r) => r.date), ['2026-11-01', '2026-11-17'])

  const profile = { goals: { kcal: 2000, protein: 1, fat: 1, carbs: 1 }, targetWeight: null, weekendBoost: 15, updatedAt: 1 }
  const newer = { ...profile, targetWeight: 60, updatedAt: 2 }
  assert.equal(overlayProfile(profile, [{ kind: 'putProfile', key: 'profile', profile: newer }])?.targetWeight, 60)
  assert.equal(overlayProfile(profile, []), profile)
})

test('страви: видалення в черзі — зникає зі списку; змінили й видалили — лише видалення', () => {
  const food = (id, updatedAt = 1) => ({ id, name: id, updatedAt })
  const put = (f) => ({ kind: 'putFood', key: foodKey(f.id), food: f })
  const del = (id) => ({ kind: 'deleteFood', key: foodKey(id), id })

  let q = enqueue([], put(food('egg', 5)))
  q = enqueue(q, del('egg'))
  assert.deepEqual(q, [del('egg')])
  assert.deepEqual(overlayFoods([food('egg'), food('rice')], q).map((f) => f.id), ['rice'])

  // видалили, а потім повернули — лише збереження
  q = enqueue(q, put(food('egg', 9)))
  assert.deepEqual(q, [put(food('egg', 9))])
  assert.deepEqual(overlayFoods([food('rice')], q).map((f) => f.id), ['egg', 'rice'])
})
