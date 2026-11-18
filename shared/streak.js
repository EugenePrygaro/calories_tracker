/**
 * Серія для інтерфейсу (HUD і шторка «Серія»): стан на сьогодні та ланцюжок днів.
 * Чисті функції над GameState — правила ті самі, що в registerActivity (shared/game.js):
 * перший пропущений день безкоштовний, кожен наступний з'їдає щит, не вистачає щитів — серія з 1.
 */
import { ACHIEVEMENTS } from './achievements.js'
import { STREAK_GRACE_DAYS, dayDiff } from './game.js'

/** @typedef {import('./game.js').GameState} GameState */
/** @typedef {import('./achievements.js').Achievement} Achievement */

/**
 * Стан серії на сьогодні:
 *  - `none`    — серії ще немає;
 *  - `done`    — сьогодні вже зараховано;
 *  - `pending` — учора був запис, сьогодні ще ні;
 *  - `saved`   — були пропуски, але запис сьогодні серію збереже (`shieldsNeeded` щитів, може бути 0 — безкоштовний пропуск);
 *  - `lost`    — пропусків більше, ніж покривають щити: наступний запис почне серію з 1.
 * @typedef {{ kind: 'none' | 'done' | 'pending' | 'saved' | 'lost', missed: number, shieldsNeeded: number }} StreakStatus
 */

/**
 * @param {Pick<GameState, 'streak' | 'lastActiveDate' | 'shields'>} state
 * @param {string} today YYYY-MM-DD за місцевим часом
 * @returns {StreakStatus}
 */
export function streakStatus(state, today) {
  const last = state.lastActiveDate
  if (!last || state.streak <= 0) return { kind: 'none', missed: 0, shieldsNeeded: 0 }
  if (last >= today) return { kind: 'done', missed: 0, shieldsNeeded: 0 }
  const missed = dayDiff(last, today) - 1
  if (missed <= 0) return { kind: 'pending', missed: 0, shieldsNeeded: 0 }
  const shieldsNeeded = Math.max(0, missed - STREAK_GRACE_DAYS)
  return { kind: shieldsNeeded <= state.shields ? 'saved' : 'lost', missed, shieldsNeeded }
}

/**
 * Клітинка ланцюжка:
 *  - `active`  — був запис (і день у поточній серії);
 *  - `grace`   — безкоштовний пропуск усередині серії;
 *  - `shield`  — пропуск, який закрила заморозка;
 *  - `old`     — запис, але до початку поточної серії;
 *  - `missed`  — пропуск поза серією;
 *  - `today`   — сьогодні, ще без запису.
 * `pending` — пропуск після останнього запису, який закриється (безкоштовно чи щитом), лише якщо записати сьогодні.
 * @typedef {{ date: string, kind: 'active' | 'grace' | 'shield' | 'old' | 'missed' | 'today', pending?: boolean }} ChainDay
 */

/** Наступна дата YYYY-MM-DD. @param {string} date @param {number} n */
function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Скільки днів назад шукати початок серії, якщо історія неповна. */
const MAX_LOOKBACK = 400

/**
 * Дата початку поточної серії: від останнього запису назад, поки не набереться `streak` днів із записами.
 * Серія рахує лише дні з записами, тож пропуски всередині (безкоштовні й закриті щитами) — між ними.
 * Якщо історії не вистачає (не завантажилась) — null.
 * @param {ReadonlySet<string>} active @param {string} last @param {number} streak
 */
export function streakStart(active, last, streak) {
  let left = streak
  let date = last
  for (let i = 0; i < MAX_LOOKBACK && left > 0; i++, date = addDays(date, -1)) {
    if (active.has(date) && --left === 0) return date
  }
  return null
}

/**
 * Ланцюжок за останні `days` днів (до сьогодні включно).
 * @param {{ active: ReadonlySet<string>, state: Pick<GameState, 'streak' | 'lastActiveDate' | 'shields'>, today: string, days?: number }} p
 * @returns {ChainDay[]}
 */
export function streakChain({ active, state, today, days = 14 }) {
  const status = streakStatus(state, today)
  const last = state.lastActiveDate
  const start = last && status.kind !== 'none' ? streakStart(active, last, state.streak) : null
  // пропуски, що належать серії: усередині неї й (якщо серію ще можна врятувати) після останнього запису
  const gapEnd = status.kind === 'saved' || status.kind === 'pending' ? addDays(today, -1) : last

  /** @type {ChainDay[]} */
  const out = []
  let gapRun = 0 // котрий день поспіль без запису всередині серії
  // рахуємо пропуски з початку серії, щоб перший у кожному проміжку був безкоштовним
  const from = addDays(today, -(days - 1))
  for (let date = start && start < from ? start : from; date <= today; date = addDays(date, 1)) {
    const has = active.has(date)
    /** @type {ChainDay} */
    let cell
    if (date === today && !has) cell = { date, kind: 'today' }
    else if (has) cell = { date, kind: start && date >= start ? 'active' : 'old' }
    else if (start && gapEnd && date > start && date <= gapEnd) {
      gapRun++
      const pending = !!last && date > last
      cell = { date, kind: gapRun <= STREAK_GRACE_DAYS ? 'grace' : 'shield', ...(pending ? { pending } : {}) }
    } else cell = { date, kind: 'missed' }
    if (has) gapRun = 0
    if (date >= from) out.push(cell)
  }
  return out
}

/** Наступна ачівка за серію (поки рекорд її не досяг) або null, якщо всі зібрано. @param {number} bestStreak */
export function nextStreakAchievement(bestStreak) {
  return ACHIEVEMENTS.filter((a) => a.stat === 'bestStreak').find((a) => a.goal > bestStreak) ?? null
}

const PLURAL = new Intl.PluralRules('uk')

/** «1 день», «3 дні», «12 днів». @param {number} n */
export function daysWord(n) {
  const rule = PLURAL.select(n)
  return rule === 'one' ? 'день' : rule === 'few' ? 'дні' : 'днів'
}
