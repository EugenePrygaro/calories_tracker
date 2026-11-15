/**
 * Стан гри в Redis (ct:game) і серверні сценарії: запис їжі → нагороди, dev-дії.
 */
import { DATE_RE, MEAL_TYPES } from '../shared/model.js'
import { goalsForDate } from '../shared/goals.js'
import { sum } from '../shared/nutrition.js'
import { BASE_SHIELD_SLOTS, COUNTER_KEYS, dayDiff, grant, isNearToday, localToday, newDayAwards, newGameState, onEntrySaved, trackHoldings } from '../shared/game.js'
import { ID_ALIASES, isAchievementId } from '../shared/achievements.js'
import { DEFAULT_THEME, MAX_SHIELD_SLOTS, isThemeId } from '../shared/shop.js'
import { obj, sanitizeEntry, sanitizeProfile } from '../shared/validate.js'
import { HttpError } from './http.js'
import { KEYS, parseStored } from './store.js'

/** @typedef {import('../shared/game.js').GameState} GameState */
/** @typedef {import('../shared/game.js').GameEvent} GameEvent */
/** @typedef {import('../shared/game.js').DayAwards} DayAwards */
/** @typedef {import('../shared/model.js').MealType} MealType */
/** @typedef {import('../shared/model.js').Entry} Entry */
/** @typedef {import('./store.js').RedisClient} RedisClient */

/** @param {unknown} v @param {number} [max] */
const count = (v, max = 1e12) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(Math.max(Math.floor(v), 0), max) : 0)
/** @param {unknown} v */
const dateOrNull = (v) => (typeof v === 'string' && DATE_RE.test(v) ? v : null)

/**
 * Стан гри з Redis — з будь-якими пошкодженнями чи відсутніми полями.
 * @param {unknown} input @returns {GameState}
 */
export function sanitizeGame(input) {
  const o = obj(input)
  const s = newGameState()
  s.coins = count(o.coins)
  s.streak = count(o.streak, 100_000)
  s.bestStreak = Math.max(count(o.bestStreak, 100_000), s.streak)
  s.lastActiveDate = dateOrNull(o.lastActiveDate)
  s.lastSundayDate = dateOrNull(o.lastSundayDate)
  s.streakWeeksPaid = count(o.streakWeeksPaid, 100_000)
  s.shields = count(o.shields, 1000)
  s.shieldSlots = Math.min(Math.max(count(o.shieldSlots, 100), BASE_SHIELD_SLOTS), MAX_SHIELD_SLOTS)
  const inv = obj(o.inventory)
  s.inventory = {
    cheatMeal: count(inv.cheatMeal, 1000),
    boost: count(inv.boost, 1000),
    superFlame: count(inv.superFlame, 1),
    temu: count(inv.temu, 1000),
  }
  s.boostDate = dateOrNull(o.boostDate)
  const lost = obj(o.lostStreak)
  const lostDate = dateOrNull(lost.date)
  for (const [id, at] of Object.entries(obj(o.themes))) if (isThemeId(id)) s.themes[id] = count(at)
  s.cheatDays = (Array.isArray(o.cheatDays) ? o.cheatDays : []).filter((d) => typeof d === 'string' && DATE_RE.test(d)).slice(-400)
  s.activeTheme = isThemeId(o.activeTheme) && o.activeTheme in s.themes ? o.activeTheme : DEFAULT_THEME
  s.lostStreak = lostDate ? { value: count(lost.value, 100_000), weeksPaid: count(lost.weeksPaid, 100_000), date: lostDate } : null
  s.proteinStreak = count(o.proteinStreak, 100_000)
  s.bestProteinStreak = Math.max(count(o.bestProteinStreak, 100_000), s.proteinStreak)
  s.lastProteinDate = dateOrNull(o.lastProteinDate)
  s.entriesLogged = count(o.entriesLogged)
  s.updatedAt = count(o.updatedAt)

  const counters = obj(o.counters)
  for (const key of COUNTER_KEYS) s.counters[key] = count(counters[key])

  for (const [date, raw] of Object.entries(obj(o.days))) {
    if (!DATE_RE.test(date)) continue
    const d = obj(raw)
    const day = newDayAwards()
    day.meals = (Array.isArray(d.meals) ? d.meals : []).filter(/** @returns {m is MealType} */ (m) => MEAL_TYPES.includes(m))
    for (const flag of /** @type {const} */ (['protein', 'kcal', 'full', 'exact', 'perfect', 'carbs', 'fat', 'early', 'late', 'cheat'])) {
      day[flag] = d[flag] === true
    }
    day.entries = count(d.entries, 1000)
    day.edits = count(d.edits, 1000)
    day.kcalCounted = count(d.kcalCounted, 100_000)
    day.copies = count(d.copies, 1000)
    s.days[date] = day
  }
  for (const key of /** @type {const} */ (['claimed', 'seen', 'devUnlocked'])) {
    for (const [id, at] of Object.entries(obj(o[key]))) {
      if (!/^[a-z0-9_-]{1,40}$/.test(id)) continue
      // ачівки, що злилися з новим каталогом, переносимо на нові id
      s[key][ID_ALIASES[id] ?? id] = count(at)
    }
  }
  const n = obj(o.notice)
  const noticeDate = dateOrNull(n.date)
  s.notice = noticeDate
    ? { date: noticeDate, missed: count(n.missed, 1000), usedShields: count(n.usedShields, 1000), streak: count(n.streak, 100_000) }
    : null
  return s
}

