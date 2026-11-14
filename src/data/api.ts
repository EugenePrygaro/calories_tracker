import type { BodyRecord, Entry, Food, FoodItem, Profile } from '@shared/model.js'

/** Сервер відповів помилкою (4xx/5xx). */
export class ApiError extends Error {
  readonly status: number
  constructor(status: number, code: string) {
    super(code)
    this.name = 'ApiError'
    this.status = status
  }

  /** Повтор не допоможе: дані відхилено валідацією. */
  get isPermanent(): boolean {
    return this.status >= 400 && this.status < 500 && this.status !== 408 && this.status !== 429
  }
}

/** До сервера не достукались (офлайн, таймаут). */
export class NetworkError extends Error {
  constructor() {
    super('network_error')
    this.name = 'NetworkError'
  }
}

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const timeout = AbortSignal.timeout(15_000)
  const init: RequestInit = {
    method,
    cache: 'no-store',
    signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
  }
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' }
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
  return data as T
}

const q = encodeURIComponent

export const api = {
  getDay: (date: string) => request<{ entries: Entry[] }>('GET', `/api/day?date=${q(date)}`),

  putEntry: (entry: Entry) =>
    request<{ applied: boolean; entry: Entry }>('PUT', `/api/entries?id=${q(entry.id)}`, { entry }),

  deleteEntry: (id: string, date: string) =>
    request<{ ok: true }>('DELETE', `/api/entries?id=${q(id)}&date=${q(date)}`),

  getProfile: () => request<{ profile: Profile }>('GET', '/api/profile'),

  putProfile: (profile: Profile) =>
    request<{ applied: boolean; profile: Profile }>('PUT', '/api/profile', { profile }),

  getFoods: () => request<{ foods: Food[] }>('GET', '/api/foods'),

  putFood: (food: Food) =>
    request<{ applied: boolean; food: Food }>('PUT', `/api/foods?id=${q(food.id)}`, { food }),

  getBody: () => request<{ records: BodyRecord[] }>('GET', '/api/body'),

  putBody: (record: BodyRecord) =>
    request<{ applied: boolean; record: BodyRecord }>('PUT', `/api/body?date=${q(record.date)}`, { record }),

  deleteBody: (date: string) => request<{ ok: true }>('DELETE', `/api/body?date=${q(date)}`),

  /** Пошук у Open Food Facts через наш сервер (фільтр energy-kcal_100g + кеш). */
  search: (query: string, signal?: AbortSignal) =>
    request<{ results: FoodItem[] }>('GET', `/api/search?q=${q(query)}`, undefined, signal),
}
