/**
 * «Як іде схуднення»: тренд і прогноз ваги, реальний розхід калорій, перевірки КБЖВ і звичок,
 * що дає найбільше калорій. Чисті функції — і для шторки на клієнті, і для сервера (вхід для Gemini).
 *
 * Реальний розхід (як в адаптивних калькуляторах): що їси в середньому + скільки калорій «з'їдає»
 * фактична зміна ваги (KCAL_PER_KG на кг). Тож він враховує і неточності записів, і активність.
 */
import { MEAL_TYPES } from './model.js'
import { KCAL_PER_KG } from './stats.js'

/** @typedef {import('./stats.js').DaySummary} DaySummary */
/** @typedef {import('./model.js').BodyRecord} BodyRecord */
/** @typedef {import('./model.js').Entry} Entry */
/** @typedef {import('./model.js').MealType} MealType */

/** Вікно аналізу: 4 тижні — досить, щоб згладити коливання води, і ще актуально. */
export const WINDOW_DAYS = 28
/** Тренд ваги — лише з такої кількості зважувань і за такий проміжок. */
export const MIN_WEIGH_INS = 3
export const MIN_SPAN_DAYS = 7
/** Реальний розхід — лише з такої кількості днів із записами. */
export const MIN_LOGGED_DAYS = 7
/** Нижче цієї частки днів із записами — середні ненадійні. */
export const MIN_COVERAGE = 0.7
/** Правдоподібний добовий розхід дорослого; поза ним — записи й вага не сходяться. */
export const TDEE_RANGE = { min: 1200, max: 5000 }
/** Менше цього на день — небезпечно мало, такий темп не пропонуємо. */
export const MIN_SAFE_KCAL = 1200

const DAY_MS = 86_400_000
const utc = (/** @type {string} */ d) => Date.parse(`${d}T00:00:00Z`)
/** @param {string} from @param {string} to */
const dayDiff = (from, to) => Math.round((utc(to) - utc(from)) / DAY_MS)
/** @param {string} date @param {number} n */
export const addDays = (date, n) => new Date(utc(date) + n * DAY_MS).toISOString().slice(0, 10)
/** @param {number} n */
const round1 = (n) => Math.round(n * 10) / 10
/** @param {number} n */
const round10 = (n) => Math.round(n / 10) * 10
/** @param {readonly number[]} xs */
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

/**
 * Тренд ваги: пряма через зважування за вікно (лінійна регресія) — денні коливання води згладжуються.
 * @typedef {{ perWeek: number, weight: number, weighIns: number, spanDays: number }} WeightTrend
 * perWeek — кг на тиждень (мінус — худнеш), weight — вага за трендом на сьогодні.
 * @param {readonly BodyRecord[]} records @param {string} today @param {number} [windowDays]
 * @returns {WeightTrend | null}
 */
export function weightTrend(records, today, windowDays = WINDOW_DAYS) {
  const from = addDays(today, -windowDays)
  const pts = records
    .filter((r) => r.weight !== null && r.date > from && r.date <= today)
    .map((r) => ({ x: dayDiff(from, r.date), y: /** @type {number} */ (r.weight) }))
  const first = pts[0]
  const last = pts.at(-1)
  if (pts.length < MIN_WEIGH_INS || !first || !last) return null
  const spanDays = last.x - first.x
  if (spanDays < MIN_SPAN_DAYS) return null
  const mx = mean(pts.map((p) => p.x))
  const my = mean(pts.map((p) => p.y))
  const sxx = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0)
  const slope = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / sxx
  const weight = my + slope * (dayDiff(from, today) - mx)
  return { perWeek: Math.round(slope * 7 * 100) / 100, weight: round1(weight), weighIns: pts.length, spanDays }
}

/**
 * Коли буде цільова вага за поточного темпу.
 * @typedef {{ kind: 'reached' } | { kind: 'stalled' } | { kind: 'away' } | { kind: 'far', days: number } | { kind: 'eta', date: string, days: number }} Forecast
 * @param {WeightTrend | null} trend @param {number | null} target @param {string} today
 * @returns {Forecast | null}
 */
