/**
 * Заливає мокові дані через API.
 *   npm run seed                                  → локальний dev (http://127.0.0.1:5173)
 *   npm run seed -- https://<app>.vercel.app      → задеплоєна версія
 *   npm run seed -- --reset-body [url]            → спершу ВИДАЛЯЄ всю історію замірів тіла і ставить мокову ціль
 *
 * Страви й записи на сьогодні — ідемпотентно (id детерміновані).
 * Заміри тіла додаються/оновлюються за датами; без --reset-body старі записи лишаються.
 */
import { MOCK_TARGET_WEIGHT, mockBody, mockEntries, mockFoods, todayKey } from './mock-data.js'

const args = process.argv.slice(2)
const resetBody = args.includes('--reset-body')
const base = (args.find((a) => !a.startsWith('--')) || 'http://127.0.0.1:5173').replace(/\/$/, '')

// На задеплоєній версії мок-дані потрапили б у справжній щоденник і гру (монети, ачівки)
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base) && !args.includes('--force')) {
  console.error(
    `✗ ${base} — не локальна адреса. Мокові записи нарахують монети й відкриють ачівки у справжньому стані гри.` +
      '\n  Якщо це свідомо — додайте --force.',
  )
  process.exit(1)
}

/** @param {string} method @param {string} path @param {unknown} [body] @returns {Promise<any>} */
async function req(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : null,
  })
  if (!res.ok) throw new Error(`${method} ${path}: HTTP ${res.status} ${await res.text()}`)
  return res.json()
}

const now = Date.now()
const foods = mockFoods()
const date = todayKey()
const entries = mockEntries(date, foods)
// Свіжі мітки часу, щоб оновлення перемогло наявні версії (перемагає більший updatedAt).
const body = mockBody().map((r, i) => ({ ...r, updatedAt: now + i }))

for (const food of foods) await req('PUT', `/api/foods?id=${food.id}`, { food })
for (const entry of entries) await req('PUT', `/api/entries?id=${entry.id}`, { entry })

if (resetBody) {
  const { records } = await req('GET', '/api/body')
  for (const r of records) await req('DELETE', `/api/body?date=${r.date}`)
  console.log(`  видалено старих замірів: ${records.length}`)
}
for (const record of body) await req('PUT', `/api/body?date=${record.date}`, { record })

const { profile } = await req('GET', '/api/profile')
// З --reset-body ціль теж скидається на мокову.
const setTarget = resetBody || profile.targetWeight == null
if (setTarget) {
  await req('PUT', '/api/profile', {
    profile: { goals: profile.goals, targetWeight: MOCK_TARGET_WEIGHT, updatedAt: Math.max(now, profile.updatedAt + 1) },
  })
}

console.log(
  `✓ ${base}: ${foods.length} страв, ${entries.length} записів на ${date}, ${body.length} замірів тіла` +
    (setTarget ? `, ціль ${MOCK_TARGET_WEIGHT} кг` : ''),
)
