import { useMemo } from 'react'
import { create } from 'zustand'
import {
  DEFAULT_GOALS,
  type BodyField,
  type BodyRecord,
  type Entry,
  type EntryPortion,
  type Food,
  type FoodItem,
  type Goals,
  type MealType,
  type Profile,
} from '@shared/model.js'
import { sanitizeBodyRecord, sanitizeEntry, sanitizeFood, sanitizeProfile } from '@shared/validate.js'
import type { GameState } from '@shared/game.js'
import { goalsForDate } from '@shared/goals.js'
import type { DaySummary } from '@shared/stats.js'
import {
  PROFILE_KEY,
  bodyKey,
  enqueue,
  entryKey,
  foodKey,
  overlayBody,
  overlayDay,
  overlayFoods,
  overlayProfile,
  requeueFront,
  type OutboxOp,
} from '@shared/outbox.js'
import type { ShopErrorCode, ShopItemId, UsableItemId } from '@shared/shop.js'
import { toDateKey } from '@/lib/date'
import { haptic } from '@/lib/haptics'
import type { AppTheme } from '@/lib/theme'
import { useGameUi } from '@/store/gameUi'
import { useUiStore } from '@/store/ui'
import { ApiError, NetworkError, api, type FoodUsage, type GameAction, type GameResult } from './api'

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
  /** id страви → скільки разів і коли востаннє додавали (для «Нещодавні» / «Часті») */
  foodUsage: Record<string, FoodUsage>
  /** Заміри тіла, за датою від старих */
  body: BodyRecord[]
  bodyLoaded: boolean
  /** Гейміфікація: монети, стрік, щити, ачівки (рахує сервер) */
  game: GameState | null
  /** Підсумки днів із сервера (статистика); дні, відкриті в цій сесії, свіжіші — див. useDaySummaries */
  stats: DaySummary[] | null
  /** Скільки запитів на збереження зараз у дорозі. */
  saving: number
  /** Скільки змін чекають мережі в офлайн-черзі */
  pending: number
}

export const useDataStore = create<DataState>()(() => ({
  days: {},
  profile: null,
  foods: [],
  foodsLoaded: false,
  foodUsage: {},
  body: [],
  bodyLoaded: false,
  saving: 0,
  pending: 0,
  game: null,
  stats: null,
}))

const EMPTY_DAY: DayState = { entries: [], loaded: false, error: false, loadedAt: 0 }

// ─── Знімок для миттєвого старту ─────────────────────────────────────────────

/**
 * Останні відомі дані в localStorage: при запуску головний екран малюється одразу
 * (без скелетонів і очікування шести запитів), а свіжі дані підтягуються у фоні.
 * Сьогоднішній день із знімка вважається застарілим (loadedAt: 0) — його однаково
 * буде перезавантажено; знімок лише прибирає порожній екран на старті.
 */
const SNAPSHOT_KEY = 'ct:snapshot:v1'

interface Snapshot {
  profile: Profile | null
  foods: Food[]
  foodUsage?: Record<string, FoodUsage>
  body: BodyRecord[]
  game: GameState | null
  stats: DaySummary[] | null
  today: { date: string; entries: Entry[] } | null
}

function hydrateFromSnapshot(): void {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY)
    if (!raw) return
    const snap = JSON.parse(raw) as Partial<Snapshot>
    const today = toDateKey()
    useDataStore.setState({
      profile: snap.profile ?? null,
      ...(Array.isArray(snap.foods) ? { foods: snap.foods, foodsLoaded: true, foodUsage: snap.foodUsage ?? {} } : {}),
      ...(Array.isArray(snap.body) ? { body: snap.body, bodyLoaded: true } : {}),
      game: snap.game ?? null,
      stats: Array.isArray(snap.stats) ? snap.stats : null,
      days:
        snap.today?.date === today && Array.isArray(snap.today.entries)
          ? { [today]: { entries: snap.today.entries, loaded: true, error: false, loadedAt: 0 } }
          : {},
    })
  } catch {
    // зіпсований знімок — просто стартуємо з мережі
  }
}

