/**
 * Пуш-сповіщення: які надіслати сьогодні ввечері й з яким текстом. Чиста логіка —
 * надсилання за розкладом робить api/cron.js (Vercel Cron, 20:00 UTC ≈ 22:00 за Києвом узимку).
 *
 * Тон — батя: коротко, сухо, «я все бачу».
 *   1. Порятунок серії — щовечора, якщо за день нічого не записано (випадковий текст, не як учора).
 *   2. Заморозку витратив — увечері того дня, коли її витратило.
 *   3. Підсумок тижня — щонеділі.
 */
import { STREAK_GRACE_DAYS, dayDiff, isSunday } from './game.js'
import { deficitOf } from './stats.js'

/** @typedef {import('./game.js').GameState} GameState */
/** @typedef {import('./stats.js').DaySummary} DaySummary */
/** @typedef {{ title: string, body: string, tag: string }} PushMessage */

/** «1 день», «2 дні», «5 днів», «21 день». @param {number} n */
export function daysWord(n) {
  const a = Math.abs(n) % 100
  const b = a % 10
  if (a > 10 && a < 20) return `${n} днів`
  if (b === 1) return `${n} день`
  if (b >= 2 && b <= 4) return `${n} дні`
  return `${n} днів`
}

/**
 * Порятунок серії: {days} — «12 днів», {n} — просто число.
 * @type {readonly { title: string, body: string }[]}
 */
export const RESCUE_MESSAGES = [
  { title: 'Твоя серія в {days} пише заповіт', body: 'Я так і знав.' },
  { title: '⚡ Терміново: {n}-денна серія на межі зникнення', body: 'Записуй!' },
  { title: 'Годі хавать і не записувать 🍔', body: 'Я все бачу 👀' },
  { title: 'Вогник на {days} просить дров 🪵', body: 'Швидесенько!' },
]

export const SHIELD_MESSAGE = { title: 'Заморозку витратив ❄️', body: 'Не звикай.' }

/** Тиждень вважаємо «записаним», якщо днів із записами щонайменше стільки. */
export const WEEK_MIN_DAYS = 4

/** Число з пробілами між розрядами: 2 400. @param {number} n */
const int = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

/** @param {string} text @param {number} n */
const fill = (text, n) => text.replaceAll('{days}', daysWord(n)).replaceAll('{n}', String(n))

/**
 * Серія, яка буде на екрані, якщо сьогодні нічого не записати: 0, якщо вона вже фактично обірвалась
 * (пропусків більше, ніж покривають безкоштовний день і заморозки).
 * @param {GameState} game @param {string} today
 */
export function liveStreak(game, today) {
  if (!game.lastActiveDate || game.streak <= 0) return 0
  const missedBeforeToday = Math.max(dayDiff(game.lastActiveDate, today) - 1, 0)
  return missedBeforeToday - STREAK_GRACE_DAYS > game.shields ? 0 : game.streak
}

/** Понеділок тижня, до якого належить дата. @param {string} date */
function mondayOf(date) {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7))
  return d.toISOString().slice(0, 10)
}

/**
 * @typedef {{
 *   lastRunDate: string | null,
 *   lastRescue: number,
 *   shieldsUsedSeen: number | null,
 * }} PushState
 */

/** @returns {PushState} */
export const newPushState = () => ({ lastRunDate: null, lastRescue: -1, shieldsUsedSeen: null })

/**
 * Що надіслати сьогодні ввечері.
 * @param {{ today: string, game: GameState, summaries: readonly DaySummary[], state: PushState, random?: () => number }} input
 * @returns {{ messages: PushMessage[], state: PushState }}
 */
export function planNotifications({ today, game, summaries, state, random = Math.random }) {
  /** @type {PushMessage[]} */
  const messages = []
  const next = { ...state, lastRunDate: today }
  // завдання за розкладом могло спрацювати двічі — вдруге нічого не шлемо
  if (state.lastRunDate === today) return { messages, state }

  const byDate = new Map(summaries.map((s) => [s.date, s]))
  const loggedToday = (byDate.get(today)?.entries ?? 0) > 0

  // 1. Порятунок серії — випадковий текст, але не той, що минулого разу
  if (!loggedToday) {
    let i = Math.floor(random() * RESCUE_MESSAGES.length)
    if (i === state.lastRescue) i = (i + 1) % RESCUE_MESSAGES.length
    const m = /** @type {{ title: string, body: string }} */ (RESCUE_MESSAGES[i])
    const n = liveStreak(game, today)
    messages.push({ title: fill(m.title, n), body: fill(m.body, n), tag: 'rescue' })
    next.lastRescue = i
  }

  // 2. Заморозку витратило з минулого разу (перший запуск лише запам'ятовує лічильник)
  const used = game.counters.shieldsUsed
  if (state.shieldsUsedSeen !== null && used > state.shieldsUsedSeen) {
    messages.push({ ...SHIELD_MESSAGE, tag: 'shield' })
  }
  next.shieldsUsedSeen = used

  // 3. Підсумок тижня (пн–нд) — щонеділі
  if (isSunday(today)) {
    const monday = mondayOf(today)
    const week = summaries.filter((s) => s.date >= monday && s.date <= today && s.entries > 0)
    if (week.length < WEEK_MIN_DAYS) {
      messages.push({ title: `Записано ${week.length} з 7 днів`, body: 'А решта де?', tag: 'week' })
    } else {
      const deficit = week.reduce((a, s) => a + deficitOf(s), 0)
      messages.push(
        deficit >= 0
          ? { title: `Тиждень: −${int(deficit)} ккал`, body: 'Молодець. Не розслабляйся.', tag: 'week' }
          : { title: `Тиждень: +${int(-deficit)} ккал 🍰`, body: 'Ну ти дав.', tag: 'week' },
      )
    }
  }

  return { messages, state: next }
}
