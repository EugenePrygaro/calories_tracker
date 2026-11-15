import type { GameEvent, GameState } from '@shared/game.js'
import type { BodyRecord, Entry, Food, FoodItem, Profile } from '@shared/model.js'
import type { ShopItemId, ThemeId, UsableItemId } from '@shared/shop.js'
import type { DaySummary } from '@shared/stats.js'

/** Скільки разів і коли востаннє додавали страву (для «Нещодавні» / «Часті»). */
export interface FoodUsage {
  n: number
  last: number
}

export interface GameResult {
  game: GameState
  events: GameEvent[]
}

export type DevOp =
  | 'addCoins'
  | 'addShields'
  | 'setStreak'
  | 'setLastActive'
  | 'clearToday'
  | 'unlockAchievement'
  | 'relockAchievement'
  | 'reset'

export type GameAction =
  | { action: 'claim'; id: string }
  | { action: 'seen'; id: string }
  | { action: 'dismissNotice' }
  | { action: 'buy'; item: ShopItemId }
  | { action: 'use'; item: UsableItemId }
  | { action: 'theme'; theme: ThemeId | 'default' | 'random' }
  | { action: 'dev'; op: DevOp; amount?: number; id?: string }

/** Сервер відповів помилкою (4xx/5xx). */
export class ApiError extends Error {
  readonly status: number
  constructor(status: number, code: string) {
    super(code)
    this.name = 'ApiError'
    this.status = status
  }
}

/** До сервера не достукались (офлайн, таймаут). */
export class NetworkError extends Error {
  constructor() {
    super('network_error')
    this.name = 'NetworkError'
  }
}

/** Таймаут + скасування; AbortSignal.any є лише в нових браузерах (iOS 17.4+) — інакше лише сигнал скасування. */
function requestSignal(signal?: AbortSignal): AbortSignal | undefined {
  const timeout = typeof AbortSignal.timeout === 'function' ? AbortSignal.timeout(15_000) : undefined
  if (!signal) return timeout
  if (!timeout) return signal
  return typeof AbortSignal.any === 'function' ? AbortSignal.any([timeout, signal]) : signal
}

interface RequestOptions {
  signal?: AbortSignal
  /** 'default' — дозволити кеш браузера (пошук кешується сервером на годину) */
  cache?: RequestCache
}

async function request<T>(method: string, path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
  // Часовий пояс — серверу: «сьогодні» і ачівки за місцевим часом («Рання пташка», «Нічний дожор»).
  const headers: Record<string, string> = { 'X-TZ-Offset': String(new Date().getTimezoneOffset()) }
  const init: RequestInit = { method, cache: opts.cache ?? 'no-store', headers }
  const signal = requestSignal(opts.signal)
  if (signal) init.signal = signal
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(body)
  }

  let res: Response
  try {
    res = await fetch(path, init)
  } catch {
    throw new NetworkError()
  }

  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const code =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : `http_${res.status}`
    throw new ApiError(res.status, code)
  }
  if (data === null) throw new ApiError(res.status, 'bad_json')
  return data as T
}

const q = encodeURIComponent

export const api = {
  getDay: (date: string) => request<{ entries: Entry[] }>('GET', `/api/day?date=${q(date)}`),

  /**
   * У відповіді — і стан гри з подіями (нагороди нараховує сервер при збереженні).
   * source='copy' — запис створено кнопкою «Скопіювати з учора».
   */
  putEntry: (entry: Entry, source?: 'copy', foodId?: string) =>
    request<{ applied: boolean; entry: Entry; game?: GameResult }>(
      'PUT',
      `/api/entries?id=${q(entry.id)}${source ? `&source=${source}` : ''}${foodId ? `&food=${q(foodId)}` : ''}`,
      { entry },
    ),

  deleteEntry: (id: string, date: string) =>
    request<{ ok: true }>('DELETE', `/api/entries?id=${q(id)}&date=${q(date)}`),

  getProfile: () => request<{ profile: Profile }>('GET', '/api/profile'),

  putProfile: (profile: Profile) =>
    request<{ applied: boolean; profile: Profile }>('PUT', '/api/profile', { profile }),

  getFoods: () => request<{ foods: Food[]; usage?: Record<string, FoodUsage> }>('GET', '/api/foods'),

  putFood: (food: Food) =>
    request<{ applied: boolean; food: Food }>('PUT', `/api/foods?id=${q(food.id)}`, { food }),

  getBody: () => request<{ records: BodyRecord[] }>('GET', '/api/body'),

  putBody: (record: BodyRecord) =>
    request<{ applied: boolean; record: BodyRecord }>('PUT', `/api/body?date=${q(record.date)}`, { record }),

  deleteBody: (date: string) => request<{ ok: true }>('DELETE', `/api/body?date=${q(date)}`),

  getGame: () => request<{ game: GameState }>('GET', '/api/game'),

  /** Підсумки всіх днів із записами — для статистики й теплової карти. */
  getStats: () => request<{ days: DaySummary[] }>('GET', '/api/stats'),

  gameAction: (body: GameAction) => request<GameResult>('POST', '/api/game', body),

  /** Пошук у Open Food Facts через наш сервер (фільтр energy-kcal_100g + кеш). */
  search: (query: string, signal?: AbortSignal) =>
    request<{ results: FoodItem[] }>('GET', `/api/search?q=${q(query)}`, undefined, {
      ...(signal ? { signal } : {}),
      cache: 'default',
    }),
}