/** Записує знімок не частіше ніж раз на секунду і обов'язково, коли вкладку ховають. */
function persistSnapshots(): void {
  let timer: ReturnType<typeof setTimeout> | undefined
  const write = () => {
    clearTimeout(timer)
    timer = undefined
    const s = useDataStore.getState()
    const today = toDateKey()
    const day = s.days[today]
    const snap: Snapshot = {
      profile: s.profile,
      foods: s.foodsLoaded ? s.foods : [],
      foodUsage: s.foodUsage,
      body: s.bodyLoaded ? s.body : [],
      game: s.game,
      stats: s.stats,
      today: day?.loaded && !day.error ? { date: today, entries: day.entries } : null,
    }
    try {
      localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap))
    } catch {
      // переповнено чи приватний режим — без знімка
    }
  }
  useDataStore.subscribe((s, prev) => {
    if (s.profile === prev.profile && s.foods === prev.foods && s.foodUsage === prev.foodUsage && s.body === prev.body && s.game === prev.game && s.stats === prev.stats && s.days === prev.days) return
    timer ??= setTimeout(write, 1000)
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && timer) write()
  })
}

if (typeof window !== 'undefined') {
  hydrateFromSnapshot()
  persistSnapshots()
}
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

/** Відмови магазину, які сервер повертає кодом (409). */
const SHOP_ERRORS: Partial<Record<ShopErrorCode, string>> = {
  not_enough_coins: 'Не вистачає калокоїнів',
  inventory_full: 'Інвентар уже повний',
  max_level: 'Уже максимальне розширення',
  none_left: 'Цього товару немає в інвентарі',
  already_active: 'Уже діє сьогодні',
  kcal_done: 'Норму калорій сьогодні вже зараховано — квиток не потрібен',
  nothing_to_restore: 'Немає обірваної серії, яку можна повернути',
  already_owned: 'Цю тему вже куплено',
  not_owned: 'Спершу купіть цю тему в магазині',
  not_enough_styles: 'Для «стилю дня» потрібно щонайменше 2 куплені естетичні стилі',
}

function errorMessage(err: unknown): string {
  if (err instanceof NetworkError) return 'Немає з’єднання з сервером. Зміну не збережено.'
  if (err instanceof ApiError && err.status === 409 && err.message in SHOP_ERRORS) {
    return SHOP_ERRORS[err.message as ShopErrorCode] as string
  }
  if (err instanceof ApiError && err.status === 400) return 'Сервер відхилив дані. Перевірте значення.'
  return 'Не вдалося зберегти. Спробуйте ще раз.'
}

/**
 * Збереження, яке потребує мережі (дії в грі: магазин, нагороди, теми): у чергу запитів,
 * лічильник «зберігається…», відкат і тост при помилці. quiet — без тосту (фонові позначки).
 */
async function save<T>(request: () => Promise<T>, rollback: () => void, opts: { quiet?: boolean } = {}): Promise<T> {
  useDataStore.setState((s) => ({ saving: s.saving + 1 }))
  try {
    return await serial(request)
  } catch (err) {
    rollback()
    if (!opts.quiet) {
      useUiStore
        .getState()
        .showToast(err instanceof NetworkError ? 'Потрібен інтернет: магазин, нагороди й теми працюють лише онлайн' : errorMessage(err))
    }
    throw err
  } finally {
    useDataStore.setState((s) => ({ saving: s.saving - 1 }))
  }
}

// ─── Офлайн-черга ────────────────────────────────────────────────────────────

/**
 * Записи їжі, заміри, профіль і страви без мережі не відкочуються, а чекають у черзі
 * (localStorage — переживає закриття застосунку) і надсилаються, щойно з'явиться зв'язок.
 * Склеювання змін і накладання на дані з сервера — shared/outbox.js.
 * Сервер нараховує нагороди за такі записи від часу їх створення (shared/game.js, rewardMoment).
 */
const OUTBOX_KEY = 'ct:outbox:v1'

function readOutbox(): OutboxOp[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? '[]')
    return Array.isArray(v) ? (v as OutboxOp[]) : []
  } catch {
    return []
  }
}

let outbox: OutboxOp[] = typeof window === 'undefined' ? [] : readOutbox()
useDataStore.setState({ pending: outbox.length })

function setOutbox(next: OutboxOp[]) {
  outbox = next
  try {
    if (next.length) localStorage.setItem(OUTBOX_KEY, JSON.stringify(next))
    else localStorage.removeItem(OUTBOX_KEY)
  } catch {
    // переповнено чи приватний режим — черга живе до перезавантаження
  }
  useDataStore.setState({ pending: next.length })
}

