import { afterEach, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { setRedisClient } from '../server/store.js'
import { normalizeOffHit } from '../server/off.js'
import { rankByQuery } from '../server/catalog.js'
import { normalizeSilpo, silpoNutrients } from '../server/silpo.js'
import { normalizeZakaz } from '../server/zakaz.js'
import { sanitizeFood } from '../shared/validate.js'
import { canonicalEan, portionUnitLabel } from '../shared/model.js'
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
    barcode: '4813494063866',
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

// ─── Сільпо ──────────────────────────────────────────────────────────────────

/** Картка товару Сільпо з групою харчової цінності. */
const silpoDetail = (calorie = '116/488', macros = { proteins: 16, fats: 5, carbohydrates: '1,8' }) => ({
  title: 'X',
  attributeGroups: [
    { key: 'generalInfo', attributes: [{ attribute: { key: 'brand' }, value: { title: 'Біло' } }] },
    {
      key: 'nutrient',
      tag: 'Харчова цінність на 100 г',
      attributes: [
        ...(calorie === null ? [] : [{ attribute: { key: 'calorie' }, value: { key: calorie, title: calorie } }]),
        ...Object.entries(macros).map(([key, title]) => ({ attribute: { key }, value: { key: null, title } })),
      ],
    },
  ],
})

const silpoItem = (over = {}) => ({
  title: 'Сир кисломолочний Біло 5%',
  slug: 'syr-kyslomolochnyi-bilo-5-1009618',
  externalProductId: 1009618,
  brandTitle: 'Біло',
  icon: 'cb8eb98f-6249-4004-89f4-f92745b8f129.png',
  ...over,
})

test('Сільпо: харчова цінність з картки', () => {
  assert.deepEqual(silpoNutrients(silpoDetail()), { kcal: 116, protein: 16, fat: 5, carbs: 1.8 })
  // кома в десяткових, переплутаний порядок ккал/кДж
  assert.equal(silpoNutrients(silpoDetail('489,6/2048,5'))?.kcal, 489.6)
  assert.equal(silpoNutrients(silpoDetail('488/116'))?.kcal, 116)
  // без калорій — непридатний; без БЖВ — нулі
  assert.equal(silpoNutrients(silpoDetail(null)), null)
  assert.equal(silpoNutrients({}), null)
  assert.deepEqual(silpoNutrients(silpoDetail('52/218', {})), { kcal: 52, protein: 0, fat: 0, carbs: 0 })
  // биті значення
  assert.equal(silpoNutrients(silpoDetail('5000/20000')), null)
  assert.equal(silpoNutrients(silpoDetail('100/418', { fats: 150 })), null)
})

test('Сільпо: нормалізація товару', () => {
  assert.deepEqual(normalizeSilpo(silpoItem(), silpoDetail()), {
    id: 'silpo-1009618',
    name: 'Сир кисломолочний Біло 5%',
    brand: 'Біло',
    per100: { kcal: 116, protein: 16, fat: 5, carbs: 1.8 },
    servingGrams: null,
    source: 'silpo',
    offCode: '1009618',
    barcode: null,
    imageUrl: 'https://images.silpo.ua/products/300x300/webp/cb8eb98f-6249-4004-89f4-f92745b8f129.png',
  })
  // штрихкод — з картки: перший коректний
  assert.equal(normalizeSilpo(silpoItem(), { ...silpoDetail(), barcodes: ['123', '4820019494906'] })?.barcode, '4820019494906')
  assert.equal(normalizeSilpo(silpoItem({ icon: '../../evil.svg' }), silpoDetail())?.imageUrl, null)
  assert.equal(normalizeSilpo(silpoItem({ externalProductId: 'abc' }), silpoDetail()), null)
  assert.equal(normalizeSilpo(silpoItem({ title: ' ' }), silpoDetail()), null)
  assert.equal(normalizeSilpo(silpoItem(), silpoDetail(null)), null)
})

test('Сільпо: пересортування під запит', () => {
  const titles = ['Куряче філе', 'Кабаноси курячі', 'Пюре з бананом', 'Яйця курячі С1', 'Банан', 'Хліб']
  const rank = (q) => rankByQuery(titles.map((title) => ({ title })), q).map((i) => i.title)
  // усі слова запиту — вище; з першого слова назви — ще вище; без жодного слова — геть
  assert.deepEqual(rank('курячі яйця'), ['Яйця курячі С1', 'Куряче філе', 'Кабаноси курячі'])
  assert.deepEqual(rank('банан'), ['Банан', 'Пюре з бананом'])
  // апостроф будь-якого виду
  assert.equal(rankByQuery([{ title: 'Сир з коров’ячого молока' }], "коров'яче").length, 1)
})

// ─── Zakaz.ua ────────────────────────────────────────────────────────────────

const zakazProduct = (over = {}) => ({
  ean: '04823065731681',
  title: 'Сир кисломолочний President Сирна традиція 5% 300г',
  producer: { trademark: 'President' },
  img: { s200x200: 'https://img3.zakaz.ua/b298c88e/1687891671-s200x200.jpg' },
  nutrition_facts: {
    ingredient_energy: '108.00ккал',
    ingredient_protein: '14.00г',
    ingredient_fat: '5.00г',
    ingredient_carbohydrates: '1.80г',
  },
  ...over,
})

test('Zakaz.ua: нормалізація товару', () => {
  assert.deepEqual(normalizeZakaz(zakazProduct()), {
    id: 'zakaz-04823065731681',
    name: 'Сир кисломолочний President Сирна традиція 5% 300г',
    brand: 'President',
    per100: { kcal: 108, protein: 14, fat: 5, carbs: 1.8 },
    servingGrams: null,
    source: 'zakaz',
    offCode: '04823065731681',
    barcode: '4823065731681',
    imageUrl: 'https://img3.zakaz.ua/b298c88e/1687891671-s200x200.jpg',
  })
  // лише кДж — переводимо; без калорій — непридатний; без БЖВ — нулі
  assert.equal(normalizeZakaz(zakazProduct({ nutrition_facts: { ingredient_energy: '450кДж' } }))?.per100.kcal, 107.6)
  assert.equal(normalizeZakaz(zakazProduct({ nutrition_facts: {} })), null)
  assert.equal(normalizeZakaz(zakazProduct({ nutrition_facts: null })), null)
  assert.deepEqual(normalizeZakaz(zakazProduct({ nutrition_facts: { ingredient_energy: '52ккал' } }))?.per100, {
    kcal: 52, protein: 0, fat: 0, carbs: 0,
  })
  // биті дані
  assert.equal(normalizeZakaz(zakazProduct({ ean: 'abc' })), null)
  assert.equal(normalizeZakaz(zakazProduct({ title: '' })), null)
  assert.equal(normalizeZakaz(zakazProduct({ nutrition_facts: { ingredient_energy: '100ккал', ingredient_fat: '150г' } })), null)
  assert.equal(normalizeZakaz(zakazProduct({ img: { s200x200: 'https://evil.example/x.jpg' } }))?.imageUrl, null)
  assert.equal(normalizeZakaz(zakazProduct({ producer: null }))?.brand, null)
})

// ─── API ────────────────────────────────────────────────────────────────────

const realFetch = globalThis.fetch
/** Що «відповідає інтернет»: Сільпо (список і картки) та OFF. */
let net
const json = (body, status = 200) => new Response(JSON.stringify(body), { status })

beforeEach(() => {
  setRedisClient(new MemoryRedis())
  net = {
    calls: { silpo: 0, silpoDetail: 0, zakaz: 0, off: 0 },
    silpoItems: [],
    silpoDown: false,
    detail: () => silpoDetail(),
    zakazProducts: [],
    zakazDown: false,
    offHits: [hit(), hit(), hit({ code: '111111', nutriments: {} })],
    offDown: false,
  }
  globalThis.fetch = async (url, init) => {
    const u = String(url)
    if (u.startsWith('https://stores-api.zakaz.ua/')) {
      net.calls.zakaz++
      assert.match(u, /\/products\/search\/\?q=/)
      // без цього заголовка Zakaz.ua віддає назви англійською
      assert.equal(init?.headers?.['Accept-Language'], 'uk')
      return net.zakazDown ? json({ error: 'busy' }, 503) : json({ results: net.zakazProducts })
    }
    if (u.startsWith('https://sf-ecom-api.silpo.ua/')) {
      const slug = /\/products\/([^/?]+)$/.exec(u)?.[1]
      if (slug) {
        net.calls.silpoDetail++
        const d = net.detail(slug)
        return d ? json(d) : json({ error: 'busy' }, 503)
      }
      net.calls.silpo++
      assert.match(u, /\/products\?limit=\d+&search=/)
      return net.silpoDown ? json({ error: 'busy' }, 503) : json({ items: net.silpoItems })
    }
    assert.match(u, /search\.openfoodfacts\.org\/search\?q=/)
    net.calls.off++
    return net.offDown ? new Response('busy', { status: 503 }) : json({ hits: net.offHits })
  }
})
afterEach(() => {
  globalThis.fetch = realFetch
})

/** n яєць із Сільпо — досить, щоб OFF не знадобився. */
const eggs = (n) =>
  Array.from({ length: n }, (_, i) =>
    silpoItem({ title: `Яйця курячі С${i}`, slug: `yaitsia-${i}`, externalProductId: 2000000 + i }),
  )

test('search: Сільпо — основне джерело, пересортоване, з кешем на добу', async () => {
  net.silpoItems = [
    silpoItem({ title: 'Куряче філе', slug: 'file', externalProductId: 1000001 }),
    ...eggs(5),
    silpoItem({ title: 'Хліб', slug: 'khlib', externalProductId: 1000002 }),
  ]
  net.detail = (slug) => (slug === 'yaitsia-4' ? silpoDetail(null) : silpoDetail())

  const first = await call(search, { query: { q: '  Курячі   яйця ' } })
  assert.equal(first.statusCode, 200)
  const names = first.body.results.map((r) => r.name)
  // яйця перші, «Хліб» відкинуто, яйце без калорій відкинуто
  assert.deepEqual(names, ['Яйця курячі С0', 'Яйця курячі С1', 'Яйця курячі С2', 'Яйця курячі С3', 'Куряче філе'])
  assert.ok(first.body.results.every((r) => r.source === 'silpo'))
  assert.equal(net.calls.silpoDetail, 6)
  assert.match(first.headers['CDN-Cache-Control'], /max-age=86400/)

  // 5 результатів — OFF не потрібен; повторний запит — з кешу
  assert.equal(net.calls.off, 0)
  const second = await call(search, { query: { q: 'курячі яйця' } })
  assert.equal(second.body.cached, true)
  assert.equal(net.calls.silpo, 1)
})

test('search: Сільпо недоступне — Zakaz.ua, кеш короткий', async () => {
  net.silpoDown = true
  net.zakazProducts = Array.from({ length: 5 }, (_, i) =>
    zakazProduct({ ean: `482000000000${i}`, title: `Гречка ядриця ${i}` }),
  )
  const res = await call(search, { query: { q: 'гречка' } })
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.results.length, 5)
  assert.ok(res.body.results.every((r) => r.source === 'zakaz'))
  assert.equal(net.calls.off, 0)
  // Сільпо може скоро ожити — лише Redis і на 10 хвилин, без CDN
  assert.equal(res.headers['CDN-Cache-Control'], undefined)
  assert.equal(res.headers['Cache-Control'], 'no-store')
  await call(search, { query: { q: 'гречка' } })
  assert.equal(net.calls.silpo, 1)
})

