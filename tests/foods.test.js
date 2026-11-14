import { afterEach, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { setRedisClient } from '../server/store.js'
import { normalizeOffHit } from '../server/off.js'
import { sanitizeFood } from '../shared/validate.js'
import { MemoryRedis } from '../scripts/memory-redis.js'
import { mockEntries, mockFoods } from '../scripts/mock-data.js'
import foods from '../api/foods.js'
import search from '../api/search.js'

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

const hit = (over = {}) => ({
  code: '4813494063866',
  product_name: 'Гречка',
  brands: ['Бабусина кухня'],
  serving_quantity: '80',
  image_front_small_url: 'https://images.openfoodfacts.org/images/products/481/front_en.3.200.jpg',
  nutriments: { 'energy-kcal_100g': 340, proteins_100g: 13, fat_100g: 3.0999999046325684, carbohydrates_100g: 66 },
  ...over,
})

// ─── Open Food Facts ────────────────────────────────────────────────────────

test('OFF: нормалізація результату', () => {
  assert.deepEqual(normalizeOffHit(hit()), {
    id: 'off-4813494063866',
    name: 'Гречка',
    brand: 'Бабусина кухня',
    per100: { kcal: 340, protein: 13, fat: 3.1, carbs: 66 },
    servingGrams: 80,
    source: 'off',
    offCode: '4813494063866',
    imageUrl: 'https://images.openfoodfacts.org/images/products/481/front_en.3.200.jpg',
  })
})

test('OFF: без energy-kcal_100g продукт відкидається', () => {
  assert.equal(normalizeOffHit(hit({ nutriments: { proteins_100g: 10 } })), null)
  assert.equal(normalizeOffHit(hit({ nutriments: { 'energy-kcal_100g': 'n/a' } })), null)
  assert.equal(normalizeOffHit(hit({ nutriments: { 'energy-kcal_100g': -5 } })), null)
  assert.equal(normalizeOffHit(hit({ nutriments: { 'energy-kcal_100g': 4000 } })), null)
  // energy (кДж) без kcal — теж ні
  assert.equal(normalizeOffHit(hit({ nutriments: { energy_100g: 1400 } })), null)
})

test('OFF: відкидає биті дані, підставляє безпечні значення', () => {
  assert.equal(normalizeOffHit(hit({ product_name: '  ' })), null)
  assert.equal(normalizeOffHit(hit({ code: 'abc' })), null)
  assert.equal(normalizeOffHit(hit({ nutriments: { 'energy-kcal_100g': 100, fat_100g: 150 } })), null)

  const r = normalizeOffHit(
    hit({ brands: 'A, B', serving_quantity: null, image_front_small_url: 'https://evil.example/x.jpg', nutriments: { 'energy-kcal_100g': 52 } }),
  )
  assert.equal(r?.brand, 'A')
  assert.equal(r?.servingGrams, null)
  assert.equal(r?.imageUrl, null)
  assert.deepEqual(r?.per100, { kcal: 52, protein: 0, fat: 0, carbs: 0 })
})

test('OFF: HTML-сутності в назві декодуються', () => {
  assert.equal(normalizeOffHit(hit({ product_name: 'Йогурт &quot;Абрикос&quot; &amp; Ко' }))?.name, 'Йогурт "Абрикос" & Ко')
})

test('OFF: українська назва має пріоритет', () => {
  assert.equal(normalizeOffHit(hit({ product_name_uk: 'Гречана крупа', product_name: 'Buckwheat' }))?.name, 'Гречана крупа')
})

// ─── API ────────────────────────────────────────────────────────────────────

const realFetch = globalThis.fetch
let offCalls = 0
beforeEach(() => {
  setRedisClient(new MemoryRedis())
  offCalls = 0
  globalThis.fetch = async (url) => {
    offCalls++
    assert.match(String(url), /search\.openfoodfacts\.org\/search\?q=/)
    return new Response(JSON.stringify({ hits: [hit(), hit(), hit({ code: '111111', nutriments: {} })] }))
  }
})
afterEach(() => {
  globalThis.fetch = realFetch
})

test('search: фільтрує, прибирає дублікати і кешує запит', async () => {
  const first = await call(search, { query: { q: '  Гречка ' } })
  assert.equal(first.statusCode, 200)
  assert.equal(first.body.results.length, 1)
  assert.equal(first.body.cached, false)

  const second = await call(search, { query: { q: 'гречка' } })
  assert.equal(second.body.cached, true)
  assert.equal(offCalls, 1)
})

test('search: короткий запит і недоступний каталог', async () => {
  assert.equal((await call(search, { query: { q: 'г' } })).statusCode, 400)
  globalThis.fetch = async () => new Response('busy', { status: 503 })
  const res = await call(search, { query: { q: 'рис' } })
  assert.equal(res.statusCode, 502)
  assert.equal(res.body.error, 'catalog_unavailable')
})

test('foods: збереження, список (нові першими), захист від старих версій, видалення', async () => {
  const item = normalizeOffHit(hit())
  const food = { ...item, createdAt: 1000, updatedAt: 1000 }
  const own = { id: 'own-food-0001', name: 'Сирники', brand: null, per100: { kcal: 220, protein: 15 }, servingGrams: 150, source: 'own', offCode: null, createdAt: 2000, updatedAt: 2000 }

  assert.equal((await call(foods, { method: 'PUT', query: { id: food.id }, body: { food } })).body.applied, true)
  await call(foods, { method: 'PUT', query: { id: own.id }, body: { food: own } })

  const list = await call(foods)
  assert.deepEqual(list.body.foods.map((f) => f.name), ['Сирники', 'Гречка'])

  const stale = await call(foods, { method: 'PUT', query: { id: own.id }, body: { food: { ...own, name: 'Старе', updatedAt: 1500 } } })
  assert.equal(stale.body.applied, false)

  await call(foods, { method: 'DELETE', query: { id: food.id } })
  assert.deepEqual((await call(foods)).body.foods.map((f) => f.id), [own.id])
})

test('foods: валідація', () => {
  const base = { id: 'own-food-0001', name: 'X', per100: { kcal: 100 }, source: 'own', createdAt: 1, updatedAt: 1 }
  assert.doesNotThrow(() => sanitizeFood(base))
  assert.throws(() => sanitizeFood({ ...base, name: '' }), /invalid_name/)
  assert.throws(() => sanitizeFood({ ...base, source: 'web' }), /invalid_source/)
  assert.throws(() => sanitizeFood({ ...base, source: 'off' }), /invalid_offCode/)
  assert.throws(() => sanitizeFood({ ...base, per100: {} }), /invalid_kcal/)
  // фото у «Моїх стравах» не зберігаються, навіть якщо прийшли з пошуку
  assert.equal('imageUrl' in sanitizeFood({ ...base, imageUrl: 'https://images.openfoodfacts.org/x.jpg' }), false)
})

test('мокові дані валідні й узгоджені', () => {
  const list = mockFoods(1_700_000_000_000)
  assert.equal(list.length, 15)
  const entries = mockEntries('2026-11-14', list)
  assert.equal(entries.length, 7)
  const oats = entries.find((e) => e.name === 'Вівсянка на воді')
  assert.equal(oats?.kcal, 220) // 88 ккал × 250 г
  assert.ok(entries.every((e) => e.date === '2026-11-14'))
})