let offlineNotified = false
function queueOffline(op: OutboxOp) {
  setOutbox(enqueue(outbox, op))
  if (!offlineNotified) {
    offlineNotified = true
    useUiStore.getState().showToast('Немає мережі — зміни збережено на телефоні й надішлемо, щойно з’явиться зв’язок', { tone: 'info' })
  }
}

/**
 * Зміна даних: надіслати, а без мережі — у чергу (без відкату). Повертає відповідь сервера
 * або null, якщо зміна чекає в черзі. Поки черга не порожня, нові зміни стають за нею — порядок зберігається.
 */
async function write<T>(op: OutboxOp, request: () => Promise<T>, rollback: () => void): Promise<T | null> {
  if (outbox.length > 0 || !navigator.onLine) {
    queueOffline(op)
    void flushOutbox()
    return null
  }
  useDataStore.setState((s) => ({ saving: s.saving + 1 }))
  try {
    return await serial(request)
  } catch (err) {
    if (err instanceof NetworkError) {
      queueOffline(op)
      return null
    }
    rollback()
    useUiStore.getState().showToast(errorMessage(err))
    throw err
  } finally {
    useDataStore.setState((s) => ({ saving: s.saving - 1 }))
  }
}

/** Надіслати одну зміну з черги й застосувати відповідь (нагороди, новіші версії з сервера). */
async function sendOp(op: OutboxOp): Promise<void> {
  switch (op.kind) {
    case 'putEntry':
      applyEntryResponse(await api.putEntry(op.entry, op.source, op.foodId))
      return
    case 'deleteEntry':
      await api.deleteEntry(op.id, op.date)
      return
    case 'putProfile': {
      const res = await api.putProfile(op.profile)
      if (!res.applied) useDataStore.setState({ profile: res.profile })
      return
    }
    case 'putBody': {
      const res = await api.putBody(op.record)
      if (!res.applied) setBodyLocal((rs) => [...rs.filter((r) => r.date !== res.record.date), res.record])
      return
    }
    case 'deleteBody':
      await api.deleteBody(op.date)
      return
    case 'putFood': {
      const res = await api.putFood(op.food)
      if (!res.applied) putFoodLocal(res.food)
      return
    }
    case 'deleteFood':
      await api.deleteFood(op.id)
      return
  }
}

let flushing = false

/** Надіслати чергу по одній зміні. Мережа знову зникла — зупиняємось, решта чекає далі. */
export async function flushOutbox(): Promise<void> {
  if (flushing || outbox.length === 0 || !navigator.onLine) return
  flushing = true
  let sent = 0
  try {
    while (outbox.length > 0) {
      const op = outbox[0] as OutboxOp
      setOutbox(outbox.slice(1))
      try {
        await serial(() => sendOp(op))
        sent++
      } catch (err) {
        if (err instanceof NetworkError || (err instanceof ApiError && err.status >= 500)) {
          setOutbox(requeueFront(outbox, op))
          break
        }
        // сервер відхилив саму зміну (некоректні дані) — повторювати марно
        useUiStore.getState().showToast('Одну зміну не вдалося синхронізувати — сервер її відхилив')
      }
    }
  } finally {
    flushing = false
  }
  if (outbox.length === 0 && sent > 0) {
    offlineNotified = false
    useUiStore.getState().showToast(`Синхронізовано змін: ${sent}`, { tone: 'info' })
    void loadStats()
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
    // ще не надіслані офлайн-зміни цього дня — поверх серверних даних
    ({ entries }) => patchDay(date, { entries: overlayDay(entries, date, outbox), loaded: true, error: false, loadedAt: Date.now() }),
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
      /** Додали порцією («2 штуки») — щоб у щоденнику було видно не лише грами */
      portion?: EntryPortion | null
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

/** @param opts.foodId запис додано з «Моїх страв» — рахується для «Нещодавні» / «Часті» */
export async function addEntry(draft: EntryDraft, opts: { foodId?: string } = {}): Promise<void> {
  const entry = buildEntry(draft)
  mutateDay(entry.date, (es) => [...es, entry])
  if (opts.foodId) {
    const id = opts.foodId
    useDataStore.setState((s) => {
      const prev = s.foodUsage[id]
      return { foodUsage: { ...s.foodUsage, [id]: { n: (prev?.n ?? 0) + 1, last: entry.createdAt } } }
    })
  }
  const res = await write(
    { kind: 'putEntry', key: entryKey(entry.id), entry, isNew: true, ...(opts.foodId ? { foodId: opts.foodId } : {}) },
    () => api.putEntry(entry, undefined, opts.foodId),
    () => mutateDay(entry.date, (es) => es.filter((e) => e.id !== entry.id)),
  )
  if (res) applyEntryResponse(res)
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
      const source = i === 0 ? ('copy' as const) : undefined
      const res = await write(
        { kind: 'putEntry', key: entryKey(entry.id), entry, isNew: true, ...(source ? { source } : {}) },
        () => api.putEntry(entry, source),
        () => {},
      )
      if (res) applyEntryResponse(res)
      onCopied?.(src.id) // і надіслане, і поставлене в офлайн-чергу — уже скопійоване
    } catch (err) {
      // ця й решта ще не надісланих копій — прибираємо
      const unsent = new Set(copies.slice(i).map((c) => c.entry.id))
      mutateDay(date, (es) => es.filter((e) => !unsent.has(e.id)))
      throw err
    }
  }
}

