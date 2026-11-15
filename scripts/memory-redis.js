/**
 * Мінімальна імітація @upstash/redis — лише команди з server/store.js.
 * Якщо передати шлях до файлу, дані переживають перезапуск локального сервера.
 * Тільки для розробки й тестів.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/** @param {unknown} v */
const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)))

export class MemoryRedis {
  /** @param {string} [file] */
  constructor(file) {
    this.file = file
    /** @type {Map<string, unknown>} */
    this.data = new Map()
    /** Ключі з TTL (кеш) — лише в пам'яті, у файл не пишуться. @type {Map<string, { value: unknown, expiresAt: number }>} */
    this.volatile = new Map()
    if (file && existsSync(file)) {
      this.data = new Map(Object.entries(JSON.parse(readFileSync(file, 'utf8'))))
    }
  }

  persist() {
    if (!this.file) return
    mkdirSync(path.dirname(this.file), { recursive: true })
    writeFileSync(this.file, JSON.stringify(Object.fromEntries(this.data), null, 2))
  }

  /** @param {string} k */
  hash(k) {
    const h = this.data.get(k)
    if (h && typeof h === 'object') return /** @type {Record<string, unknown>} */ (h)
    /** @type {Record<string, unknown>} */
    const created = {}
    this.data.set(k, created)
    return created
  }

  /** @param {string} k */
  async get(k) {
    const v = this.volatile.get(k)
    if (v) {
      if (v.expiresAt > Date.now()) return clone(v.value)
      this.volatile.delete(k)
    }
    return clone(this.data.get(k))
  }

  /** @param {string} k @param {unknown} v @param {{ ex: number }} [opts] */
  async set(k, v, opts) {
    if (opts?.ex) {
      this.volatile.set(k, { value: clone(v), expiresAt: Date.now() + opts.ex * 1000 })
      return 'OK'
    }
    this.volatile.delete(k)
    this.data.set(k, clone(v))
    this.persist()
    return 'OK'
  }

  /** @param {string} k @param {string} f */
  async hget(k, f) {
    const h = /** @type {Record<string, unknown> | undefined} */ (this.data.get(k))
    return clone(h?.[f])
  }

  /** @param {string} k */
  async hgetall(k) {
    const h = /** @type {Record<string, unknown> | undefined} */ (this.data.get(k))
    return h && Object.keys(h).length ? /** @type {Record<string, unknown>} */ (clone(h)) : null
  }

  /** @param {string} k @param {Record<string, unknown>} values */
  async hset(k, values) {
    Object.assign(this.hash(k), clone(values))
    this.persist()
    return Object.keys(values).length
  }

  /** Лише шаблони з * (як у проєкті: ct:day:*). @param {string} pattern */
  async keys(pattern) {
    const parts = pattern.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, (ch) => '\\' + ch))
    const re = new RegExp('^' + parts.join('.*') + '$')
    return [...this.data.keys()].filter((k) => re.test(k))
  }

  /** @param {string} k @param {...string} fields */
  async hdel(k, ...fields) {
    const h = this.hash(k)
    let removed = 0
    for (const f of fields) {
      if (f in h) {
        delete h[f]
        removed++
      }
    }
    this.persist()
    return removed
  }
}
