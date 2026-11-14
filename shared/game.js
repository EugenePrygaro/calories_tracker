/**
 * Гейміфікація: калокоїни (внутрішня валюта; у коді — coins), серії днів (стрік) зі щитами-заморозками, лічильники для ачівок.
 * Досвіду (XP) і рівнів немає — єдина валюта й міра прогресу — калокоїни.
 * Чиста логіка без Redis і без React: сервер застосовує її
 * при збереженні їжі (тож нагороди неможливо «намалювати» на клієнті), клієнт — лише показує.
 *
 * Захист від накрутки:
 *   - за кожен день зберігаються прапорці «вже нараховано» (прийоми їжі, білок, калораж,
 *     повний день, точний день…), тому видалення й повторне додавання запису нічого не дає;
 *   - сумарні калорії рахуються як приріст понад уже зарахований максимум дня;
 *   - нагороди лише за записи на сьогодні (±1 день — різниця часових поясів),
 *     щоб не можна було набивати монети минулими днями;
 *   - лічильники «за кількість» мають денні ліміти (страви, редагування ваги).
 */
import { MEAL_LABELS, MEAL_TYPES } from './model.js'

/** @typedef {import('./model.js').MealType} MealType */
/** @typedef {import('./model.js').Nutrients} Nutrients */
/** @typedef {import('./model.js').Goals} Goals */
/** @typedef {import('./model.js').Entry} Entry */

/**
 * Що вже зараховано за конкретний день.
 * @typedef {{
 *   meals: MealType[],
 *   protein: boolean,
 *   kcal: boolean,
 *   entries: number,
 *   full: boolean,
 *   exact: boolean,
 *   perfect: boolean,
 *   carbs: boolean,
 *   fat: boolean,
 *   early: boolean,
 *   late: boolean,
 *   kcalCounted: number,
 *   edits: number,
 *   copies: number,
 * }} DayAwards
 */

/**
 * Лічильники для ачівок (накопичуються за весь час).
 * @typedef {{
 *   exactCalorieDays: number,
 *   perfectMacroDays: number,
 *   earlyBreakfasts: number,
 *   lateSnacks: number,
 *   fullSlotsDays: number,
 *   carbsDays: number,
 *   fatDays: number,
 *   editWeight: number,
 *   totalCalories: number,
 *   maxCoins: number,
 *   maxShieldsHeld: number,
 *   shieldsUsed: number,
 *   comebacks: number,
 *   sundayStreak: number,
 *   bestSundayStreak: number,
 *   recipesCreated: number,
 *   copyYesterday: number,
 *   shopPurchases: number,
 * }} Counters
 */

/** @type {readonly (keyof Counters)[]} */
export const COUNTER_KEYS = [
  'exactCalorieDays',
  'perfectMacroDays',
  'earlyBreakfasts',
  'lateSnacks',
  'fullSlotsDays',
  'carbsDays',
  'fatDays',
  'editWeight',
  'totalCalories',
  'maxCoins',
  'maxShieldsHeld',
  'shieldsUsed',
  'comebacks',
  'sundayStreak',
  'bestSundayStreak',
  'recipesCreated',
  'copyYesterday',
  'shopPurchases',
]

/**
 * Сповіщення «серію врятовано» — показується під HUD, поки його не закриють.
 * @typedef {{ date: string, missed: number, usedShields: number, streak: number }} StreakNotice
 */

/**
 * @typedef {{
 *   coins: number,
 *   streak: number,
 *   bestStreak: number,
 *   lastActiveDate: string | null,
 *   lastSundayDate: string | null,
 *   streakWeeksPaid: number,
 *   shields: number,
 *   proteinStreak: number,
 *   bestProteinStreak: number,
 *   lastProteinDate: string | null,
 *   entriesLogged: number,
 *   counters: Counters,
 *   days: Record<string, DayAwards>,
 *   claimed: Record<string, number>,
 *   seen: Record<string, number>,
 *   devUnlocked: Record<string, number>,
 *   notice: StreakNotice | null,
 *   updatedAt: number,
 * }} GameState
 */

/** @typedef {'meal' | 'protein' | 'kcal' | 'streakWeek' | 'achievement' | 'dev'} RewardReason */

/**
 * Що сталося внаслідок дії — клієнт показує це анімаціями.
 * @typedef {(
 *   | { type: 'reward', reason: RewardReason, coins: number, label: string }
 *   | { type: 'streak', streak: number }
 *   | { type: 'rescue', missed: number, usedShields: number, streak: number }
 *   | { type: 'streakReset' }
 * )} GameEvent
 */