test('search: Сільпо й Zakaz.ua недоступні — Open Food Facts', async () => {
  net.silpoDown = true
  net.zakazDown = true
  const res = await call(search, { query: { q: 'гречка' } })
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body.results.map((r) => r.id), ['off-4813494063866'])
})

test('search: мало в Сільпо — доповнюємо по черзі, без дублікатів за назвою', async () => {
  net.silpoItems = [silpoItem({ title: 'Гречка ядриця', slug: 'grechka', externalProductId: 3000001 })]
  net.zakazProducts = [
    zakazProduct({ ean: '4820000000001', title: 'Гречка «Ядриця»' }), // та сама назва, інші лапки
    zakazProduct({ ean: '4820000000002', title: 'Гречка зелена' }),
    zakazProduct({ ean: '4820000000003', title: 'Хліб' }), // не про гречку — відкидається
  ]
  const res = await call(search, { query: { q: 'гречка' } })
  assert.deepEqual(res.body.results.map((r) => r.id), ['silpo-3000001', 'zakaz-4820000000002', 'off-4813494063866'])
  assert.equal(net.calls.off, 1)
  assert.match(res.headers['CDN-Cache-Control'], /max-age=86400/)
})

test('search: частина карток Сільпо не відкрилась — результат є, але кеш короткий', async () => {
  net.silpoItems = eggs(6)
  net.detail = (slug) => (slug === 'yaitsia-0' ? null : silpoDetail())
  const res = await call(search, { query: { q: 'яйця' } })
  assert.equal(res.body.results.length, 5)
  assert.equal(res.headers['CDN-Cache-Control'], undefined)
})

