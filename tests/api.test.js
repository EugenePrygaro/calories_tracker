import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { setRedisClient } from '../server/store.js'
import { MemoryRedis } from '../scripts/memory-redis.js'
import day from '../api/day.js'
import entries from '../api/entries.js'
import profile from '../api/profile.js'

/** Викликає обробник Vercel з фейковими req/res. */
async function call(fn, { method = 'GET', query = {}, body } = {}) {
  const res = {
    statusCode: 0,
    headers: {},
    body: undefined,
    status(code) { this.statusCode = code; return this },
    setHeader(k, v) { this.headers[k] = v },
    json(b) { this.body = b },
  }
  await fn({ method, query, body, headers: {} }, res)
  return res
}

const entry = (over = {}) => ({
  id: 'entry-0001',
  date: '2026-11-14',
  meal: 'breakfast',
  mode: 'quick',
  name: 'Кава',
  kcal: 50,
  protein: 1,
  createdAt: 1000,
  updatedAt: 1000,
  ...over,
})

beforeEach(() => setRedisClient(new MemoryRedis()))

test('PUT → GET day повертає запис лише за свою дату', async () => {
  const put = await call(entries, { method: 'PUT', query: { id: 'entry-0001' }, body: { entry: entry() } })
  assert.equal(put.statusCode, 200)
  assert.equal(put.body.applied, true)

  const same = await call(day, { query: { date: '2026-11-14' } })
  assert.equal(same.body.entries.length, 1)
  assert.equal(same.body.entries[0].name, 'Кава')
  assert.equal(same.headers['Cache-Control'], 'no-store')

  const other = await call(day, { query: { date: '2026-11-13' } })
  assert.deepEqual(other.body.entries, [])
})

test('повторний PUT ідемпотентний, старіша версія не перезаписує новішу', async () => {
  const send = (e) => call(entries, { method: 'PUT', query: { id: e.id }, body: { entry: e } })
  await send(entry({ updatedAt: 2000, kcal: 80 }))
  const stale = await send(entry({ updatedAt: 1500, kcal: 10 }))
  assert.equal(stale.body.applied, false)
  assert.equal(stale.body.entry.kcal, 80)

  const res = await call(day, { query: { date: '2026-11-14' } })
  assert.equal(res.body.entries.length, 1)
  assert.equal(res.body.entries[0].kcal, 80)
})

test('DELETE прибирає запис', async () => {
  await call(entries, { method: 'PUT', query: { id: 'entry-0001' }, body: { entry: entry() } })
  const del = await call(entries, { method: 'DELETE', query: { id: 'entry-0001', date: '2026-11-14' } })
  assert.equal(del.statusCode, 200)
  const res = await call(day, { query: { date: '2026-11-14' } })
  assert.deepEqual(res.body.entries, [])
})

test('валідація: 400 з назвою поля, id в URL має збігатися', async () => {
  const bad = await call(entries, { method: 'PUT', query: { id: 'entry-0001' }, body: { entry: entry({ kcal: -1 }) } })
  assert.equal(bad.statusCode, 400)
  assert.equal(bad.body.field, 'kcal')

  const mismatch = await call(entries, { method: 'PUT', query: { id: 'entry-9999' }, body: { entry: entry() } })
  assert.equal(mismatch.statusCode, 400)

  const method = await call(day, { method: 'POST', query: { date: '2026-11-14' } })
  assert.equal(method.statusCode, 405)
})

test('профіль: значення за замовчуванням, збереження, захист від старих версій', async () => {
  const initial = await call(profile)
  assert.equal(initial.body.profile.goals.kcal, 2000)
  assert.equal(initial.body.profile.updatedAt, 0)

  const goals = { kcal: 1800, protein: 140, fat: 60, carbs: 180 }
  const saved = await call(profile, { method: 'PUT', body: { profile: { goals, updatedAt: 500 } } })
  assert.equal(saved.body.applied, true)

  const stale = await call(profile, { method: 'PUT', body: { profile: { goals: { ...goals, kcal: 3000 }, updatedAt: 400 } } })
  assert.equal(stale.body.applied, false)

  const after = await call(profile)
  assert.deepEqual(after.body.profile, { goals, targetWeight: null, updatedAt: 500 })
})