/**
 * Нагороди в монетах.
 * Економіка: максимум за день — 4 × 5 + 15 + 25 = 60 монет; бонус серії додає ~14/день,
 * разом ≈ 520 на тиждень ідеальної гри. Ачівки — за рівнем (див. TIER_REWARDS
 * у shared/achievements.js): бронза ≈ пів дня, срібло ≈ день, золото ≈ 2 дні, діамант ≈ 5 днів.
 */
export const REWARDS = {
  /** Заповнення секції прийому їжі (до 4 разів на день) */
  meal: 5,
  /** Білок у межах ±10% від цілі, раз на день */
  protein: 15,
  /** Калораж у межах ±10% від цілі — «закриття денної цілі», раз на день */
  kcal: 25,
  /** Кожні 7 днів безперервної серії */
  streakWeek: 100,
}

export const PROTEIN_TOLERANCE = 0.1
export const KCAL_TOLERANCE = 0.1
/** Допуск для макросів в ачівках («Ідеальний баланс», вуглеводи, жири). */
export const MACRO_TOLERANCE = 0.1
/** «Снайпер дефіциту»: калорії в межах ±10 ккал від цілі. */
export const EXACT_KCAL = 10
/** Ранній сніданок — до цієї години; пізній перекус — від цієї години (місцевий час). */
export const EARLY_BREAKFAST_HOUR = 10
export const LATE_SNACK_HOUR = 22
/** Скільки пропущених днів поспіль безкоштовні: серія не обривається і щити не витрачаються. */
export const STREAK_GRACE_DAYS = 1
export const MAX_ENTRIES_COUNTED_PER_DAY = 20
export const MAX_EDITS_COUNTED_PER_DAY = 3
/** «Важка артилерія»: за день зараховується не більше max(2 × ціль, цього значення) ккал. */
const DAILY_KCAL_CAP = 5000
/** «День бабака»: скільки натискань «Скопіювати з учора» зараховується за день. */
export const MAX_COPIES_COUNTED_PER_DAY = 5
/** Скільки днів історії нагород тримати (нагороди лише за «сьогодні ± 1»). */
const KEEP_DAYS = 7

/** @returns {Counters} */
export function newCounters() {
  return /** @type {Counters} */ (Object.fromEntries(COUNTER_KEYS.map((k) => [k, 0])))
}

/** @returns {DayAwards} */
export function newDayAwards() {
  return {
    meals: [],
    protein: false,
    kcal: false,
    entries: 0,
    full: false,
    exact: false,
    perfect: false,
    carbs: false,
    fat: false,
    early: false,
    late: false,
    kcalCounted: 0,
    edits: 0,
    copies: 0,
  }
}

/** @returns {GameState} */
export function newGameState() {
  return {
    coins: 0,
    streak: 0,
    bestStreak: 0,
    lastActiveDate: null,
    lastSundayDate: null,
    streakWeeksPaid: 0,
    shields: 0,
    proteinStreak: 0,
    bestProteinStreak: 0,
    lastProteinDate: null,
    entriesLogged: 0,
    counters: newCounters(),
    days: {},
    claimed: {},
    seen: {},
    devUnlocked: {},
    notice: null,
    updatedAt: 0,
  }
}

// ─── Монети ──────────────────────────────────────────────────────────────────

/**
 * Нараховує (або списує, якщо від'ємне) монети.
 * @param {GameState} state @param {number} coins
 * @param {RewardReason} reason @param {string} label @param {GameEvent[]} events
 */
export function grant(state, coins, reason, label, events) {
  state.coins = Math.max(0, state.coins + coins)
  events.push({ type: 'reward', reason, coins, label })
  trackHoldings(state)
}

/** Рекорди «скільки було одночасно» — для ачівок «Скарбничка» і «Броня від зривів». */
export function trackHoldings(/** @type {GameState} */ state) {
  state.counters.maxCoins = Math.max(state.counters.maxCoins, state.coins)
  state.counters.maxShieldsHeld = Math.max(state.counters.maxShieldsHeld, state.shields)
}

// ─── Дати ────────────────────────────────────────────────────────────────────

/** @param {string} key */
const utc = (key) => Date.parse(`${key}T00:00:00Z`)

/** Різниця в днях між датами YYYY-MM-DD. @param {string} from @param {string} to */
export const dayDiff = (from, to) => Math.round((utc(to) - utc(from)) / 86_400_000)

/** @param {number} ms */
const keyOf = (ms) => new Date(ms).toISOString().slice(0, 10)

/**
 * Сьогоднішня дата за місцевим часом клієнта.
 * @param {number} now @param {number} tzOffset Date#getTimezoneOffset() клієнта, хвилини
 */