export function goalForecast(trend, target, today) {
  if (!trend || target === null) return null
  const diff = target - trend.weight
  if (Math.abs(diff) < 0.3) return { kind: 'reached' }
  if (Math.abs(trend.perWeek) < 0.05) return { kind: 'stalled' }
  if (Math.sign(trend.perWeek) !== Math.sign(diff)) return { kind: 'away' }
  const days = Math.ceil(diff / (trend.perWeek / 7))
  if (days > 730) return { kind: 'far', days }
  return { kind: 'eta', date: addDays(today, days), days }
}

/**
 * Що їв за вікно (лише завершені дні — сьогодні ще триває).
 * @typedef {{ kcal: number, protein: number, fat: number, carbs: number }} Macros
 * @typedef {{
 *   loggedDays: number, windowDays: number, coverage: number,
 *   avg: Macros, goals: Macros, weekday: number | null, weekend: number | null,
 * }} IntakeSummary
 * @param {readonly DaySummary[]} summaries @param {string} today @param {number} [windowDays]
 * @returns {IntakeSummary | null}
 */
export function intakeSummary(summaries, today, windowDays = WINDOW_DAYS) {
  const from = addDays(today, -windowDays)
  const days = summaries.filter((s) => s.entries > 0 && s.date >= from && s.date < today)
  if (days.length === 0) return null
  /** @param {(s: DaySummary) => number} f */
  const avg = (f) => Math.round(mean(days.map(f)))
  const isWeekend = (/** @type {string} */ d) => [0, 6].includes(new Date(utc(d)).getUTCDay())
  const weekend = days.filter((s) => isWeekend(s.date))
  const weekday = days.filter((s) => !isWeekend(s.date))
  return {
    loggedDays: days.length,
    windowDays,
    coverage: round1(days.length / windowDays * 100) / 100,
    avg: { kcal: avg((s) => s.kcal), protein: avg((s) => s.protein), fat: avg((s) => s.fat), carbs: avg((s) => s.carbs) },
    goals: {
      kcal: avg((s) => s.goals.kcal),
      protein: avg((s) => s.goals.protein),
      fat: avg((s) => s.goals.fat),
      carbs: avg((s) => s.goals.carbs),
    },
    weekday: weekday.length ? Math.round(mean(weekday.map((s) => s.kcal))) : null,
    weekend: weekend.length ? Math.round(mean(weekend.map((s) => s.kcal))) : null,
  }
}

/**
 * Реальний добовий розхід: середнє з'їдене + калорії фактичної зміни ваги. null — замало даних.
 * @param {WeightTrend | null} trend @param {IntakeSummary | null} intake
 */
export function realExpenditure(trend, intake) {
  if (!trend || !intake || intake.loggedDays < MIN_LOGGED_DAYS) return null
  return round10(intake.avg.kcal - (trend.perWeek * KCAL_PER_KG) / 7)
}

/** Скільки їсти на день, щоб вага змінювалась на perWeek кг на тиждень (мінус — худнути). */
export const kcalForPace = (/** @type {number} */ tdee, /** @type {number} */ perWeek) =>
  round10(tdee + (perWeek * KCAL_PER_KG) / 7)

/** Темпи для підказки «скільки їсти»: кг на тиждень. */
export const PACES = [-0.25, -0.5, -0.75]

/**
 * @typedef {'bad' | 'warn' | 'info' | 'good'} CheckLevel
 * @typedef {{ id: string, level: CheckLevel, title: string, detail: string }} Check
 */

const LEVEL_ORDER = { bad: 0, warn: 1, info: 2, good: 3 }
/** @param {number} n */
const kgStr = (n) => round1(Math.abs(n)).toString().replace('.', ',')
/** г/кг з двома знаками — щоб на межі не було «0,6 — нижче 0,6». @param {number} n */
const perKg = (n) => n.toLocaleString('uk-UA', { maximumFractionDigits: 2 })
/** @param {number} n */
const num = (n) => Math.round(n).toLocaleString('uk-UA')

/**
 * Перевірки: темп, білок, жири, норма калорій, вихідні, повнота записів, чи сходяться вага й записи.
 * Від найважливіших.
 * @param {{
 *   trend: WeightTrend | null, intake: IntakeSummary | null, weight: number | null, targetWeight: number | null,
 *   implausibleTdee?: number | null,
 * }} p implausibleTdee — розхід вийшов поза TDEE_RANGE (вага й записи не сходяться)
 * @returns {Check[]}
 */
