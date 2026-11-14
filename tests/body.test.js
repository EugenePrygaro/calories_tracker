import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { setRedisClient } from '../server/store.js'
import { sanitizeBodyRecord, sanitizeProfile } from '../shared/validate.js'
import { MemoryRedis } from '../scripts/memory-redis.js'
import { mockBody } from '../scripts/mock-data.js'
import body from '../api/body.js'
import profile from '../api/profile.js'

async function call(fn, { method = 'GET', query = {}, body: payload } = {}) {
  const res = {
    statusCode: 0, body: undefined, headers: {},
    status(c) { this.statusCode = c; return this },
    setHeader(k, v) { this.headers[k] = v },
    json(b) { this.body = b },
  }
  await fn({ method, query, body: payload, headers: {} }, res)
  return res
}

beforeEach(() => setRedisClient(new MemoryRedis()))

const rec = (over = {}) => ({ date: '2026-11-14', weight: '78,4', chest: '', waist: 84, hips: null, updatedAt: 1000, ...over })

test('заміри: кома, порожні поля → null, межі', () => {
  assert.deepEqual(sanitizeBodyRecord(rec()), { date: '2026-11-14', weight: 78.4, chest: null, waist: 84, hips: null, updatedAt: 1000 })
  assert.throws(() => sanitizeBodyRecord(rec({ weight: '', waist: '' })), /invalid_empty/)
  assert.throws(() => sanitizeBodyRecord(rec({ weight: 5 })), /invalid_weight/)
  assert.throws(() => sanitizeBodyRecord(rec({ waist: 999 })), /invalid_waist/)
  assert.throws(() => sanitizeBodyRecord(rec({ date: '2026-02-30' })), /invalid_date/)
})

test('профіль: цільова вага необов’язкова', () => {
  const goals = { kcal: 2000, protein: 120, fat: 70, carbs: 220 }
  assert.equal(sanitizeProfile({ goals, updatedAt: 1 }).targetWeight, null)
  assert.equal(sanitizeProfile({ goals, targetWeight: '74,5', updatedAt: 1 }).targetWeight, 74.5)
  assert.throws(() => sanitizeProfile({ goals, targetWeight: 1000, updatedAt: 1 }), /invalid_targetWeight/)
})

test('API body: запис, список за датою, захист від старих версій, видалення', async () => {
  const put = (r) => call(body, { method: 'PUT', query: { date: r.date }, body: { record: r } })
  await put(rec({ date: '2026-11-14' }))
  await put(rec({ date: '2026-11-01', weight: 80 }))

  const list = await call(body)
  assert.deepEqual(list.body.records.map((r) => r.date), ['2026-11-01', '2026-11-14'])

  const stale = await put(rec({ weight: 70, updatedAt: 500 }))
  assert.equal(stale.body.applied, false)
  assert.equal(stale.body.record.weight, 78.4)

  const mismatch = await call(body, { method: 'PUT', query: { date: '2026-11-13' }, body: { record: rec() } })
  assert.equal(mismatch.statusCode, 400)

  await call(body, { method: 'DELETE', query: { date: '2026-11-01' } })
  assert.deepEqual((await call(body)).body.records.map((r) => r.date), ['2026-11-14'])
})

test('API profile: цільова вага зберігається', async () => {
  const goals = { kcal: 1800, protein: 140, fat: 60, carbs: 180 }
  await call(profile, { method: 'PUT', body: { profile: { goals, targetWeight: 75, updatedAt: 10 } } })
  assert.equal((await call(profile)).body.profile.targetWeight, 75)
})

test('мокова історія: місяць, вага 73 → 76, сьогоднішні об’єми', () => {
  const records = mockBody(new Date(2026, 10, 14).getTime())
  const dates = records.map((r) => r.date)
  assert.deepEqual(dates, [...dates].sort())
  assert.equal(dates[0], '2026-10-15') // 30 днів тому
  assert.equal(dates.at(-1), '2026-11-14')
  assert.ok(records.every((r) => r.weight !== null && r.weight >= 72.5 && r.weight <= 76.5))
  assert.equal(records[0]?.weight, 73)
  assert.deepEqual(records.at(-1), { date: '2026-11-14', weight: 76, chest: 100, waist: 87, hips: 110, updatedAt: records.at(-1)?.updatedAt })
  assert.equal(records.filter((r) => r.waist !== null).length, 3) // заміри раз на 2 тижні
})