export const localToday = (now, tzOffset) => keyOf(now - tzOffset * 60_000)

/**
 * Нагороди лише за «сьогодні» або «вчора» (дописати вечерю після півночі) за місцевим часом.
 * Майбутні дати — ні: інакше можна заздалегідь «захистити» серію й зібрати завтрашні нагороди.
 * @param {string} date @param {number} [now] @param {number} [tzOffset]
 */
export function isNearToday(date, now = Date.now(), tzOffset = 0) {
  const diff = dayDiff(localToday(now, tzOffset), date)
  return diff === 0 || diff === -1
}

/** Неділя? (дата YYYY-MM-DD без часу — день тижня від часового поясу не залежить) */
export const isSunday = (/** @type {string} */ date) => new Date(utc(date)).getUTCDay() === 0

/**
 * Місцева година моменту часу.
 * @param {number} ms мітка часу
 * @param {number} tzOffset Date#getTimezoneOffset() клієнта, хвилини (Київ влітку: −180)
 */
export const localHour = (ms, tzOffset) => new Date(ms - tzOffset * 60_000).getUTCHours()

// ─── Стрік ───────────────────────────────────────────────────────────────────

/**
 * Перший запис їжі за дату → оновлення серії.
 *  - учора була активність → +1;
 *  - перший пропущений день безкоштовний (STREAK_GRACE_DAYS) — щити не витрачаються;
 *  - кожен наступний пропущений день потребує 1 щит: вистачає щитів → серія триває,
 *    інакше скидається до 1 (і щити тоді не згорають).
 * Записи за минулі дати (раніше за останню активність) серію не чіпають.
 * @param {GameState} state @param {string} date @param {GameEvent[]} events
 */
export function registerActivity(state, date, events) {
  const last = state.lastActiveDate
  if (last && date <= last) return

  if (!last) {
    state.streak = 1
  } else {
    const missed = dayDiff(last, date) - 1
    const shieldsNeeded = Math.max(0, missed - STREAK_GRACE_DAYS)
    if (missed <= 0) {
      state.streak += 1
    } else if (state.shields >= shieldsNeeded) {
      state.shields -= shieldsNeeded
      state.counters.shieldsUsed += shieldsNeeded
      state.streak += 1
      state.notice = { date, missed, usedShields: shieldsNeeded, streak: state.streak }
      events.push({ type: 'rescue', missed, usedShields: shieldsNeeded, streak: state.streak })
    } else {
      state.streak = 1
      state.streakWeeksPaid = 0
      // «Незламний»: повернувся й записав їжу після скидання серії
      state.counters.comebacks++
      events.push({ type: 'streakReset' })
    }
  }

  // «Залізні вихідні»: неділі поспіль із записами
  if (isSunday(date)) {
    const prev = state.lastSundayDate
    state.counters.sundayStreak = prev && dayDiff(prev, date) === 7 ? state.counters.sundayStreak + 1 : 1
    state.counters.bestSundayStreak = Math.max(state.counters.bestSundayStreak, state.counters.sundayStreak)
    state.lastSundayDate = date
  }

  state.lastActiveDate = date
  state.bestStreak = Math.max(state.bestStreak, state.streak)
  events.push({ type: 'streak', streak: state.streak })

  // +100 монет за кожні 7 днів безперервної серії
  const weeks = Math.floor(state.streak / 7)
  while (state.streakWeeksPaid < weeks) {
    state.streakWeeksPaid++
    grant(state, REWARDS.streakWeek, 'streakWeek', `${state.streakWeeksPaid * 7} днів поспіль`, events)
  }
}

// ─── Нагороди за день ────────────────────────────────────────────────────────

/** @param {number} value @param {number} goal @param {number} tolerance */
export const withinGoal = (value, goal, tolerance) => goal > 0 && Math.abs(value - goal) <= goal * tolerance

/**
 * @typedef {{
 *   date: string,
 *   isNewEntry: boolean,
 *   meals: ReadonlySet<MealType>,
 *   totals: Nutrients,
 *   goals: Goals,
 *   entry?: Pick<Entry, 'meal' | 'createdAt'>,
 *   tzOffset?: number,
 *   weightEdited?: boolean,
 *   copiedFromYesterday?: boolean,
 * }} DayContext
 */

