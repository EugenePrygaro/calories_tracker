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
import type { GameState } from '@shared/game.js'
import { toDateKey } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import { useGameUi } from '@/store/gameUi'
import { useUiStore } from '@/store/ui'
import { ApiError, NetworkError, api, type GameAction, type GameResult } from './api'

/**
 * Дані з Redis на Vercel, які зараз показує UI.
 * Джерело правди — сервер; тут лише кеш у пам'яті сторінки.
 *
 * Зміни оптимістичні: інтерфейс оновлюється одразу, запит іде у фоні,
 * а при помилці зміна відкочується і показується повідомлення.
 *
 * Узгодженість (застосунок особистий, один користувач):
 *   - усі запити, що змінюють дані, ідуть по одному (serial) — сервер оновлює стан гри
 *     «прочитав → змінив → записав», і паралельні запити губили б монети;
 *   - завантаження чекають цієї черги й застосовують відповідь, лише якщо поки вона йшла
 *     не з'явилося нових змін (guardedLoad) — так свіжий оптимістичний запис не зникає.
 */

interface DayState {
  entries: Entry[]
  loaded: boolean
  error: boolean
  /** Коли завантажено з сервера (для «свіжості» до наступного оновлення) */
  loadedAt: number
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
  /** Гейміфікація: монети, стрік, щити, ачівки (рахує сервер) */
  game: GameState | null
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
  game: null,
}))

const EMPTY_DAY: DayState = { entries: [], loaded: false, error: false, loadedAt: 0 }
const byCreated = (a: Entry, b: Entry) => a.createdAt - b.createdAt

// ─── Черга змін і безпечні завантаження ──────────────────────────────────────

let chain: Promise<unknown> = Promise.resolve()
/** Лічильник поставлених у чергу змін — щоб завантаження знало, що дані вже застаріли. */
let writeSeq = 0

/** Запит, що змінює дані, — у спільну чергу (по одному). */
function serial<T>(request: () => Promise<T>): Promise<T> {
  writeSeq++
  const p = chain.then(request, request)
  chain = p.catch(() => {})
  return p
}

/**
 * Завантаження, яке не перезаписує свіжих локальних змін: чекає, поки черга змін спорожніє,
 * і застосовує відповідь, лише якщо за час запиту не з'явилося нових змін (інакше — ще раз).
 */
async function guardedLoad<T>(fetch: () => Promise<T>, apply: (data: T) => void): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await chain
    const seq = writeSeq
    const data = await fetch()
    if (seq === writeSeq) {
      apply(data)
      return
    }
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof NetworkError) return 'Немає з’єднання з сервером. Зміну не збережено.'
  if (err instanceof ApiError && err.status === 400) return 'Сервер відхилив дані. Перевірте значення.'
  return 'Не вдалося зберегти. Спробуйте ще раз.'
}

/** Збереження: у чергу, лічильник «зберігається…», відкат і тост при помилці. */
async function save<T>(request: () => Promise<T>, rollback: () => void): Promise<T> {
  useDataStore.setState((s) => ({ saving: s.saving + 1 }))
  try {
    return await serial(request)
  } catch (err) {
    rollback()
    useUiStore.getState().showToast(errorMessage(err))
    throw err
  } finally {
    useDataStore.setState((s) => ({ saving: s.saving - 1 }))
  }
}

// ─── Дні ─────────────────────────────────────────────────────────────────────

function patchDay(date: string, patch: Partial<DayState>) {
  useDataStore.setState((s) => ({
    days: { ...s.days, [date]: { ...(s.days[date] ?? EMPTY_DAY), ...patch } },
  }))
}

function mutateDay(date: string, fn: (entries: Entry[]) => Entry[]) {
  const current = useDataStore.getState().days[date]?.entries ?? []
  patchDay(date, { entries: fn(current).sort(byCreated) })
}

/** Межа «свіжості»: дні, завантажені раніше, тягнемо знову (оновлюється при поверненні в застосунок). */
let staleBefore = 0
const inflight = new Map<string, Promise<void>>()

