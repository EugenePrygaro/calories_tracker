import { afterEach, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { KEYS, setRedisClient } from '../server/store.js'
import { interactionText } from '../server/gemini.js'
import { addDays } from '../shared/insights.js'
import { MemoryRedis } from '../scripts/memory-redis.js'

// ліміт читається при завантаженні модуля — задаємо до імпорту
process.env.AI_DAILY_LIMIT = '2'
const { default: ai, sanitizeLabel } = await import('../api/ai.js')
const { default: stats } = await import('../api/stats.js')

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

const TODAY = new Date().toISOString().slice(0, 10)
const entry = (date, i, name, kcal, meal = 'lunch') => ({
  id: `e-${date}-${i}`, date, meal, mode: 'quick', name, kcal, protein: 20, fat: 10, carbs: 30, createdAt: 1, updatedAt: 1,
})
/** «Фото» — кілька байт у base64 (серверу байти не важливі, лише формат і розмір). */
const PHOTO = Buffer.from('fake-jpeg-bytes').toString('base64')
const LABEL_REPLY = {
  found: true,
  name: 'Сир кисломолочний 5%',
  brand: 'Ферма',
  kcal_100g: 121,
  protein_100g: 16.5,
  fat_100g: 5,
  carbs_100g: 2.8,
  package_grams: 350,
  confidence: 'high',
  note: '',
}

const realFetch = globalThis.fetch
let redis
let geminiCalls
let reply
beforeEach(() => {
  redis = new MemoryRedis()
  setRedisClient(redis)
  geminiCalls = []
  reply = LABEL_REPLY
  delete process.env.GEMINI_API_KEY
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'https://generativelanguage.googleapis.com/v1beta/interactions')
    geminiCalls.push({ headers: init.headers, body: JSON.parse(init.body) })
    return new Response(
      JSON.stringify({
        status: 'completed',
        steps: [{ type: 'model_output', content: [{ type: 'text', text: JSON.stringify(reply) }] }],
      }),
    )
  }
})
afterEach(() => {
  globalThis.fetch = realFetch
})

const label = (body = {}) => call(ai, { method: 'POST', body: { action: 'label', image: PHOTO, mimeType: 'image/jpeg', ...body } })

test('ai: без ключа — «не налаштовано», Gemini не викликається', async () => {
  assert.deepEqual((await call(ai)).body, { configured: false, left: 0 })
  const res = await label()
  assert.equal(res.statusCode, 503)
  assert.equal(res.body.error, 'ai_not_configured')
  assert.equal(geminiCalls.length, 0)
})

test('ai: фото етикетки → КБЖВ на 100 г і вага упаковки', async () => {
  process.env.GEMINI_API_KEY = 'test-key'
  assert.deepEqual((await call(ai)).body, { configured: true, left: 2 })
  const res = await label()
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body.label, {
    found: true,
    name: 'Сир кисломолочний 5%',
    brand: 'Ферма',
    per100: { kcal: 121, protein: 16.5, fat: 5, carbs: 2.8 },
    packageGrams: 350,
    confidence: 'high',
    note: '',
  })
  assert.equal(res.body.left, 1)

  const [{ headers, body }] = geminiCalls
  assert.equal(headers['x-goog-api-key'], 'test-key')
  assert.equal(body.store, false)
  assert.deepEqual(body.input[1], { type: 'image', data: PHOTO, mime_type: 'image/jpeg' })
  assert.equal(body.response_format.mime_type, 'application/json')
  assert.ok(body.response_format.schema.required.includes('kcal_100g'))
  assert.match(body.system_instruction, /кДж/) // перерахунок кДж → ккал прописано
})

test('ai: префікс data: прибирається; хибний тип чи вміст і завелике фото — відмова', async () => {
  process.env.GEMINI_API_KEY = 'test-key'
  assert.equal((await label({ image: `data:image/jpeg;base64,${PHOTO}` })).statusCode, 200)
  assert.equal(geminiCalls[0].body.input[1].data, PHOTO)
  assert.equal((await label({ mimeType: 'image/gif' })).statusCode, 400)
  assert.equal((await label({ image: 'не base64!' })).statusCode, 400)
  assert.equal((await label({ image: 'A'.repeat(4_200_000) })).statusCode, 413)
  assert.equal((await call(ai, { method: 'POST', body: { action: 'review' } })).statusCode, 400)
})

test('ai: денний ліміт (за датою сервера)', async () => {
  process.env.GEMINI_API_KEY = 'test-key'
  assert.equal((await label()).statusCode, 200)
  assert.equal((await label()).statusCode, 200)
  const third = await label()
  assert.equal(third.statusCode, 429)
  assert.equal(third.body.error, 'ai_daily_limit')
  assert.equal(geminiCalls.length, 2)
})

test('ai: Gemini впав або відповів не JSON — 502', async () => {
  process.env.GEMINI_API_KEY = 'test-key'
  globalThis.fetch = async () => new Response('{"error":"boom"}', { status: 500 })
  assert.equal((await label()).body.error, 'ai_unavailable')
  globalThis.fetch = async () => new Response(JSON.stringify({ steps: [{ type: 'model_output', content: [{ type: 'text', text: 'не json' }] }] }))
  assert.equal((await label()).body.error, 'ai_bad_response')
})

test('етикетка: відповідь моделі очищується — межі, «не знайдено», впевненість', () => {
  // нічого не видно — found: false, без цифр
  assert.deepEqual(sanitizeLabel({ found: false, kcal_100g: 0 }), {
    found: false, name: '', brand: null, per100: null, packageGrams: null, confidence: 'low', note: '',
  })
  // «знайдено», але без калорій — не віримо
  assert.equal(sanitizeLabel({ ...LABEL_REPLY, kcal_100g: 0 }).found, false)
  // нереальні значення відкидаються в 0, вага упаковки поза межами — немає
  const odd = sanitizeLabel({ ...LABEL_REPLY, fat_100g: 500, protein_100g: -3, package_grams: 99999, confidence: 'дуже' })
  assert.deepEqual(odd.per100, { kcal: 121, protein: 0, fat: 0, carbs: 2.8 })
  assert.equal(odd.packageGrams, null)
  assert.equal(odd.confidence, 'low')
  assert.equal(sanitizeLabel({ ...LABEL_REPLY, kcal_100g: 5000 }).found, false)
})

test('stats?foods: що дає найбільше калорій, кеш на добу', async () => {
  for (let d = 1; d <= 10; d++) {
    const date = addDays(TODAY, -d)
    await redis.hset(KEYS.day(date), {
      [`e-${date}-1`]: entry(date, 1, 'Хліб', 300, 'breakfast'),
      [`e-${date}-2`]: entry(date, 2, 'Борщ', 500),
    })
  }
  const res = await call(stats, { query: { foods: TODAY } })
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body.foods.foods.map((f) => [f.name, f.share, f.times]), [['Борщ', 62.5, 10], ['Хліб', 37.5, 10]])
  assert.equal(res.body.foods.meals.breakfast, 37.5)
  assert.ok(await redis.get(KEYS.foodMix(TODAY)))
  assert.equal((await call(stats, { query: { foods: 'вчора' } })).statusCode, 400)
})

test('gemini: текст відповіді з кроків моделі', () => {
  assert.equal(interactionText({ steps: [{ type: 'model_output', content: [{ type: 'text', text: '{"a"' }, { type: 'text', text: ':1}' }] }] }), '{"a":1}')
  assert.equal(interactionText({ output_text: 'x' }), 'x')
  assert.equal(interactionText(null), '')
})