export function insightChecks({ trend, intake, weight, targetWeight, implausibleTdee = null }) {
  /** @type {Check[]} */
  const out = []
  const w = trend?.weight ?? weight

  if (implausibleTdee !== null && intake && trend) {
    out.push({
      id: 'mismatch',
      level: 'warn',
      title: 'Вага й записи не сходяться',
      detail: `За записами ти їси ≈ ${num(intake.avg.kcal)} ккал, а вага змінюється на ${trend.perWeek < 0 ? '−' : '+'}${kgStr(trend.perWeek)} кг на тиждень — так не буває. Схоже, частина їжі не записується (олія, соуси, напої, перекуси) або порції недооцінені.`,
    })
  }

  if (intake && intake.coverage < MIN_COVERAGE) {
    out.push({
      id: 'coverage',
      level: 'warn',
      title: 'Багато днів без записів',
      detail: `Записано ${intake.loggedDays} з ${intake.windowDays} днів — середні й прогноз можуть бути неточні.`,
    })
  }

  if (trend) {
    const losing = targetWeight === null ? trend.perWeek <= 0 : targetWeight < trend.weight
    const pct = (Math.abs(trend.perWeek) / trend.weight) * 100
    const pace = `${trend.perWeek < 0 ? '−' : '+'}${kgStr(trend.perWeek)} кг на тиждень`
    if (!losing) {
      out.push({ id: 'pace', level: 'info', title: 'Набір ваги', detail: `Темп ${pace}.` })
    } else if (trend.perWeek <= 0 && pct > 1) {
      out.push({
        id: 'pace',
        level: 'warn',
        title: 'Худнеш дуже швидко',
        detail: `${pace} — понад 1% ваги на тиждень: ризик втрачати м'язи й зірватися. Краще 0,5–1%.`,
      })
    } else if (trend.perWeek <= 0 && pct >= 0.5) {
      out.push({ id: 'pace', level: 'good', title: 'Темп у нормі', detail: `${pace} — 0,5–1% ваги на тиждень, як і треба.` })
    } else if (trend.perWeek <= 0 && pct >= 0.2) {
      out.push({ id: 'pace', level: 'info', title: 'Повільно, але стабільно', detail: `${pace}. Можна трохи збільшити дефіцит.` })
    } else if (pct < 0.2) {
      out.push({ id: 'pace', level: 'warn', title: 'Вага стоїть', detail: `${pace} за останні тижні — дефіциту фактично немає.` })
    } else {
      out.push({ id: 'pace', level: 'bad', title: 'Вага росте', detail: `${pace}, хоча ціль — схуднути.` })
    }
  }

  if (intake && w) {
    const proteinPerKg = intake.avg.protein / w
    const p = `${perKg(proteinPerKg)} г/кг (≈ ${num(intake.avg.protein)} г на день)`
    if (proteinPerKg < 1.2) {
      out.push({ id: 'protein', level: 'bad', title: 'Мало білка', detail: `${p}. На дефіциті потрібно 1,6–2,2 г/кг, щоб зберегти м'язи.` })
    } else if (proteinPerKg < 1.6) {
      out.push({ id: 'protein', level: 'warn', title: 'Білка трохи мало', detail: `${p}. Краще 1,6–2,2 г/кг.` })
    } else {
      out.push({ id: 'protein', level: 'good', title: 'Білка достатньо', detail: `${p}.` })
    }
    const fatPerKg = intake.avg.fat / w
    if (fatPerKg < 0.6) {
      out.push({
        id: 'fat',
        level: 'warn',
        title: 'Мало жирів',
        detail: `${perKg(fatPerKg)} г/кг — нижче 0,6 г/кг страждають гормони й засвоєння вітамінів.`,
      })
    }
  }

  if (intake && intake.goals.kcal > 0) {
    const ratio = intake.avg.kcal / intake.goals.kcal
    if (ratio > 1.1) {
      out.push({
        id: 'norm',
        level: 'warn',
        title: 'Перевищуєш норму',
        detail: `У середньому ${num(intake.avg.kcal)} ккал при нормі ${num(intake.goals.kcal)}.`,
      })
    } else if (ratio < 0.8) {
      out.push({
        id: 'norm',
        level: 'warn',
        title: 'Їси значно менше за норму',
        detail: `У середньому ${num(intake.avg.kcal)} ккал при нормі ${num(intake.goals.kcal)} — так легко зірватися.`,
      })
    }
  }

  if (intake && intake.weekday !== null && intake.weekend !== null && intake.weekend - intake.weekday > 300) {
    out.push({
      id: 'weekend',
      level: 'warn',
      title: 'Вихідні з’їдають дефіцит',
      detail: `У суботу й неділю в середньому на ${num(intake.weekend - intake.weekday)} ккал більше, ніж у будні.`,
    })
  }

  return out.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level])
}

