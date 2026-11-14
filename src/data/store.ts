import { create } from 'zustand'
import {
  DEFAULT_GOALS,
  type BodyField,
  type BodyRecord,
  type Entry,
  type Food,
  type FoodItem,
  type Goals,
  type MealType,
  type Profile,
} from '@shared/model.js'
import { sanitizeBodyRecord, sanitizeEntry, sanitizeFood, sanitizeProfile } from '@shared/validate.js'
import { useUiStore } from '@/store/ui'
import { ApiError, NetworkError, api } from './api'

/**
 * Дані з Redis на Vercel, які зараз показує UI.
 * Джерело правди — сервер; тут лише кеш у пам'яті сторінки.
 *
 * Зміни оптимістичні: інтерфейс оновлюється одразу, запит іде у фоні,
 * а при помилці зміна відкочується і показується повідомлення.
 */

export interface DayState {
  entries: Entry[]
  loaded: boolean
  error: boolean
}

interface DataState {
  days: Record<string, DayState>
  profile: Profile | null
  /** «Мої страви», нещодавно змінені першими. */
  foods: Food[]
  foodsLoaded: boolean
  /** Заміри тіла, за датою від старих */
  body: BodyRecord[]
  bodyLoaded: boolean
  /** Скільки запитів на збереження зараз у дорозі. */
  saving: number
}

export const useDataStore = create<DataState>()(() => ({
  days: {},
  profile: null,
  foods: [],
  foodsLoaded: false,
  body: [],
  bodyLoaded: false,
  saving: 0,
}))

const EMPTY_DAY: DayState = { entries: [], loaded: false, error: false }
const byCreated = (a: Entry, b: Entry) => a.createdAt - b.createdAt

/**
 * Лічильник локальних змін по днях. Якщо за час завантаження дня його
 * змінили локально, відповідь сервера вже застаріла — не застосовуємо її.
 */
const revisions = new Map<string, number>()
const rev = (date: string) => revisions.get(date) ?? 0

function patchDay(date: string, patch: Partial<DayState>) {
  useDataStore.setState((s) => ({
    days: { ...s.days, [date]: { ...(s.days[date] ?? EMPTY_DAY), ...patch } },
  }))
}

function mutateDay(date: string, fn: (entries: Entry[]) => Entry[]) {
  revisions.set(date, rev(date) + 1)
  const current = useDataStore.getState().days[date]?.entries ?? []
  patchDay(date, { entries: fn(current).sort(byCreated) })
}

function errorMessage(err: unknown): string {
  if (err instanceof NetworkError) return 'Немає з’єднання з сервером. Зміну не збережено.'
  if (err instanceof ApiError && err.status === 400) return 'Сервер відхилив дані. Перевірте значення.'
  return 'Не вдалося зберегти. Спробуйте ще раз.'
}

/** Обгортка для запиту зі збереженням: лічильник «зберігається…» і відкат при помилці. */
async function save<T>(request: () => Promise<T>, rollback: () => void): Promise<T> {
  useDataStore.setState((s) => ({ saving: s.saving + 1 }))
  try {
    return await request()
  } catch (err) {
    rollback()
    useUiStore.getState().showToast(errorMessage(err))
    throw err
  } finally {
    useDataStore.setState((s) => ({ saving: s.saving - 1 }))
  }
}

// ─── Завантаження ────────────────────────────────────────────────────────────

const inflight = new Map<string, Promise<void>>()

export function loadDay(date: string): Promise<void> {
  const running = inflight.get(date)
  if (running) return running

  const startRev = rev(date)
  const p = api
    .getDay(date)
    .then(({ entries }) => {
      if (rev(date) === startRev) patchDay(date, { entries, loaded: true, error: false })
    })
    .catch(() => patchDay(date, { error: true }))
    .finally(() => inflight.delete(date))
  inflight.set(date, p)
  return p
}

let profileRev = 0

export async function loadProfile(): Promise<void> {
  const startRev = profileRev
  try {
    const { profile } = await api.getProfile()
    if (profileRev === startRev) useDataStore.setState({ profile })
  } catch {
    // цілі за замовчуванням лишаються; повторимо при наступному оновленні
  }
}

// ─── Записи ──────────────────────────────────────────────────────────────────

/** Поля з форми; числа можуть бути рядками — нормалізує shared/validate.js. */
export type EntryDraft =
  | {
      mode: 'weight'
      date: string
      meal: MealType
      name: string
      grams: string | number
      per100: { kcal: string | number; protein: string | number; fat: string | number; carbs: string | number }
    }
  | {
      mode: 'quick'
      date: string
      meal: MealType
      name: string
      kcal: string | number
      protein: string | number
      fat: string | number
      carbs: string | number
    }

