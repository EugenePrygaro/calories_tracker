/**
 * Gemini (Google AI Studio) через Interactions API — відповідь строго за JSON-схемою.
 * Ключ — лише на сервері: змінна середовища GEMINI_API_KEY; модель — GEMINI_MODEL (за замовчуванням нижче).
 * store: false — Google не зберігає запит і відповідь для подальшого перегляду.
 */
import { HttpError } from './http.js'

const API_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions'
const API_REVISION = '2026-05-20'
/** Стабільна Flash-модель (aistudio.google.com/docs/models); замінити — змінною GEMINI_MODEL. */
export const DEFAULT_MODEL = 'gemini-3.8-flash'
const TIMEOUT_MS = 25_000

export const geminiConfigured = () => Boolean(process.env.GEMINI_API_KEY)
export const geminiModel = () => process.env.GEMINI_MODEL || DEFAULT_MODEL

/**
 * @typedef {{ type: 'text', text: string } | { type: 'image', data: string, mime_type: string }} GeminiPart
 */

/**
 * Текст відповіді моделі: кроки `model_output` → частини `text` (запасні варіанти — на випадок зміни формату).
 * @param {unknown} data
 * @returns {string}
 */
export function interactionText(data) {
  const d = /** @type {Record<string, unknown>} */ (data && typeof data === 'object' ? data : {})
  const steps = Array.isArray(d.steps) ? d.steps : []
  const fromSteps = steps
    .filter((s) => s && s.type === 'model_output' && Array.isArray(s.content))
    .flatMap((s) => s.content)
    .filter((c) => c && c.type === 'text' && typeof c.text === 'string')
    .map((c) => c.text)
    .join('')
  if (fromSteps) return fromSteps
  if (typeof d.output_text === 'string') return d.output_text
  const outputs = Array.isArray(d.outputs) ? d.outputs : []
  return outputs.filter((o) => o && typeof o.text === 'string').map((o) => o.text).join('')
}

/**
 * Запит до Gemini з JSON-схемою відповіді → розібраний JSON.
 * Помилки: не налаштовано — 503 ai_not_configured; ліміти Google — 429 ai_rate_limited;
 * інше — 502 ai_unavailable / ai_bad_response.
 * @param {{
 *   system: string, input: GeminiPart[], schema: Record<string, unknown>,
 *   maxOutputTokens?: number, fetchImpl?: typeof fetch,
 * }} opts
 * @returns {Promise<unknown>}
 */
export async function geminiJson({ system, input, schema, maxOutputTokens = 4096, fetchImpl = fetch }) {
  const key = process.env.GEMINI_API_KEY
  if (!key) throw new HttpError(503, 'ai_not_configured')
  /** @type {Response} */
  let res
  try {
    res = await fetchImpl(API_URL, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json', 'Api-Revision': API_REVISION },
      body: JSON.stringify({
        model: geminiModel(),
        input,
        system_instruction: system,
        generation_config: { max_output_tokens: maxOutputTokens },
        response_format: { type: 'text', mime_type: 'application/json', schema },
        store: false,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new HttpError(502, 'ai_unavailable')
  }
  if (res.status === 429) throw new HttpError(429, 'ai_rate_limited')
  if (!res.ok) {
    // у лог — лише статус і початок відповіді (без ключа й даних запиту)
    console.error('gemini', res.status, (await res.text().catch(() => '')).slice(0, 300))
    throw new HttpError(502, 'ai_unavailable')
  }
  const data = await res.json().catch(() => null)
  try {
    return JSON.parse(interactionText(data))
  } catch {
    throw new HttpError(502, 'ai_bad_response')
  }
}