/** @param {RedisClient} r */
export async function loadGame(r) {
  return sanitizeGame(parseStored(await r.get(KEYS.game)))
}

/** @param {RedisClient} r @param {GameState} state */
export async function saveGame(r, state) {
  await r.set(KEYS.game, state)
}

/** @param {unknown} value @returns {Entry | null} */
function storedEntry(value) {
  try {
    return sanitizeEntry(parseStored(value))
  } catch {
    return null
  }
}

/**
 * Після збереження запису їжі: перераховує день і видає нагороди.
 * @param {RedisClient} r
 * @param {Entry} entry збережений запис
 * @param {Entry | null} existing попередня версія (null — новий запис)
 * @param {{ tzOffset: number, copiedFromYesterday: boolean }} opts
 *   tzOffset — Date#getTimezoneOffset() клієнта (для «ранньої пташки» і «нічного дожору»);
 *   copiedFromYesterday — запис створено кнопкою «Скопіювати з учора» (для «Дня бабака»)
 * @param {number} [now]
 * @returns {Promise<{ game: GameState, events: GameEvent[] }>}
 */
export async function processEntrySaved(r, entry, existing, opts, now = Date.now()) {
  // Записи не за «сьогодні/вчора» гру не чіпають — не витрачаємо команди Redis
  if (!isNearToday(entry.date, now, opts.tzOffset)) return { game: await loadGame(r), events: [] }

  const [rawGame, rawDay, rawProfile] = await Promise.all([
    r.get(KEYS.game),
    r.hgetall(KEYS.day(entry.date)),
    r.get(KEYS.profile),
  ])
  const state = sanitizeGame(parseStored(rawGame))
  const entries = Object.values(rawDay ?? {})
    .map(storedEntry)
    .filter((e) => e !== null)

  /** @type {import('../shared/model.js').Profile | null} */
  let profile = null
  try {
    profile = sanitizeProfile(parseStored(rawProfile))
  } catch {
    // профілю ще немає — цілі за замовчуванням
  }
  // норма саме на дату запису (на вихідних калорій більше)
  const goals = goalsForDate(profile, entry.date)

  const events = onEntrySaved(
    state,
    {
      date: entry.date,
      isNewEntry: !existing,
      meals: new Set(entries.map((e) => e.meal)),
      totals: sum(entries),
      goals,
      entry,
      tzOffset: opts.tzOffset,
      copiedFromYesterday: opts.copiedFromYesterday,
      // «Ювелірна точність»: змінили вагу вже доданої страви
      weightEdited: !!existing && existing.mode === 'weight' && entry.mode === 'weight' && existing.grams !== entry.grams,
    },
    now,
  )
  // лічильники ачівок можуть змінитися й без подій — зберігаємо завжди
  await saveGame(r, state)
  return { game: state, events }
}

// ─── Dev-інструменти ─────────────────────────────────────────────────────────

/** Dev-дії можна вимкнути змінною середовища DISABLE_DEV_TOOLS=1 (наприклад, на Vercel). */
export function devToolsEnabled() {
  return process.env.DISABLE_DEV_TOOLS !== '1'
}

/**
 * @param {GameState} state @param {string} op @param {number} amount @param {number} [now]
 * @param {string} [id] ачівка для unlockAchievement / relockAchievement
 * @param {number} [tzOffset] часовий пояс клієнта — «сьогодні» для setStreak/setLastActive
 * @returns {{ state: GameState, events: GameEvent[] }}
 */
export function applyDevOp(state, op, amount, now = Date.now(), id = '', tzOffset = 0) {
  /** @param {number} daysAgo */
  const localDay = (daysAgo) => localToday(now - daysAgo * 86_400_000, tzOffset)
  /** @type {GameEvent[]} */
  const events = []
  const n = Math.trunc(amount)
  switch (op) {
    case 'addCoins':
      grant(state, n, 'dev', 'Тестові калокоїни', events)
      break
    case 'addShields':
      state.shields = Math.max(0, state.shields + n)
      trackHoldings(state)
      break
    case 'setStreak':
      state.streak = Math.max(0, n)
      state.bestStreak = Math.max(state.bestStreak, state.streak)
      state.streakWeeksPaid = Math.floor(state.streak / 7)
      state.lastActiveDate = state.streak > 0 ? localDay(0) : null
      break
    case 'setLastActive':
      // остання активність n днів тому — щоб перевірити ріст/порятунок/скидання серії
      state.lastActiveDate = localDay(Math.max(0, n))
      if (state.streak === 0) state.streak = 1
      break
    case 'clearToday':
      // дозволити заново отримати денні нагороди (і першу активність) за сьогодні
      for (const key of Object.keys(state.days)) if (Math.abs(dayDiff(localDay(0), key)) <= 1) delete state.days[key]
      break
    case 'unlockAchievement':
      // видати ачівку: мету вважаємо досягнутою, нагороду — не забраною, модалку — не показаною
      if (!isAchievementId(id)) throw new HttpError(400, 'unknown_achievement')
      state.devUnlocked[id] = now
      delete state.claimed[id]
      delete state.seen[id]
      break
    case 'relockAchievement':
      if (!isAchievementId(id)) throw new HttpError(400, 'unknown_achievement')
      delete state.devUnlocked[id]
      delete state.claimed[id]
      delete state.seen[id]
      break
    case 'reset':
      return { state: newGameState(), events }
    default:
      throw new HttpError(400, 'unknown_op')
  }
  state.updatedAt = now
  return { state, events }
}