/** Завантажує день, якщо він ще не завантажений або застарів. Помилку показує банер дня. */
export function loadDay(date: string): Promise<void> {
  const day = useDataStore.getState().days[date]
  if (day?.loaded && !day.error && day.loadedAt > staleBefore) return Promise.resolve()
  const running = inflight.get(date)
  if (running) return running

  const p = guardedLoad(
    () => api.getDay(date),
    ({ entries }) => patchDay(date, { entries, loaded: true, error: false, loadedAt: Date.now() }),
  )
    .catch(() => patchDay(date, { error: true }))
    .finally(() => inflight.delete(date))
  inflight.set(date, p)
  return p
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

/** Відповідь сервера на збереження запису: новіша серверна версія + стан гри. */
function applyEntryResponse(res: { applied: boolean; entry: Entry; game?: GameResult }) {
  if (!res.applied) mutateDay(res.entry.date, (es) => es.map((e) => (e.id === res.entry.id ? res.entry : e)))
  if (res.game) applyGameResult(res.game)
}

export async function addEntry(draft: EntryDraft): Promise<void> {
  const entry = buildEntry(draft)
  mutateDay(entry.date, (es) => [...es, entry])
  const res = await save(
    () => api.putEntry(entry),
    () => mutateDay(entry.date, (es) => es.filter((e) => e.id !== entry.id)),
  )
  applyEntryResponse(res)
}

/**
 * «Скопіювати з учора»: копії записів у вибраний день і прийом їжі.
 * Усі копії з'являються одразу; на сервер ідуть по одному. Одне натискання = одна дія для
 * ачівки «День бабака» (позначаємо лише першу копію). onCopied — після кожної збереженої.
 */
export async function copyEntries(
  sources: readonly Entry[],
  date: string,
  meal: MealType,
  onCopied?: (sourceId: string) => void,
): Promise<void> {
  const now = Date.now()
  const copies = sources.map((src, i) => ({
    src,
    entry: sanitizeEntry({ ...src, id: crypto.randomUUID(), date, meal, createdAt: now + i, updatedAt: now + i }),
  }))
  mutateDay(date, (es) => [...es, ...copies.map((c) => c.entry)])

  for (const [i, { src, entry }] of copies.entries()) {
    try {
      const res = await save(() => api.putEntry(entry, i === 0 ? 'copy' : undefined), () => {})
      applyEntryResponse(res)
      onCopied?.(src.id)
    } catch (err) {
      // ця й решта ще не надісланих копій — прибираємо
      const unsent = new Set(copies.slice(i).map((c) => c.entry.id))
      mutateDay(date, (es) => es.filter((e) => !unsent.has(e.id)))
      throw err
    }
  }
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
  mutateDay(prev.date, (es) => es.map((e) => (e.id === prev.id ? next : e)))
  const res = await save(
    () => api.putEntry(next),
    // відкочуємо, лише якщо після нас запис ніхто не змінив
    () => mutateDay(prev.date, (es) => es.map((e) => (e === next ? prev : e))),
  )
  applyEntryResponse(res)
}

export async function deleteEntry(entry: Entry): Promise<void> {
  mutateDay(entry.date, (es) => es.filter((e) => e.id !== entry.id))
  await save(
    () => api.deleteEntry(entry.id, entry.date),
    () => mutateDay(entry.date, (es) => (es.some((e) => e.id === entry.id) ? es : [...es, entry])),
  )
}

/** Видалення з можливістю скасувати: тост «Видалено · Повернути». */
export function removeEntry(entry: Entry): void {
  haptic(12)
  void deleteEntry(entry).catch(() => {}) // помилку покаже тост із save()
  useUiStore.getState().showToast(`Видалено «${entry.name}»`, {
    tone: 'info',
    action: { label: 'Повернути', run: () => void restoreEntry(entry).catch(() => {}) },
  })
}

/** Повертає щойно видалений запис (той самий id, новіша версія). */
async function restoreEntry(entry: Entry): Promise<void> {
  const back = { ...entry, updatedAt: Math.max(Date.now(), entry.updatedAt + 1) }
  mutateDay(entry.date, (es) => (es.some((e) => e.id === entry.id) ? es : [...es, back]))
  const res = await save(
    () => api.putEntry(back),
    () => mutateDay(entry.date, (es) => es.filter((e) => e !== back)),
  )
  applyEntryResponse(res)
}

// ─── Профіль: денні цілі й цільова вага ──────────────────────────────────────

interface ProfileInput {
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
  useDataStore.setState({ profile })
  const res = await save(
    () => api.putProfile(profile),
    () => {
      if (useDataStore.getState().profile === profile) useDataStore.setState({ profile: prev })
    },
  )
  if (!res.applied) useDataStore.setState({ profile: res.profile })
}

// ─── Заміри тіла ─────────────────────────────────────────────────────────────

const byDate = (a: BodyRecord, b: BodyRecord) => a.date.localeCompare(b.date)

function setBodyLocal(fn: (records: BodyRecord[]) => BodyRecord[]) {
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
  const replace = (to: BodyRecord | undefined) =>
    setBodyLocal((rs) => [...rs.filter((r) => r.date !== date), ...(to ? [to] : [])])

  replace(record)
  const res = await save(
    () => api.putBody(record),
    () => {
      if (useDataStore.getState().body.some((r) => r === record)) replace(prev)
    },
  )
  if (!res.applied) replace(res.record)
}

export async function deleteBodyRecord(date: string): Promise<void> {
  const prev = useDataStore.getState().body.find((r) => r.date === date)
  if (!prev) return
  setBodyLocal((rs) => rs.filter((r) => r.date !== date))
  await save(
    () => api.deleteBody(date),
    () => setBodyLocal((rs) => (rs.some((r) => r.date === date) ? rs : [...rs, prev])),
  )
}

// ─── Гейміфікація ────────────────────────────────────────────────────────────

/** Новий стан гри + події для анімацій (нагороди, серія). */
function applyGameResult(result: GameResult) {
  useDataStore.setState({ game: withPendingSeen(result.game) })
  if (result.events.length) useGameUi.getState().push(result.events)
}

/**
 * Ачівки, які вже позначено «показано» локально, але сервер цього ще не підтвердив.
 * Без цього швидке закриття двох модалок поспіль давало «мерехтіння»: відповідь на
 * першу дію ще не знала про другу і повертала модалку назад.
 */
const pendingSeen = new Map<string, number>()

function withPendingSeen(game: GameState): GameState {
  for (const id of pendingSeen.keys()) if (id in game.seen) pendingSeen.delete(id)
  return pendingSeen.size ? { ...game, seen: { ...game.seen, ...Object.fromEntries(pendingSeen) } } : game
}

/** Забрати нагороду ачівки, закрити сповіщення, dev-дії. Помилку покаже тост. */
export async function gameAction(action: GameAction): Promise<void> {
  const res = await save(
    () => api.gameAction(action),
    () => {},
  )
  applyGameResult(res)
}

/** Позначити ачівку як показану (модалка більше не вискакує) — одразу локально, потім на сервері. */
function markAchievementSeen(id: string): void {
  const game = useDataStore.getState().game
  if (!game || id in game.seen) return
  pendingSeen.set(id, Date.now())
  useDataStore.setState({ game: withPendingSeen(game) })
}

/** Модалку ачівки закрили: пізніше нагороду можна забрати у вітрині. */
export function dismissAchievement(id: string): void {
  markAchievementSeen(id)
  void gameAction({ action: 'seen', id }).catch(() => {})
}

/** Забрати нагороду з модалки ачівки. */
export async function claimAchievementReward(id: string): Promise<void> {
  markAchievementSeen(id) // модалка зникає одразу, нагорода прилетить з відповіддю
  await gameAction({ action: 'claim', id })
}

/** Закрити «серію врятовано» — одразу локально, потім на сервері. */
export function dismissStreakNotice(): void {
  const game = useDataStore.getState().game
  if (game) useDataStore.setState({ game: { ...game, notice: null } })
  void gameAction({ action: 'dismissNotice' }).catch(() => {})
}

// ─── Мої страви ──────────────────────────────────────────────────────────────

const byUpdated = (a: Food, b: Food) => b.updatedAt - a.updatedAt

function putFoodLocal(food: Food) {
  useDataStore.setState((s) => ({ foods: [...s.foods.filter((f) => f.id !== food.id), food].sort(byUpdated) }))
}

/**
 * Зберігає страву в «Мої страви» (з результату пошуку OFF або з ручного вводу).
 * Для OFF id стабільний (`off-<штрихкод>`), тож повторне збереження не дублює страву.
 */
export async function saveFood(item: FoodItem): Promise<void> {
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
      if (!useDataStore.getState().foods.includes(food)) return // після нас уже змінили
      useDataStore.setState((s) => ({
        foods: existing ? s.foods.map((f) => (f === food ? existing : f)) : s.foods.filter((f) => f !== food),
      }))
    },
  )
  if (!res.applied) putFoodLocal(res.food)
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