/**
 * Що дає найбільше калорій: страви за назвою (без регістру) і частки прийомів їжі.
 * @typedef {{ name: string, kcal: number, share: number, times: number }} TopFood
 * @typedef {{ foods: TopFood[], meals: Record<MealType, number>, totalKcal: number, days: number }} FoodBreakdown
 * @param {readonly Entry[]} entries записи за вікно @param {number} days скільки днів охоплено @param {number} [limit]
 * @returns {FoodBreakdown}
 */
export function foodBreakdown(entries, days, limit = 8) {
  const total = entries.reduce((a, e) => a + e.kcal, 0)
  /** @type {Map<string, { name: string, kcal: number, times: number }>} */
  const byName = new Map()
  for (const e of entries) {
    const key = e.name.trim().toLowerCase()
    const cur = byName.get(key) ?? { name: e.name.trim(), kcal: 0, times: 0 }
    cur.kcal += e.kcal
    cur.times++
    byName.set(key, cur)
  }
  const share = (/** @type {number} */ kcal) => (total > 0 ? Math.round((kcal / total) * 1000) / 10 : 0)
  const foods = [...byName.values()]
    .sort((a, b) => b.kcal - a.kcal)
    .slice(0, limit)
    .map((f) => ({ name: f.name, kcal: Math.round(f.kcal), share: share(f.kcal), times: f.times }))
  const meals = /** @type {Record<MealType, number>} */ (
    Object.fromEntries(MEAL_TYPES.map((m) => [m, share(entries.filter((e) => e.meal === m).reduce((a, e) => a + e.kcal, 0))]))
  )
  return { foods, meals, totalKcal: Math.round(total), days }
}

/**
 * Усе разом — для шторки й для Gemini.
 * @typedef {{
 *   today: string, weight: number | null, targetWeight: number | null,
 *   trend: WeightTrend | null, forecast: Forecast | null, intake: IntakeSummary | null,
 *   tdee: number | null, paces: { perWeek: number, kcal: number }[], checks: Check[],
 * }} Analysis
 * @param {{ summaries: readonly DaySummary[], body: readonly BodyRecord[], targetWeight: number | null, today: string }} p
 * @returns {Analysis}
 */
export function analyze({ summaries, body, targetWeight, today }) {
  const trend = weightTrend(body, today)
  const latest = [...body].reverse().find((r) => r.weight !== null)?.weight ?? null
  const intake = intakeSummary(summaries, today)
  const raw = realExpenditure(trend, intake)
  // поза правдоподібним — не показуємо цифру, а пояснюємо, що записи й вага не сходяться
  const plausible = raw !== null && raw >= TDEE_RANGE.min && raw <= TDEE_RANGE.max
  const tdee = plausible ? raw : null
  return {
    today,
    weight: latest,
    targetWeight,
    trend,
    forecast: goalForecast(trend, targetWeight, today),
    intake,
    tdee,
    // темпи, де виходить небезпечно мало їжі, не пропонуємо
    paces:
      tdee === null
        ? []
        : PACES.map((perWeek) => ({ perWeek, kcal: kcalForPace(tdee, perWeek) })).filter((p) => p.kcal >= MIN_SAFE_KCAL),
    checks: insightChecks({ trend, intake, weight: latest, targetWeight, implausibleTdee: plausible ? null : raw }),
  }
}