/** @param {GameState} state @param {DayContext} ctx @param {GameEvent[]} events */
export function applyDayProgress(state, ctx, events) {
  const day = (state.days[ctx.date] ??= newDayAwards())
  const c = state.counters
  const { totals, goals } = ctx

  if (ctx.isNewEntry && day.entries < MAX_ENTRIES_COUNTED_PER_DAY) {
    day.entries++
    state.entriesLogged++
  }

  for (const meal of MEAL_TYPES) {
    if (ctx.meals.has(meal) && !day.meals.includes(meal)) {
      day.meals.push(meal)
      grant(state, REWARDS.meal, 'meal', MEAL_LABELS[meal], events)
    }
  }

  if (!day.protein && withinGoal(totals.protein, goals.protein, PROTEIN_TOLERANCE)) {
    day.protein = true
    grant(state, REWARDS.protein, 'protein', 'Норма білка', events)
    // серія днів у нормі білка (для ачівок)
    const prev = state.lastProteinDate
    if (prev && ctx.date < prev) {
      // дописали вчорашній день уже після сьогоднішнього — подовжуємо серію, якщо дні сусідні
      if (dayDiff(ctx.date, prev) === 1) state.proteinStreak++
    } else if (prev !== ctx.date) {
      state.proteinStreak = prev && dayDiff(prev, ctx.date) === 1 ? state.proteinStreak + 1 : 1
      state.lastProteinDate = ctx.date
    }
    state.bestProteinStreak = Math.max(state.bestProteinStreak, state.proteinStreak)
  }

  if (!day.kcal && withinGoal(totals.kcal, goals.kcal, KCAL_TOLERANCE)) {
    day.kcal = true
    grant(state, REWARDS.kcal, 'kcal', 'Денна норма калорій', events)
  }

  // ── Лічильники для ачівок (кожен — не більше разу на день) ──
  if (!day.full && day.meals.length === MEAL_TYPES.length) {
    day.full = true
    c.fullSlotsDays++
  }
  if (!day.exact && goals.kcal > 0 && Math.abs(totals.kcal - goals.kcal) <= EXACT_KCAL) {
    day.exact = true
    c.exactCalorieDays++
  }
  const carbsOk = withinGoal(totals.carbs, goals.carbs, MACRO_TOLERANCE)
  const fatOk = withinGoal(totals.fat, goals.fat, MACRO_TOLERANCE)
  if (!day.carbs && carbsOk) {
    day.carbs = true
    c.carbsDays++
  }
  if (!day.fat && fatOk) {
    day.fat = true
    c.fatDays++
  }
  if (!day.perfect && carbsOk && fatOk && withinGoal(totals.protein, goals.protein, MACRO_TOLERANCE)) {
    day.perfect = true
    c.perfectMacroDays++
  }

  // Сумарні калорії: лише приріст понад уже зарахований максимум дня
  const countable = Math.min(totals.kcal, Math.max(goals.kcal * 2, DAILY_KCAL_CAP))
  if (countable > day.kcalCounted) {
    c.totalCalories += Math.round(countable) - Math.round(day.kcalCounted)
    day.kcalCounted = countable
  }

  // Рання пташка / нічний дожор — за місцевим часом нового запису
  if (ctx.isNewEntry && ctx.entry) {
    const hour = localHour(ctx.entry.createdAt, ctx.tzOffset ?? 0)
    if (!day.early && ctx.entry.meal === 'breakfast' && hour < EARLY_BREAKFAST_HOUR) {
      day.early = true
      c.earlyBreakfasts++
    }
    if (!day.late && ctx.entry.meal === 'snack' && hour >= LATE_SNACK_HOUR) {
      day.late = true
      c.lateSnacks++
    }
  }

  if (ctx.weightEdited && day.edits < MAX_EDITS_COUNTED_PER_DAY) {
    day.edits++
    c.editWeight++
  }

  // одне натискання «Скопіювати з учора» (навіть якщо скопійовано кілька страв)
  if (ctx.isNewEntry && ctx.copiedFromYesterday && day.copies < MAX_COPIES_COUNTED_PER_DAY) {
    day.copies++
    c.copyYesterday++
  }
}

/**
 * Головна точка входу: запис їжі збережено.
 * @param {GameState} state
 * @param {DayContext} ctx
 * @param {number} [now]
 * @returns {GameEvent[]}
 */
export function onEntrySaved(state, ctx, now = Date.now()) {
  /** @type {GameEvent[]} */
  const events = []
  if (!isNearToday(ctx.date, now, ctx.tzOffset ?? 0)) return events

  registerActivity(state, ctx.date, events)
  applyDayProgress(state, ctx, events)

  // старі прапорці більше не потрібні — нагороди лише за «сьогодні ± 1»
  const oldest = keyOf(now - KEEP_DAYS * 86_400_000)
  for (const key of Object.keys(state.days)) if (key < oldest) delete state.days[key]

  state.updatedAt = now
  return events
}