/** Будує запис із чернетки. Кидає ValidationError, якщо дані некоректні. */
export function buildEntry(draft: EntryDraft, id: string = crypto.randomUUID(), now = Date.now()): Entry {
  return sanitizeEntry({ ...draft, id, createdAt: now, updatedAt: now })
}

/** Застосовує відповідь сервера, якщо там виявилася новіша версія. */
function applyServerEntry(applied: boolean, entry: Entry) {
  if (!applied) mutateDay(entry.date, (es) => es.map((e) => (e.id === entry.id ? entry : e)))
}

export async function addEntry(draft: EntryDraft): Promise<void> {
  const entry = buildEntry(draft)
  mutateDay(entry.date, (es) => [...es, entry])
  const res = await save(
    () => api.putEntry(entry),
    () => mutateDay(entry.date, (es) => es.filter((e) => e.id !== entry.id)),
  )
  applyServerEntry(res.applied, res.entry)
}

export type EntryPatch = Partial<Pick<Entry, 'name' | 'grams' | 'kcal' | 'protein' | 'fat' | 'carbs'>>

/** Для режиму weight нутрієнти перераховуються з per100 у shared/validate.js. */
export async function updateEntry(prev: Entry, patch: EntryPatch): Promise<void> {
  const next = sanitizeEntry({
    ...prev,
    ...patch,
    // строго більше за попередній — інакше сервер вважатиме версію старою
    updatedAt: Math.max(Date.now(), prev.updatedAt + 1),
  })
  const swap = (from: Entry, to: Entry) =>
    mutateDay(from.date, (es) => es.map((e) => (e.id === from.id ? to : e)))

  swap(prev, next)
  const res = await save(
    () => api.putEntry(next),
    () => swap(next, prev),
  )
  applyServerEntry(res.applied, res.entry)
}

export async function deleteEntry(entry: Entry): Promise<void> {
  mutateDay(entry.date, (es) => es.filter((e) => e.id !== entry.id))
  await save(
    () => api.deleteEntry(entry.id, entry.date),
    () => mutateDay(entry.date, (es) => [...es, entry]),
  )
}

// ─── Профіль: денні цілі й цільова вага ──────────────────────────────────────

export interface ProfileInput {
  goals: Record<keyof Goals, string | number>
  /** Порожньо — ціль не задана */
  targetWeight: string | number
}

export async function saveProfile(input: ProfileInput): Promise<void> {
  const prev = useDataStore.getState().profile
  const profile: Profile = sanitizeProfile({
    goals: input.goals,
    targetWeight: input.targetWeight,
    updatedAt: Math.max(Date.now(), (prev?.updatedAt ?? 0) + 1),
  })
  profileRev++
  useDataStore.setState({ profile })
  const res = await save(
    () => api.putProfile(profile),
    () => {
      profileRev++
      useDataStore.setState({ profile: prev })
    },
  )
  if (!res.applied) useDataStore.setState({ profile: res.profile })
}

// ─── Заміри тіла ─────────────────────────────────────────────────────────────

let bodyRev = 0
const byDate = (a: BodyRecord, b: BodyRecord) => a.date.localeCompare(b.date)

export async function loadBody(): Promise<void> {
  const startRev = bodyRev
  try {
    const { records } = await api.getBody()
    if (bodyRev === startRev) useDataStore.setState({ body: records, bodyLoaded: true })
  } catch {
    // лишаємо те, що є
  }
}

function setBodyLocal(fn: (records: BodyRecord[]) => BodyRecord[]) {
  bodyRev++
  useDataStore.setState((s) => ({ body: fn(s.body).sort(byDate) }))
}

/** Поля форми; порожній рядок — не міряли. */
export type BodyInput = Record<BodyField, string | number>

/** Записує заміри за день (повністю замінює запис цього дня). Кидає ValidationError. */
export async function saveBodyRecord(date: string, input: BodyInput): Promise<void> {
  const prev = useDataStore.getState().body.find((r) => r.date === date)
  const record = sanitizeBodyRecord({
    date,
    ...input,
    updatedAt: Math.max(Date.now(), (prev?.updatedAt ?? 0) + 1),
  })
  const swap = (to: BodyRecord | undefined) => setBodyLocal((rs) => [...rs.filter((r) => r.date !== date), ...(to ? [to] : [])])

  swap(record)
  const res = await save(
    () => api.putBody(record),
    () => swap(prev),
  )
  if (!res.applied) swap(res.record)
}

export async function deleteBodyRecord(date: string): Promise<void> {
  const prev = useDataStore.getState().body.find((r) => r.date === date)
  if (!prev) return
  setBodyLocal((rs) => rs.filter((r) => r.date !== date))
  await save(
    () => api.deleteBody(date),
    () => setBodyLocal((rs) => [...rs, prev]),
  )
}