export const useDay = (date: string): DayState => useDataStore((s) => s.days[date]) ?? EMPTY_DAY

export const useEntry = (date: string, id: string): Entry | undefined =>
  useDataStore((s) => s.days[date]?.entries.find((e) => e.id === id))

export const useGoals = (): Goals => useDataStore((s) => s.profile?.goals) ?? DEFAULT_GOALS

export const useFoods = (): Food[] => useDataStore((s) => s.foods)

export const useBody = (): BodyRecord[] => useDataStore((s) => s.body)

export const useGame = (): GameState | null => useDataStore((s) => s.game)

export const useTargetWeight = (): number | null => useDataStore((s) => s.profile?.targetWeight ?? null)

// ─── Автооновлення ───────────────────────────────────────────────────────────

/**
 * Ліміти безкоштовних тарифів (Vercel Hobby, Upstash Free): кожен запит — це
 * виклик функції + команди Redis. Тому без фонового опитування: застосунок
 * особистий, усі зміни робимо самі й одразу бачимо. Оновлюємо при поверненні
 * у вкладку (не частіше ніж раз на хвилину) і при поверненні мережі; переглянуті
 * дні вважаються свіжими до наступного такого оновлення.
 */
const REFRESH_MIN_MS = 60_000
const ONLINE_MIN_MS = 10_000
const DATE_DEBOUNCE_MS = 250