test('search: короткий запит і недоступні всі джерела', async () => {
  assert.equal((await call(search, { query: { q: 'г' } })).statusCode, 400)
  net.silpoDown = true
  net.zakazDown = true
  net.offDown = true
  const res = await call(search, { query: { q: 'рис' } })
  assert.equal(res.statusCode, 502)
  assert.equal(res.body.error, 'catalog_unavailable')
})

test('штрихкод: один вигляд для всіх джерел і контрольна цифра', () => {
  assert.equal(canonicalEan('4820019494906'), '4820019494906')
  assert.equal(canonicalEan('04820019494906'), '4820019494906') // Zakaz.ua: GTIN-14
  assert.equal(canonicalEan('036000291452'), '0036000291452') // UPC-A
  assert.equal(canonicalEan('96385074'), '96385074') // EAN-8
  assert.equal(canonicalEan('00000096385074'), '96385074') // EAN-8 у формі GTIN-14 (Zakaz.ua)
  assert.equal(canonicalEan('0000096385074'), '96385074') // EAN-8 у формі GTIN-13
  assert.equal(canonicalEan('14820019494903'), null) // GTIN-14 ящика, не товару
  assert.equal(canonicalEan('4820019494907'), null) // хибна контрольна цифра
  assert.equal(canonicalEan('12345'), null)
  assert.equal(canonicalEan(null), null)
})

