/**
 * Дрібні помічники для Vercel Functions (Node.js runtime).
 * Лежать поза api/, щоб Vercel не робив з них окремі функції.
 */
import { ValidationError } from '../shared/validate.js'

/**
 * Те, що Vercel додає до стандартного запиту Node.
 * @typedef {import('node:http').IncomingMessage & {
 *   query: Record<string, string | string[] | undefined>,
 *   body?: unknown,
 * }} ApiRequest
 */

/**
 * @typedef {import('node:http').ServerResponse & {
 *   status(code: number): ApiResponse,
 *   json(body: unknown): void,
 * }} ApiResponse
 */

export class HttpError extends Error {
  /** @param {number} status @param {string} code */
  constructor(status, code) {
    super(code)
    this.status = status
    this.code = code
  }
}

/** @param {ApiResponse} res @param {number} status @param {unknown} body @param {string} [cacheControl] */
export function send(res, status, body, cacheControl = 'no-store') {
  res.status(status)
  res.setHeader('Cache-Control', cacheControl)
  res.json(body)
}

/**
 * Кеш на CDN Vercel: повторний такий самий запит віддає CDN без виклику функції
 * і без команд Redis (економія лімітів). Лише для неперсональних відповідей.
 * @param {ApiResponse} res @param {unknown} body @param {number} seconds
 */
export function sendCdnCached(res, body, seconds) {
  res.setHeader('CDN-Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=${seconds}`)
  send(res, 200, body, 'public, max-age=3600')
}

/** Тіло запиту як об'єкт (Vercel розбирає JSON сам, але підстрахуємося). @param {ApiRequest} req */
export function readJson(req) {
  const body = req.body
  if (body && typeof body === 'object' && !Buffer.isBuffer(body)) {
    return /** @type {Record<string, unknown>} */ (body)
  }
  const raw = Buffer.isBuffer(body) ? body.toString('utf8') : body
  if (typeof raw === 'string' && raw) {
    try {
      const parsed = JSON.parse(raw)
      if (parsed && typeof parsed === 'object') return /** @type {Record<string, unknown>} */ (parsed)
    } catch {
      throw new HttpError(400, 'invalid_json')
    }
  }
  return {}
}

/** Параметр з рядка запиту (?id=…). @param {ApiRequest} req @param {string} name */
export function query(req, name) {
  const v = req.query?.[name]
  return Array.isArray(v) ? v[0] : v
}

/**
 * Обгортка обробника: перевіряє метод і перетворює помилки на JSON.
 * @param {string[]} methods
 * @param {(req: ApiRequest, res: ApiResponse) => Promise<void>} fn
 * @returns {(req: ApiRequest, res: ApiResponse) => Promise<void>}
 */
export function handler(methods, fn) {
  return async (req, res) => {
    if (!req.method || !methods.includes(req.method)) {
      res.setHeader('Allow', methods.join(', '))
      return send(res, 405, { error: 'method_not_allowed' })
    }
    try {
      await fn(req, res)
    } catch (err) {
      if (err instanceof ValidationError) {
        return send(res, 400, { error: err.message, field: err.field })
      }
      if (err instanceof HttpError) return send(res, err.status, { error: err.code })
      console.error(err)
      return send(res, 500, { error: 'server_error' })
    }
  }
}
