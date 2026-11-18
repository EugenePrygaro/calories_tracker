/**
 * Підсумки днів для статистики — окремий hash ct:summary (дата → DaySummary),
 * щоб графік за рік читався однією командою, а не 365 HGETALL.
 * Оновлюється при кожній зміні записів дня; уперше будується з наявних днів.
 */
import { DATE_RE } from '../shared/model.js'
import { goalsForDate } from '../shared/goals.js'
import { summarize } from '../shared/stats.js'
import { obj, sanitizeEntry, sanitizeProfile } from '../shared/validate.js'
import { KEYS, parseStored } from './store.js'

/** @typedef {import('./store.js').RedisClient} RedisClient */
/** @typedef {import('../shared/stats.js').DaySummary} DaySummary */

/** @typedef {import('../shared/model.js').Profile | null} ProfileOrNull */

/** @param {RedisClient} r @returns {Promise<ProfileOrNull>} */
export async function currentProfile(r) {
  try {
    return sanitizeProfile(parseStored(await r.get(KEYS.profile)))
  } catch {
    return null // профілю ще немає — норми за замовчуванням
  }
}

/** Записи дня з Redis (биті пропускаємо). @param {Record<string, unknown> | null} raw */
export function entriesOf(raw) {
  return Object.values(raw ?? {}).flatMap((v) => {
    try {
      return [sanitizeEntry(parseStored(v))]
    } catch {
      return []
    }
  })
}

/**
 * Перерахувати підсумок дня після зміни його записів. Норма — на цю дату (вихідні — більша).
 * @param {RedisClient} r @param {string} date
 * @param {ProfileOrNull} [profile] уже прочитаний профіль
 * @param {import('../shared/model.js').Entry[]} [dayEntries] уже прочитані записи дня
 */
export async function refreshDaySummary(r, date, profile, dayEntries) {
  const entries = dayEntries ?? entriesOf(await r.hgetall(KEYS.day(date)))
  if (entries.length === 0) {
    await r.hdel(KEYS.summary, date)
    return
  }
  const p = profile === undefined ? await currentProfile(r) : profile
  await r.hset(KEYS.summary, { [date]: summarize(date, entries, goalsForDate(p, date)) })
}

/** @param {unknown} v @returns {DaySummary | null} */
function sanitizeSummary(v) {
  const o = obj(parseStored(v))
  const g = obj(o.goals)
  const num = (/** @type {unknown} */ x) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0)
  if (typeof o.date !== 'string' || !DATE_RE.test(o.date)) return null
  return {
    date: o.date,
    kcal: num(o.kcal),
    protein: num(o.protein),
    fat: num(o.fat),
    carbs: num(o.carbs),
    entries: num(o.entries),
    goals: { kcal: num(g.kcal), protein: num(g.protein), fat: num(g.fat), carbs: num(g.carbs) },
  }
}

/**
 * Усі підсумки днів, за датою. Уперше (немає позначки ct:summary:ready)
 * будує їх з усіх наявних ct:day:* — разова міграція старих даних.
 * @param {RedisClient} r @returns {Promise<DaySummary[]>}
 */
export async function loadSummaries(r) {
  if (!(await r.get(KEYS.summaryReady))) {
    const profile = await currentProfile(r)
    const keys = await r.keys(KEYS.day('*'))
    for (const key of keys) {
      const date = key.slice(KEYS.day('').length)
      if (DATE_RE.test(date)) await refreshDaySummary(r, date, profile)
    }
    await r.set(KEYS.summaryReady, 1)
  }
  return Object.values((await r.hgetall(KEYS.summary)) ?? {})
    .map(sanitizeSummary)
    .filter((s) => s !== null)
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}