test('search?ean: Сільпо → Zakaz.ua → OFF, кеш і «не знайдено»', async () => {
  const EAN = '4820019494906'
  // Сільпо: шукає за EAN, але в картці інший штрихкод — не той товар
  net.silpoItems = [silpoItem({ slug: 'inshyi' })]
  net.detail = () => ({ ...silpoDetail(), barcodes: ['4823065731681'] })
  // Zakaz.ua: картка за 14-значним кодом
  let zakazUrl = ''
  const prevFetch = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('/products/0' + EAN)) {
      zakazUrl = String(url)
      return json({ product: zakazProduct({ ean: '0' + EAN, title: 'Сир кисломолочний Біло 5%' }) })
    }
    return prevFetch(url, init)
  }
  const res = await call(search, { query: { ean: EAN } })
  assert.equal(res.statusCode, 200)
  assert.deepEqual(res.body.results.map((r) => [r.source, r.barcode]), [['zakaz', EAN]])
  assert.match(zakazUrl, /stores\/\d+\/products\/04820019494906\/$/)
  assert.match(res.headers['CDN-Cache-Control'], /max-age=/)
  // повторно — з кешу, без джерел
  const silpoCalls = net.calls.silpo
  assert.equal((await call(search, { query: { ean: EAN } })).body.cached, true)
  assert.equal(net.calls.silpo, silpoCalls)

  // хибний код — 400
  assert.equal((await call(search, { query: { ean: '4820019494907' } })).statusCode, 400)
})

test('search?ean: збійна картка Сільпо не заважає знайти товар у наступній', async () => {
  const EAN = '4820019494906'
  net.silpoItems = [silpoItem({ slug: 'zbiina' }), silpoItem({ slug: 'bilo', externalProductId: 1009618 })]
  net.detail = (slug) => (slug === 'zbiina' ? null : { ...silpoDetail(), barcodes: [EAN] })
  const res = await call(search, { query: { ean: EAN } })
  assert.deepEqual(res.body.results.map((r) => [r.source, r.id]), [['silpo', 'silpo-1009618']])
  assert.equal(net.calls.silpoDetail, 2) // обидві картки — паралельно
})