// ─── Мої страви ──────────────────────────────────────────────────────────────

let foodsRev = 0

export async function loadFoods(): Promise<void> {
  const startRev = foodsRev
  try {
    const { foods } = await api.getFoods()
    if (foodsRev === startRev) useDataStore.setState({ foods, foodsLoaded: true })
  } catch {
    // лишаємо те, що є; повторимо при наступному оновленні
  }
}

const byUpdated = (a: Food, b: Food) => b.updatedAt - a.updatedAt

function putFoodLocal(food: Food) {
  foodsRev++
  useDataStore.setState((s) => ({
    foods: [food, ...s.foods.filter((f) => f.id !== food.id)].sort(byUpdated),
  }))
}

/**
 * Зберігає страву в «Мої страви» (з результату пошуку OFF або з ручного вводу).
 * Для OFF id стабільний (`off-<штрихкод>`), тож повторне збереження не дублює страву.
 */
export async function saveFood(item: FoodItem): Promise<Food> {
  const now = Date.now()
  const existing = useDataStore.getState().foods.find((f) => f.id === item.id)
  const food = sanitizeFood({
    ...item,
    createdAt: existing?.createdAt ?? now,
    updatedAt: Math.max(now, (existing?.updatedAt ?? 0) + 1),
  })

  putFoodLocal(food)
  const res = await save(
    () => api.putFood(food),
    () => {
      foodsRev++
      useDataStore.setState((s) => ({
        foods: existing
          ? s.foods.map((f) => (f.id === food.id ? existing : f))
          : s.foods.filter((f) => f.id !== food.id),
      }))
    },
  )
  if (!res.applied) putFoodLocal(res.food)
  return food
}

/** Нова власна страва з ручного вводу. */
export function newOwnFood(fields: Pick<FoodItem, 'name' | 'per100' | 'servingGrams'>): FoodItem {
  return {
    id: crypto.randomUUID(),
    brand: null,
    source: 'own',
    offCode: null,
    ...fields,
  }
}

// ─── Хуки ────────────────────────────────────────────────────────────────────

export const useDay = (date: string): DayState =>
  useDataStore((s) => s.days[date]) ?? EMPTY_DAY

export const useEntry = (date: string, id: string): Entry | undefined =>
  useDataStore((s) => s.days[date]?.entries.find((e) => e.id === id))

export const useGoals = (): Goals => useDataStore((s) => s.profile?.goals) ?? DEFAULT_GOALS

export const useFoods = (): Food[] => useDataStore((s) => s.foods)

export const useBody = (): BodyRecord[] => useDataStore((s) => s.body)

export const useTargetWeight = (): number | null => useDataStore((s) => s.profile?.targetWeight ?? null)

// ─── Автооновлення ───────────────────────────────────────────────────────────

/**
 * Ліміти безкоштовних тарифів (Vercel Hobby, Upstash Free): кожен запит — це
 * виклик функції + команда Redis. Тому без фонового опитування: застосунок
 * особистий, усі зміни робимо самі й одразу бачимо. Оновлюємо лише при
 * поверненні у вкладку (не частіше ніж раз на хвилину) і при зміні дня
 * (день, завантажений менше ніж 2 хв тому, повторно не тягнемо).
 */
const REFRESH_MIN_MS = 60_000
const DAY_FRESH_MS = 120_000

const dayLoadedAt = new Map<string, number>()

function loadDayIfStale(date: string) {
  const at = dayLoadedAt.get(date) ?? 0
  if (Date.now() - at < DAY_FRESH_MS) return
  dayLoadedAt.set(date, Date.now())
  void loadDay(date).then(() => {
    if (useDataStore.getState().days[date]?.error) dayLoadedAt.delete(date) // помилку повторимо
  })
}

/** Підтягує поточний день, цілі й страви з сервера. Повертає функцію зупинки. */
export function startAutoRefresh(): () => void {
  let lastRefresh = 0
  const refresh = () => {
    lastRefresh = Date.now()
    dayLoadedAt.clear()
    loadDayIfStale(useUiStore.getState().selectedDate)
    void loadProfile()
    void loadFoods()
    void loadBody()
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible' && Date.now() - lastRefresh > REFRESH_MIN_MS) refresh()
  }

  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', refresh)
  const unsubscribe = useUiStore.subscribe((s, prev) => {
    if (s.selectedDate !== prev.selectedDate) loadDayIfStale(s.selectedDate)
  })
  refresh()

  return () => {
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', refresh)
    unsubscribe()
  }
}
