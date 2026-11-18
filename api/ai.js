/**
 * AI (Gemini, Google AI Studio).
 * GET  /api/ai                                         → { configured, left }  чи увімкнено й скільки викликів лишилось
 * POST /api/ai { action: 'label', image, mimeType }   → { label: LabelReading, left }
 *      фото етикетки (таблиця «Харчова цінність» чи текст на звороті) → назва, КБЖВ на 100 г, вага упаковки.
 *
 * Сайт відкритий без входу, тож виклики Gemini обмежені за добу (AI_DAILY_LIMIT, рахується
 * за датою сервера): це захищає кредит в AI Studio.
 */
import { geminiConfigured, geminiJson } from '../server/gemini.js'
import { HttpError, handler, readJson, send } from '../server/http.js'
import { KEYS, parseStored, redis } from '../server/store.js'
import { LIMITS } from '../shared/model.js'
import { round1 } from '../shared/nutrition.js'
import { obj, str } from '../shared/validate.js'

/** @typedef {import('../server/store.js').RedisClient} RedisClient */

/**
 * Що прочитали з етикетки. found: false — на фото немає харчової цінності.
 * @typedef {{
 *   found: boolean, name: string, brand: string | null,
 *   per100: { kcal: number, protein: number, fat: number, carbs: number } | null,
 *   packageGrams: number | null, confidence: 'high' | 'medium' | 'low', note: string,
 * }} LabelReading
 */

const DAILY_LIMIT = Math.max(1, Number(process.env.AI_DAILY_LIMIT) || 20)
const TTL_SEC = 2 * 24 * 60 * 60
/** Стиснене на телефоні фото — кілька сотень КБ; більше не приймаємо (ліміт тіла запиту Vercel ~4,5 МБ). */
const MAX_IMAGE_BYTES = 3 * 1024 * 1024
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** Дата сервера (UTC) — для денного ліміту: підставивши іншу дату, його не обійти. */
const serverDay = () => new Date().toISOString().slice(0, 10)

/** @param {RedisClient} r */
async function callsLeft(r) {
  const used = Number(parseStored(await r.get(KEYS.aiCount(serverDay())))) || 0
  return Math.max(0, DAILY_LIMIT - used)
}

/** @param {RedisClient} r @returns {Promise<number>} скільки лишилось після цього виклику */
async function takeCall(r) {
  const key = KEYS.aiCount(serverDay())
  const used = Number(parseStored(await r.get(key))) || 0
  if (used >= DAILY_LIMIT) throw new HttpError(429, 'ai_daily_limit')
  await r.set(key, used + 1, { ex: TTL_SEC })
  return DAILY_LIMIT - used - 1
}

const LABEL_SCHEMA = {
  type: 'object',
  properties: {
    found: { type: 'boolean', description: 'чи видно на фото харчову (енергетичну) цінність' },
    name: { type: 'string', description: 'назва продукту, як на упаковці; українською, якщо є; інакше порожньо' },
    brand: { type: 'string', description: 'торгова марка або порожньо' },
    kcal_100g: { type: 'number', description: 'ккал на 100 г (або 100 мл)' },
    protein_100g: { type: 'number', description: 'білки, г на 100 г' },
    fat_100g: { type: 'number', description: 'жири, г на 100 г' },
    carbs_100g: { type: 'number', description: 'вуглеводи, г на 100 г' },
    package_grams: { type: 'number', description: 'маса нетто упаковки в г (мл як г); 0, якщо не видно' },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'наскільки чітко прочитано цифри' },
    note: { type: 'string', description: 'коротко, що перераховано чи чого не видно; українською; або порожньо' },
  },
  required: ['found', 'name', 'brand', 'kcal_100g', 'protein_100g', 'fat_100g', 'carbs_100g', 'package_grams', 'confidence', 'note'],
}

const LABEL_SYSTEM = `Ти читаєш етикетки харчових продуктів для щоденника калорій.
На фото — таблиця харчової (енергетичної) цінності або текст на звороті упаковки, будь-якою мовою.
Поверни значення НА 100 г (для напоїв — на 100 мл):
- якщо вказано лише кДж — переведи в ккал (кДж / 4,184);
- якщо цифри лише на порцію — перерахуй на 100 г за масою порції; якщо маси порції не видно — found: false;
- якщо якогось показника немає (напр. жирів) — 0;
- маса нетто упаковки (напр. «Маса нетто 400 г», «0,5 л») — package_grams, інакше 0.
Не вигадуй: якщо харчової цінності на фото не видно чи не розібрати — found: false, решта 0 і порожні рядки.
confidence: high — цифри чіткі; medium — щось довелося перераховувати чи частина розмита; low — сумніваєшся.`

/** Число в межах або 0. @param {unknown} v @param {number} max */
const clampNum = (v, max) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max ? round1(v) : 0)

/** Відповідь моделі → охайне прочитання. @param {unknown} raw @returns {LabelReading} */
export function sanitizeLabel(raw) {
  const o = obj(raw)
  const kcal = clampNum(o.kcal_100g, LIMITS.per100.kcal)
  const found = o.found === true && kcal > 0
  const pack = clampNum(o.package_grams, LIMITS.grams.max)
  const confidence = o.confidence === 'high' || o.confidence === 'medium' ? o.confidence : 'low'
  return {
    found,
    name: str(o.name, LIMITS.nameLength),
    brand: str(o.brand, LIMITS.brandLength) || null,
    per100: found
      ? {
          kcal,
          protein: clampNum(o.protein_100g, LIMITS.per100.macro),
          fat: clampNum(o.fat_100g, LIMITS.per100.macro),
          carbs: clampNum(o.carbs_100g, LIMITS.per100.macro),
        }
      : null,
    packageGrams: pack >= LIMITS.grams.min ? pack : null,
    confidence,
    note: str(o.note, 300),
  }
}

/** Фото з тіла запиту: base64 без префікса data:, тип — лише картинки, розмір обмежений. @param {Record<string, unknown>} body */
function imageOf(body) {
  const data = typeof body.image === 'string' ? body.image.replace(/^data:[^,]*,/, '') : ''
  const mime = typeof body.mimeType === 'string' ? body.mimeType : 'image/jpeg'
  if (!IMAGE_TYPES.includes(mime) || !/^[A-Za-z0-9+/]+=*$/.test(data)) throw new HttpError(400, 'invalid_image')
  if ((data.length * 3) / 4 > MAX_IMAGE_BYTES) throw new HttpError(413, 'image_too_large')
  return { data, mime }
}

export default handler(['GET', 'POST'], async (req, res) => {
  const r = redis()
  const configured = geminiConfigured()

  if (req.method === 'GET') return send(res, 200, { configured, left: configured ? await callsLeft(r) : 0 })

  const body = readJson(req)
  if (body.action !== 'label') throw new HttpError(400, 'unknown_action')
  if (!configured) throw new HttpError(503, 'ai_not_configured')
  const image = imageOf(body)
  const left = await takeCall(r)

  const raw = await geminiJson({
    system: LABEL_SYSTEM,
    input: [
      { type: 'text', text: 'Прочитай харчову цінність з цієї етикетки.' },
      { type: 'image', data: image.data, mime_type: image.mime },
    ],
    schema: LABEL_SCHEMA,
    maxOutputTokens: 2048,
  })
  send(res, 200, { label: sanitizeLabel(raw), left })
})