test('search?ean: ніде немає — порожньо; усе впало — 502', async () => {
  globalThis.fetch = async (url) => {
    const u = String(url)
    if (u.includes('sf-ecom-api.silpo.ua')) return json({ items: [] })
    if (u.includes('stores-api.zakaz.ua')) return json({ error: 'not found' }, 404)
    if (u.includes('openfoodfacts.org/api/v2/product/')) return json({ status: 0 }, 404)
    throw new Error('unexpected ' + u)
  }
  const none = await call(search, { query: { ean: '3017620422003' } })
  assert.deepEqual(none.body.results, [])
  assert.equal(none.headers['CDN-Cache-Control'], undefined)

  globalThis.fetch = async () => json({ error: 'busy' }, 503)
  assert.equal((await call(search, { query: { ean: '4823065731681' } })).statusCode, 502)
})

test('search?ean: OFF — за офіційним API продукту', async () => {
  globalThis.fetch = async (url) => {
    const u = String(url)
    if (u.includes('sf-ecom-api.silpo.ua')) return json({ items: [] })
    if (u.includes('stores-api.zakaz.ua')) return json({}, 404)
    assert.match(u, /world\.openfoodfacts\.org\/api\/v2\/product\/3017620422003\.json/)
    return json({ status: 1, product: { product_name: 'Nutella', brands: 'Ferrero', nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3 } } })
  }
  const res = await call(search, { query: { ean: '3017620422003' } })
  assert.deepEqual(res.body.results.map((r) => [r.source, r.name, r.barcode, r.per100.kcal]), [['off', 'Nutella', '3017620422003', 539]])
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
  assert.throws(() => sanitizeFood({ ...base, source: 'silpo' }), /invalid_offCode/)
  assert.equal(sanitizeFood({ ...base, source: 'silpo', offCode: '1009618' }).source, 'silpo')
  assert.equal(sanitizeFood({ ...base, source: 'zakaz', offCode: '04823065731681' }).source, 'zakaz')
  // штрихкод зберігається в одному вигляді; хибний — відкидається, а не ламає страву
  assert.equal(sanitizeFood({ ...base, barcode: '04820019494906' }).barcode, '4820019494906')
  assert.equal(sanitizeFood({ ...base, barcode: '123' }).barcode, null)
  assert.throws(() => sanitizeFood({ ...base, per100: {} }), /invalid_kcal/)
  // фото у «Моїх стравах» не зберігаються, навіть якщо прийшли з пошуку
  assert.equal('imageUrl' in sanitizeFood({ ...base, imageUrl: 'https://images.openfoodfacts.org/x.jpg' }), false)
})

test('foods: порції', async () => {
  const base = { id: 'own-food-0002', name: 'Яйце варене', per100: { kcal: 155 }, source: 'own', createdAt: 1, updatedAt: 1 }
  // старі страви в Redis без поля — порожньо
  assert.deepEqual(sanitizeFood(base).portions, [])
  // порядок — як у списку одиниць; повтор одиниці — перемагає останній; кома в числах
  const food = sanitizeFood({
    ...base,
    portions: [{ unit: 'package', grams: '300' }, { unit: 'piece', grams: 60 }, { unit: 'piece', grams: '55,5' }],
  })
  assert.deepEqual(food.portions, [{ unit: 'piece', grams: 55.5 }, { unit: 'package', grams: 300 }])

  assert.throws(() => sanitizeFood({ ...base, portions: [{ unit: 'cup', grams: 200 }] }), /invalid_portions/)
  assert.throws(() => sanitizeFood({ ...base, portions: [{ unit: 'piece', grams: 0 }] }), /invalid_portions/)
  assert.throws(() => sanitizeFood({ ...base, portions: [{ unit: 'piece', grams: 6000 }] }), /invalid_portions/)
  assert.throws(() => sanitizeFood({ ...base, portions: 'штука' }), /invalid_portions/)
  assert.throws(
    () => sanitizeFood({ ...base, portions: Array.from({ length: 100 }, () => ({ unit: 'piece', grams: 1 })) }),
    /invalid_portions/,
  )

  // відмінки для лічби порцій
  assert.deepEqual([1, 2, 5, 21, 1.5].map((n) => portionUnitLabel('piece', n)), ['штука', 'штуки', 'штук', 'штука', 'штуки'])
  assert.deepEqual([1, 3, 11, 0.5].map((n) => portionUnitLabel('chunk', n)), ['шматок', 'шматки', 'шматків', 'шматка'])

  // через API туди й назад
  await call(foods, { method: 'PUT', query: { id: food.id }, body: { food } })
  const list = await call(foods)
  assert.deepEqual(list.body.foods.find((f) => f.id === food.id)?.portions, food.portions)
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