/** `portion: null` — запис більше не порцією (грами змінили вручну). */
export type EntryPatch = Partial<Pick<Entry, 'name' | 'grams' | 'kcal' | 'protein' | 'fat' | 'carbs'>> & {
  portion?: EntryPortion | null
}

/** Для режиму weight нутрієнти перераховуються з per100 у shared/validate.js. */
export async function updateEntry(prev: Entry, patch: EntryPatch): Promise<void> {
  const next = sanitizeEntry({
    ...prev,
    ...patch,
    // строго більше за попередній — інакше сервер вважатиме версію старою
    updatedAt: Math.max(Date.now(), prev.updatedAt + 1),
  })
  mutateDay(prev.date, (es) => es.map((e) => (e.id === prev.id ? next : e)))
  const res = await write(
    { kind: 'putEntry', key: entryKey(next.id), entry: next, isNew: false },
    () => api.putEntry(next),
    // відкочуємо, лише якщо після нас запис ніхто не змінив
    () => mutateDay(prev.date, (es) => es.map((e) => (e === next ? prev : e))),
  )
  if (res) applyEntryResponse(res)
}

export async function deleteEntry(entry: Entry): Promise<void> {
  mutateDay(entry.date, (es) => es.filter((e) => e.id !== entry.id))
  await write(
    { kind: 'deleteEntry', key: entryKey(entry.id), id: entry.id, date: entry.date },
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
  const res = await write(
    { kind: 'putEntry', key: entryKey(back.id), entry: back, isNew: false },
    () => api.putEntry(back),
    () => mutateDay(entry.date, (es) => es.filter((e) => e !== back)),
  )
  if (res) applyEntryResponse(res)
}

// ─── Профіль: денні цілі й цільова вага ──────────────────────────────────────

interface ProfileInput {
  goals: Record<keyof Goals, string | number>
  /** Порожньо — ціль не задана */
  targetWeight: string | number
  /** На скільки % більше калорій на вихідних */
  weekendBoost: string | number
}

export async function saveProfile(input: ProfileInput): Promise<void> {
  const prev = useDataStore.getState().profile
  const profile: Profile = sanitizeProfile({
    goals: input.goals,
    targetWeight: input.targetWeight,
    weekendBoost: input.weekendBoost,
    updatedAt: Math.max(Date.now(), (prev?.updatedAt ?? 0) + 1),
  })
  useDataStore.setState({ profile })
  const res = await write(
    { kind: 'putProfile', key: PROFILE_KEY, profile },
    () => api.putProfile(profile),
    () => {
      if (useDataStore.getState().profile === profile) useDataStore.setState({ profile: prev })
    },
  )
  if (res && !res.applied) useDataStore.setState({ profile: res.profile })
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
  const res = await write(
    { kind: 'putBody', key: bodyKey(date), record },
    () => api.putBody(record),
    () => {
      if (useDataStore.getState().body.some((r) => r === record)) replace(prev)
    },
  )
  if (res && !res.applied) replace(res.record)
}

export async function deleteBodyRecord(date: string): Promise<void> {
  const prev = useDataStore.getState().body.find((r) => r.date === date)
  if (!prev) return
  setBodyLocal((rs) => rs.filter((r) => r.date !== date))
  await write(
    { kind: 'deleteBody', key: bodyKey(date), date },
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
export async function gameAction(action: GameAction, opts: { quiet?: boolean } = {}): Promise<void> {
  const res = await save(
    () => api.gameAction(action),
    () => {},
    opts,
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
  void gameAction({ action: 'seen', id }, { quiet: true }).catch(() => {})
}

/** Забрати нагороду з модалки ачівки. */
export async function claimAchievementReward(id: string): Promise<void> {
  markAchievementSeen(id) // модалка зникає одразу, нагорода прилетить з відповіддю
  await gameAction({ action: 'claim', id })
}

/** Купити товар у магазині. Списання й нагороди показує стрічка подій. */
export async function buyShopItem(item: ShopItemId): Promise<void> {
  haptic(12)
  await gameAction({ action: 'buy', item })
}

/** Використати товар з інвентарю (бустер, читміл, супер вогник). */
export async function activateShopItem(item: UsableItemId): Promise<void> {
  haptic([10, 40, 18])
  await gameAction({ action: 'use', item })
}

/**
 * Увімкнути тему (стандартну чи куплену) або 'random' — щодня випадковий естетичний стиль.
 * Одразу локально, потім на сервері; відмова — повертаємо як було.
 */
export async function chooseTheme(theme: AppTheme | 'random'): Promise<void> {
  const prev = useDataStore.getState().game
  if (!prev) return
  const random = theme === 'random'
  if (random ? prev.dailyRandomTheme : prev.activeTheme === theme && !prev.dailyRandomTheme) return
  haptic(10)
  const next = random ? { ...prev, dailyRandomTheme: true } : { ...prev, activeTheme: theme, dailyRandomTheme: false }
  useDataStore.setState({ game: next })
  try {
    await gameAction({ action: 'theme', theme })
  } catch (err) {
    if (useDataStore.getState().game === next) useDataStore.setState({ game: prev })
    throw err
  }
}

/** Закрити «серію врятовано» — одразу локально, потім на сервері. */
export function dismissStreakNotice(): void {
  const game = useDataStore.getState().game
  if (game) useDataStore.setState({ game: { ...game, notice: null } })
  void gameAction({ action: 'dismissNotice' }, { quiet: true }).catch(() => {})
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
  const res = await write(
    { kind: 'putFood', key: foodKey(food.id), food },
    () => api.putFood(food),
    () => {
      if (!useDataStore.getState().foods.includes(food)) return // після нас уже змінили
      useDataStore.setState((s) => ({
        foods: existing ? s.foods.map((f) => (f === food ? existing : f)) : s.foods.filter((f) => f !== food),
      }))
    },
  )
  if (res && !res.applied) putFoodLocal(res.food)
}

/** Видалення з «Моїх страв» з можливістю скасувати: тост «Видалено · Повернути». */
export function removeFood(food: Food): void {
  haptic(12)
  useDataStore.setState((s) => ({ foods: s.foods.filter((f) => f.id !== food.id) }))
  void write(
    { kind: 'deleteFood', key: foodKey(food.id), id: food.id },
    () => api.deleteFood(food.id),
    () => {
      if (!useDataStore.getState().foods.some((f) => f.id === food.id)) putFoodLocal(food)
    },
  ).catch(() => {}) // помилку покаже тост із write()
  useUiStore.getState().showToast(`Видалено «${food.name}»`, {
    tone: 'info',
    action: { label: 'Повернути', run: () => void restoreFood(food).catch(() => {}) },
  })
}

/** Повертає щойно видалену страву: той самий id і дата створення, новіша версія. */
async function restoreFood(food: Food): Promise<void> {
  const back = sanitizeFood({ ...food, updatedAt: Math.max(Date.now(), food.updatedAt + 1) })
  putFoodLocal(back)
  const res = await write(
    { kind: 'putFood', key: foodKey(back.id), food: back },
    () => api.putFood(back),
    () => useDataStore.setState((s) => ({ foods: s.foods.filter((f) => f !== back) })),
  )
  if (res && !res.applied) putFoodLocal(res.food)
}

/** Нова власна страва з ручного вводу. */
export function newOwnFood(fields: Pick<FoodItem, 'name' | 'per100' | 'servingGrams' | 'portions' | 'barcode'>): FoodItem {
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

/** Базові норми з профілю (як їх задав користувач, без надбавки на вихідні). */
export const useGoals = (): Goals => useDataStore((s) => s.profile?.goals) ?? DEFAULT_GOALS

/** Норма на конкретну дату: на вихідних калорій більше (shared/goals.js). */
export function useGoalsFor(date: string): Goals {
  const profile = useDataStore((s) => s.profile)
  return useMemo(() => goalsForDate(profile, date), [profile, date])
}

export const useFoods = (): Food[] => useDataStore((s) => s.foods)

export const useBody = (): BodyRecord[] => useDataStore((s) => s.body)

export const useGame = (): GameState | null => useDataStore((s) => s.game)

/** Скільки змін чекають мережі (індикатор у шапці). */
export const usePending = (): number => useDataStore((s) => s.pending)

export const useTargetWeight = (): number | null => useDataStore((s) => s.profile?.targetWeight ?? null)

/** Підсумки днів для статистики (один запит — увесь рік). */
export function loadStats(): Promise<void> {
  return guardedLoad(api.getStats, ({ days }) => useDataStore.setState({ stats: days })).catch(() => {})
}

// ─── Автооновлення ───────────────────────────────────────────────────────────

/**
 * Ліміти безкоштовних тарифів (Vercel Hobby, Upstash Free): кожен запит — це
 * виклик функції + команди Redis. Тому без фонового опитування: застосунок
 * особистий, усі зміни робимо самі й одразу бачимо. Оновлюємо при поверненні
 * у вкладку (не частіше ніж раз на 5 хвилин — знімок і локальні зміни й так показують
 * актуальне; одразу, якщо змінилась дата) і при поверненні мережі; переглянуті дні
 * вважаються свіжими до наступного такого оновлення.
 */
const REFRESH_MIN_MS = 5 * 60_000
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
    // дані з сервера + ще не надіслані офлайн-зміни поверх
    void guardedLoad(api.getProfile, ({ profile }) => useDataStore.setState({ profile: overlayProfile(profile, outbox) })).catch(() => {})
    void guardedLoad(api.getFoods, ({ foods, usage }) =>
      useDataStore.setState({ foods: overlayFoods(foods, outbox), foodsLoaded: true, foodUsage: usage ?? {} }),
    ).catch(() => {})
    void guardedLoad(api.getBody, ({ records }) => useDataStore.setState({ body: overlayBody(records, outbox), bodyLoaded: true })).catch(() => {})
    void guardedLoad(api.getGame, ({ game }) => useDataStore.setState({ game: withPendingSeen(game) })).catch(() => {})
    void loadStats()
  }
  const throttled = (minMs: number) => () => {
    if (Date.now() - lastRefresh > minMs) refresh()
  }
  const onVisible = () => {
    if (document.visibilityState !== 'visible') return
    void flushOutbox()
    // повернулись після півночі — оновлюємо одразу (перехід на новий день), інакше не частіше REFRESH_MIN_MS
    if (toDateKey() !== lastToday) refresh()
    else throttled(REFRESH_MIN_MS)()
  }
  const onlineRefresh = throttled(ONLINE_MIN_MS)
  // зв'язок повернувся: спершу надсилаємо офлайн-чергу, потім оновлюємо дані
  const onOnline = () => {
    void flushOutbox().finally(onlineRefresh)
  }

  // Свайпи по днях: тягнемо лише день, на якому зупинились
  let dateTimer: ReturnType<typeof setTimeout> | undefined
  const unsubscribe = useUiStore.subscribe((s, prev) => {
    if (s.selectedDate === prev.selectedDate) return
    clearTimeout(dateTimer)
    dateTimer = setTimeout(() => void loadDay(useUiStore.getState().selectedDate), DATE_DEBOUNCE_MS)
  })

  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', onOnline)
  void flushOutbox() // черга з минулого разу
  refresh()

  return () => {
    document.removeEventListener('visibilitychange', onVisible)
    window.removeEventListener('online', onOnline)
    clearTimeout(dateTimer)
    unsubscribe()
  }
}
