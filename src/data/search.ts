import { useEffect, useState } from 'react'
import { LIMITS, normalizeQuery, type Food, type FoodItem } from '@shared/model.js'
import { api } from './api'

/**
 * Пошук по «Моїх стравах» — миттєво, на клієнті.
 * Кожне слово запиту має входити в назву або бренд; збіг з початку назви — вище.
 */
export function filterFoods(foods: readonly Food[], query: string): Food[] {
  const q = normalizeQuery(query)
  if (!q) return [...foods]
  const words = q.split(' ')
  const scored = foods.flatMap((f) => {
    const name = f.name.toLowerCase()
    const hay = `${name} ${f.brand?.toLowerCase() ?? ''}`
    if (!words.every((w) => hay.includes(w))) return []
    return [{ f, score: name.startsWith(q) ? 0 : name.split(' ').some((w) => w.startsWith(words[0] ?? '')) ? 1 : 2 }]
  })
  return scored.sort((a, b) => a.score - b.score || b.f.updatedAt - a.f.updatedAt).map((s) => s.f)
}

export type PublicSearch =
  | { status: 'idle'; results: [] }
  | { status: 'loading'; results: [] }
  | { status: 'done'; results: FoodItem[] }
  | { status: 'error'; results: []; retry: () => void }

const DEBOUNCE_MS = 350
/** Кеш на час сесії: повернення до того ж запиту — без мережі. */
const cache = new Map<string, FoodItem[]>()

/** Публічний пошук (Сільпо, Zakaz.ua, Open Food Facts) з дебаунсом і скасуванням застарілих запитів. */
export function usePublicSearch(query: string): PublicSearch {
  const q = normalizeQuery(query)
  const valid = q.length >= LIMITS.searchQuery.min
  const [failed, setFailed] = useState<{ q: string; attempt: number } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [, setDone] = useState(0) // перемальовка після відповіді (результат лежить у cache)

  useEffect(() => {
    if (!valid || cache.has(q)) return
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      api
        .search(q, ctrl.signal)
        .then(({ results }) => {
          cache.set(q, results)
          setDone((n) => n + 1)
        })
        .catch(() => {
          if (!ctrl.signal.aborted) setFailed({ q, attempt })
        })
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [q, valid, attempt])

  if (!valid) return { status: 'idle', results: [] }
  const cached = cache.get(q)
  if (cached) return { status: 'done', results: cached }
  if (failed?.q === q && failed.attempt === attempt) {
    return { status: 'error', results: [], retry: () => setAttempt((n) => n + 1) }
  }
  return { status: 'loading', results: [] }
}
