/**
 * Локальний API без Vercel і Redis: ті самі обробники з api/,
 * але сховище — scripts/memory-redis.js з файлом .data/dev-redis.json.
 * Фронтенд віддає Vite (scripts/dev.mjs), сюди він проксує /api/*.
 */
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { KEYS, setRedisClient } from '../server/store.js'
import { DEFAULT_GOALS } from '../shared/model.js'
import { MemoryRedis } from './memory-redis.js'
import { MOCK_TARGET_WEIGHT, mockBody, mockEntries, mockFoods, mockHistory, todayKey } from './mock-data.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// Локальні секрети (напр. GEMINI_API_KEY для фото етикетки) — з .env.local чи .env, якщо є.
// Обидва в .gitignore; змінні, задані в терміналі, мають перевагу.
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(path.join(root, file))
    console.log(`  ➜  Змінні з ${file}`)
  } catch {
    // файлу немає — працюємо без нього
  }
}

const dataFile = process.env.DEV_DATA_FILE || path.join(root, '.data', 'dev-redis.json')
const store = new MemoryRedis(dataFile)
setRedisClient(store)

const port = Number(process.env.API_PORT || 5174)

// Порожня база → одразу мокові страви й записи на сьогодні (вимкнути: NO_SEED=1).
if (!process.env.NO_SEED && !(await store.hgetall(KEYS.foods))) {
  const foods = mockFoods()
  const date = todayKey()
  const entries = mockEntries(date, foods)
  await store.hset(KEYS.foods, Object.fromEntries(foods.map((f) => [f.id, f])))
  if (!(await store.hgetall(KEYS.day(date)))) {
    await store.hset(KEYS.day(date), Object.fromEntries(entries.map((e) => [e.id, e])))
  }
  console.log(`  ➜  Мокові дані: ${foods.length} страв, записи на ${date}`)
}

// Історія ваги/об'ємів і цільова вага — окремо, щоб підхопилось і в уже наповненій базі.
if (!process.env.NO_SEED && !(await store.hgetall(KEYS.body))) {
  const records = mockBody()
  await store.hset(KEYS.body, Object.fromEntries(records.map((r) => [r.date, r])))
  const profile = /** @type {{ goals?: unknown, targetWeight?: unknown } | null} */ (await store.get(KEYS.profile))
  if (!profile?.targetWeight) {
    await store.set(KEYS.profile, {
      goals: profile?.goals ?? DEFAULT_GOALS,
      targetWeight: MOCK_TARGET_WEIGHT,
      updatedAt: Date.now(),
    })
  }
  console.log(`  ➜  Мокові заміри: ${records.length} записів, ціль ${MOCK_TARGET_WEIGHT} кг`)
}

// Історія записів за ~4 місяці — для статистики й теплової карти (лише в порожні дні).
if (!process.env.NO_SEED && !(await store.get('ct:seed:history'))) {
  const foods = mockFoods()
  const history = mockHistory(120, foods)
  for (const [date, entries] of Object.entries(history)) {
    if (!(await store.hgetall(KEYS.day(date)))) {
      await store.hset(KEYS.day(date), Object.fromEntries(entries.map((e) => [e.id, e])))
    }
  }
  await store.set('ct:seed:history', 1)
  await store.set(KEYS.summaryReady, 0) // підсумки перебудуються з усіх днів при першому запиті
  console.log(`  ➜  Мокова історія: ${Object.keys(history).length} днів записів`)
}

/**
 * Додає до req/res ті самі помічники, що дає Vercel.
 * @param {http.IncomingMessage} req @param {http.ServerResponse} res @param {URL} url
 */
async function withVercelHelpers(req, res, url) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  const raw = Buffer.concat(chunks).toString('utf8')
  const isJson = (req.headers['content-type'] || '').includes('json')
  return {
    req: Object.assign(req, {
      query: Object.fromEntries(url.searchParams),
      body: raw && isJson ? JSON.parse(raw) : raw || undefined,
    }),
    res: Object.assign(res, {
      /** @param {number} code */
      status(code) {
        res.statusCode = code
        return res
      },
      /** @param {unknown} body */
      json(body) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify(body))
      },
    }),
  }
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost')
    try {
      const name = url.pathname.startsWith('/api/') ? url.pathname.slice(5).replace(/[^a-z-]/g, '') : ''
      const mod = name ? await import(`../api/${name}.js`).catch(() => null) : null
      if (!mod) {
        res.statusCode = 404
        return res.end('not found')
      }
      const ctx = await withVercelHelpers(req, res, url)
      await mod.default(ctx.req, ctx.res)
    } catch (err) {
      console.error(err)
      res.statusCode = 500
      res.end('error')
    }
  })
  .listen(port, '127.0.0.1', () => {
    console.log(`  ➜  API (in-memory Redis): http://127.0.0.1:${port}/api`)
  })