/** Підтягує поточний день, цілі, страви, заміри й стан гри. Повертає функцію зупинки. */
export function startAutoRefresh(): () => void {
  let lastRefresh = 0
  let lastToday = toDateKey()

  const refresh = () => {
    lastRefresh = Date.now()
    staleBefore = Date.now()

    // Застосунок лишили відкритим через північ: якщо дивились «сьогодні» — переходимо на новий день
    const ui = useUiStore.getState()
    const today = toDateKey()
    if (today !== lastToday && ui.selectedDate === lastToday) ui.goToday()
    lastToday = today

    void loadDay(useUiStore.getState().selectedDate)
    void guardedLoad(api.getProfile, ({ profile }) => useDataStore.setState({ profile })).catch(() => {})
    void guardedLoad(api.getFoods, ({ foods }) => useDataStore.setState({ foods, foodsLoaded: true })).catch(() => {})
    void guardedLoad(api.getBody, ({ records }) => useDataStore.setState({ body: records, bodyLoaded: true })).catch(() => {})
    void guardedLoad(api.getGame, ({ game }) => useDataStore.setState({ game: withPendingSeen(game) })).catch(() => {})
  }
  const throttled = (minMs: number) => () => {
    if (Date.now() - lastRefresh > minMs) refresh()
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') throttled(REFRESH_MIN_MS)()
  }
  const onOnline = throttled(ONLINE_MIN_MS)

  // Свайпи по днях: тягнемо лише день, на якому зупинились
  let dateTimer: ReturnType<typeof setTimeout> | undefined
  const unsubscribe = useUiStore.subscribe((s, prev) => {
    if (s.selectedDate === prev.selectedDate) return
    clearTimeout(dateTimer)
    dateTimer = setTimeout(() => void loadDay(useUiStore.getState().selectedDate), DATE_DEBOUNCE_MS)
  })

  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', onOnline)
  refresh()

  return () => {
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', onOnline)
    clearTimeout(dateTimer)
    unsubscribe()
  }
}
