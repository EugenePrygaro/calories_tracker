/**
 * Ачівки: каталог, прогрес і отримання нагороди.
 * Прогрес рахується з показників гравця (shared/game.js → counters); нагороду видає
 * сервер (api/game.js → claim), попередньо перевіривши, що мету справді досягнуто
 * і нагороду ще не забирали.
 */
import { grant } from './game.js'

/** @typedef {import('./game.js').GameState} GameState */
/** @typedef {import('./game.js').GameEvent} GameEvent */

/**
 * Показники, з яких рахується прогрес.
 * @typedef {{
 *   entriesLogged: number,
 *   bestStreak: number,
 *   bestProteinStreak: number,
 *   ownFoods: number,
 *   recipesCreated: number,
 *   exactCalorieDays: number,
 *   perfectMacroDays: number,
 *   earlyBreakfasts: number,
 *   lateSnacks: number,
 *   fullSlotsDays: number,
 *   copyYesterday: number,
 *   editWeight: number,
 *   shopPurchases: number,
 *   maxCoins: number,
 *   maxShieldsHeld: number,
 *   shieldsUsed: number,
 *   carbsDays: number,
 *   fatDays: number,
 *   bestSundayStreak: number,
 *   totalCalories: number,
 *   comebacks: number,
 * }} AchievementStats
 */

/** Категорія — розділ у вітрині. @typedef {'diary' | 'streak' | 'nutrition' | 'kitchen' | 'economy'} AchievementGroup */
/** @typedef {'bronze' | 'silver' | 'gold' | 'diamond'} AchievementTier */

/**
 * @typedef {{
 *   id: string,
 *   group: AchievementGroup,
 *   series: string,
 *   tier: AchievementTier,
 *   title: string,
 *   description: string,
 *   goal: number,
 *   stat: keyof AchievementStats,
 *   reward: number,
 *   icon: string,
 * }} Achievement
 */

/**
 * Нагорода = складність ачівки, виражена в калокоїнах:
 *   зусилля (скільки днів звичайного ведення щоденника потрібно)
 *   × вимогливість (1 — просто робити; 1,3–2,5 — влучати в норму / не пропускати жодного дня)
 *   × COINS_PER_EFFORT_DAY.
 * 10 калокоїнів за день зусилля ≈ 20% щоденного максимуму (60) — ачівки помітні, але не замінюють
 * щоденну гру. Округлення: до 5, від 100 — до 10; мінімум 10.
 */
export const COINS_PER_EFFORT_DAY = 10

/** @param {number} effort дні @param {number} skill множник вимогливості */
export function rewardFor(effort, skill) {
  const raw = effort * skill * COINS_PER_EFFORT_DAY
  const step = raw >= 100 ? 10 : 5
  return Math.max(10, Math.round(raw / step) * step)
}

/**
 * @param {string} id @param {AchievementGroup} group @param {string} series @param {AchievementTier} tier
 * @param {string} title @param {string} description @param {keyof AchievementStats} stat @param {number} goal
 * @param {string} icon @param {number} effort оцінка зусилля в днях @param {number} [skill] вимогливість
 * @returns {Achievement}
 */
const a = (id, group, series, tier, title, description, stat, goal, icon, effort, skill = 1) => ({
  id, group, series, tier, title, description, stat, goal, reward: rewardFor(effort, skill), icon,
})

/** Порядок: категорія → серія → мета. Назви іконок — з lucide-react (див. src/features/game/achievementStyle.ts). */
/** @type {readonly Achievement[]} */
export const ACHIEVEMENTS = [
  // ── Щоденник ──
  a('first_step', 'diary', 'first_step', 'bronze', 'Перший крок', 'Залогувати першу страву в щоденник', 'entriesLogged', 1, 'Footprints', 0.5),
  a('meals-10', 'diary', 'meals', 'bronze', 'Розминка', 'Залогувати 10 страв', 'entriesLogged', 10, 'NotebookPen', 2),
  a('meals-50', 'diary', 'meals', 'silver', 'Щоденник у формі', 'Залогувати 50 страв', 'entriesLogged', 50, 'NotebookPen', 10),
  a('meals-200', 'diary', 'meals', 'gold', 'Майстер обліку', 'Залогувати 200 страв', 'entriesLogged', 200, 'NotebookPen', 40),
  a('full_set_1', 'diary', 'full_set', 'bronze', 'Повний комплект I', 'Заповнити всі 4 слоти прийомів їжі за 1 день', 'fullSlotsDays', 1, 'Grid2x2Check', 1, 1.5),
  a('full_set_2', 'diary', 'full_set', 'silver', 'Повний комплект II', 'Заповнити всі 4 слоти прийомів їжі протягом 5 днів', 'fullSlotsDays', 5, 'Grid2x2Check', 6, 1.5),
  a('full_set_3', 'diary', 'full_set', 'gold', 'Повний комплект III', 'Заповнити всі 4 слоти прийомів їжі протягом 7 днів', 'fullSlotsDays', 7, 'Grid2x2Check', 8, 1.5),
  a('early_bird', 'diary', 'early_bird', 'bronze', 'Рання пташка', 'Записати сніданок до 10:00 ранку 5 разів', 'earlyBreakfasts', 5, 'Sunrise', 6, 1.2),
  a('night_snack', 'diary', 'night_snack', 'bronze', 'Нічний дожор', 'Залогувати перекус після 22:00', 'lateSnacks', 1, 'MoonStar', 1),
  a('jewelry_precision', 'diary', 'jewelry_precision', 'bronze', 'Ювелірна точність', 'Відредагувати вагу вже доданої страви 3 рази', 'editWeight', 3, 'SlidersHorizontal', 1),
  a('groundhog_day', 'diary', 'groundhog_day', 'bronze', 'День бабака', 'Скористатися кнопкою «Скопіювати з учора» 5 разів', 'copyYesterday', 5, 'CopyCheck', 2),
  a('heavy_artillery_1', 'diary', 'heavy_artillery', 'bronze', 'Важка артилерія I', 'Сумарно залогувати 10 000 ккал за весь час', 'totalCalories', 10000, 'Dumbbell', 5),
  a('heavy_artillery_2', 'diary', 'heavy_artillery', 'silver', 'Важка артилерія II', 'Сумарно залогувати 20 000 ккал за весь час', 'totalCalories', 20000, 'Dumbbell', 10),
  a('heavy_artillery_3', 'diary', 'heavy_artillery', 'gold', 'Важка артилерія III', 'Сумарно залогувати 50 000 ккал за весь час', 'totalCalories', 50000, 'Dumbbell', 25),

  // ── Серії ──
  a('on_fire_1', 'streak', 'on_fire', 'bronze', 'На вогні I', 'Утримати стрік 7 днів поспіль', 'bestStreak', 7, 'Flame', 7, 1.3),
  a('on_fire_2', 'streak', 'on_fire', 'silver', 'На вогні II', 'Утримати стрік 30 днів поспіль', 'bestStreak', 30, 'Flame', 30, 1.3),
  a('on_fire_3', 'streak', 'on_fire', 'diamond', 'На вогні III', 'Утримати стрік 100 днів поспіль', 'bestStreak', 100, 'Flame', 100, 1.3),
  a('iron_weekends_1', 'streak', 'iron_weekends', 'bronze', 'Залізні вихідні I', 'Вести щоденник 1 неділю без пропуску', 'bestSundayStreak', 1, 'CalendarCheck', 4),
  a('iron_weekends_2', 'streak', 'iron_weekends', 'silver', 'Залізні вихідні II', 'Вести щоденник 2 неділі поспіль без пропусків', 'bestSundayStreak', 2, 'CalendarCheck', 11, 1.1),
  a('iron_weekends_3', 'streak', 'iron_weekends', 'gold', 'Залізні вихідні III', 'Вести щоденник 4 неділі поспіль без пропусків', 'bestSundayStreak', 4, 'CalendarCheck', 25, 1.2),
  a('second_wind', 'streak', 'second_wind', 'silver', 'Друге дихання', 'Врятувати свій стрік за допомогою «Заморозки»', 'shieldsUsed', 1, 'Snowflake', 5),
  a('unbreakable', 'streak', 'unbreakable', 'silver', 'Незламний', 'Повернутися в додаток і залогувати їжу після скидання стріку', 'comebacks', 1, 'HeartPulse', 3),

  // ── Харчування ──
  a('protein-3', 'nutrition', 'protein', 'bronze', 'Білковий старт', 'Закрити норму білка 3 дні поспіль', 'bestProteinStreak', 3, 'Drumstick', 3, 1.5),
  a('protein_beast', 'nutrition', 'protein', 'silver', 'Протеїновий звір', 'Закрити денну норму білка 5 днів поспіль', 'bestProteinStreak', 5, 'Beef', 5, 1.5),
  a('protein-7', 'nutrition', 'protein', 'gold', 'Білковий тиждень', 'Закрити норму білка 7 днів поспіль', 'bestProteinStreak', 7, 'Drumstick', 7, 1.6),
  a('protein-14', 'nutrition', 'protein', 'diamond', 'Білкова машина', 'Закрити норму білка 14 днів поспіль', 'bestProteinStreak', 14, 'Drumstick', 14, 2.5),
  a('carb_fuel', 'nutrition', 'carb_fuel', 'silver', 'Вуглеводне паливо', 'Виконати денну норму вуглеводів (±10%) 10 разів', 'carbsDays', 10, 'BatteryCharging', 12, 1.3),
  a('healthy_fats', 'nutrition', 'healthy_fats', 'silver', 'Корисні жири', 'Утримати норму жирів у межах ±10% протягом 7 днів', 'fatDays', 7, 'Droplets', 9, 1.3),
  a('perfect_balance', 'nutrition', 'perfect_balance', 'gold', 'Ідеальний баланс', 'Влучити в норму всіх трьох макросів (±10%) за один день', 'perfectMacroDays', 1, 'Scale', 6, 2),
  a('deficit_sniper', 'nutrition', 'deficit_sniper', 'gold', 'Снайпер дефіциту', 'Закрити день із точністю до ±10 ккал від цілі', 'exactCalorieDays', 1, 'Crosshair', 6, 2),

  // ── Кухня ──
  a('recipes-1', 'kitchen', 'own_foods', 'bronze', 'Свій рецепт', 'Створити власну страву', 'ownFoods', 1, 'CookingPot', 0.5),
  a('recipes-5', 'kitchen', 'own_foods', 'silver', 'Домашній кухар', 'Створити 5 власних страв', 'ownFoods', 5, 'CookingPot', 2),
  a('flavor_collector_1', 'kitchen', 'flavor_collector', 'bronze', 'Колекціонер смаків I', 'Зберегти 10 власних продуктів у локальний каталог', 'ownFoods', 10, 'BookHeart', 4),
  a('flavor_collector_2', 'kitchen', 'flavor_collector', 'silver', 'Колекціонер смаків II', 'Зберегти 15 власних продуктів у локальний каталог', 'ownFoods', 15, 'BookHeart', 6),
  a('flavor_collector_3', 'kitchen', 'flavor_collector', 'gold', 'Колекціонер смаків III', 'Зберегти 25 власних продуктів у локальний каталог', 'ownFoods', 25, 'BookHeart', 10),
  a('master_chef', 'kitchen', 'master_chef', 'silver', 'Шеф-кухар', 'Створити 3 власні складні рецепти', 'recipesCreated', 3, 'ChefHat', 3, 1.5),

  // ── Калокоїни й інвентар ──
  a('first_shopping', 'economy', 'first_shopping', 'bronze', 'Перший шопінг', 'Зробити першу покупку в магазині додатку', 'shopPurchases', 1, 'ShoppingBag', 3),
  a('piggy_bank', 'economy', 'piggy_bank', 'gold', 'Скарбничка', 'Накопичити на балансі 1 000 калокоїнів одночасно', 'maxCoins', 1000, 'PiggyBank', 17, 1.2),
  a('streak_armor', 'economy', 'streak_armor', 'silver', 'Броня від зривів', 'Тримати в інвентарі максимум заморозок стріку (2 шт.)', 'maxShieldsHeld', 2, 'ShieldPlus', 5),
]

/** Старі id → нові (ачівки, що злилися з новим каталогом). Застосовується до claimed/seen/devUnlocked. */
export const ID_ALIASES = /** @type {Readonly<Record<string, string>>} */ ({
  'streak-7': 'on_fire_1',
  'streak-30': 'on_fire_2',
  'streak-100': 'on_fire_3',
})

/** @param {GameState} state @param {number} ownFoods @returns {AchievementStats} */
export function statsOf(state, ownFoods) {
  const c = state.counters
  return {
    entriesLogged: state.entriesLogged,
    bestStreak: state.bestStreak,
    bestProteinStreak: state.bestProteinStreak,
    ownFoods,
    recipesCreated: c.recipesCreated,
    exactCalorieDays: c.exactCalorieDays,
    perfectMacroDays: c.perfectMacroDays,
    earlyBreakfasts: c.earlyBreakfasts,
    lateSnacks: c.lateSnacks,
    fullSlotsDays: c.fullSlotsDays,
    copyYesterday: c.copyYesterday,
    editWeight: c.editWeight,
    shopPurchases: c.shopPurchases,
    maxCoins: c.maxCoins,
    maxShieldsHeld: c.maxShieldsHeld,
    shieldsUsed: c.shieldsUsed,
    carbsDays: c.carbsDays,
    fatDays: c.fatDays,
    bestSundayStreak: c.bestSundayStreak,
    totalCalories: c.totalCalories,
    comebacks: c.comebacks,
  }
}

/**
 * @param {Achievement} a @param {AchievementStats} stats @param {GameState} state
 * @returns {{ current: number, goal: number, reached: boolean, claimed: boolean }}
 */
export function achievementProgress(a, stats, state) {
  // devUnlocked — ачівку видано з dev-панелі для тестування
  const current = a.id in state.devUnlocked ? a.goal : Math.min(stats[a.stat], a.goal)
  return { current, goal: a.goal, reached: current >= a.goal, claimed: a.id in state.claimed }
}

/**
 * Щойно досягнуті ачівки: мету досягнуто, нагороду не забрано, модалку ще не показували.
 * @param {GameState} state @param {AchievementStats} stats @returns {Achievement[]}
 */
export function newlyUnlocked(state, stats) {
  return ACHIEVEMENTS.filter((x) => {
    const p = achievementProgress(x, stats, state)
    return p.reached && !p.claimed && !(x.id in state.seen)
  })
}

export const isAchievementId = (/** @type {unknown} */ id) => typeof id === 'string' && ACHIEVEMENTS.some((x) => x.id === id)

export class ClaimError extends Error {
  /** @param {'unknown' | 'not_reached' | 'already_claimed'} code */
  constructor(code) {
    super(code)
    this.code = code
  }
}

/**
 * Забрати нагороду за ачівку.
 * @param {GameState} state @param {string} id @param {AchievementStats} stats @param {number} [now]
 * @returns {GameEvent[]}
 */
export function claimAchievement(state, id, stats, now = Date.now()) {
  const found = ACHIEVEMENTS.find((x) => x.id === id)
  if (!found) throw new ClaimError('unknown')
  const p = achievementProgress(found, stats, state)
  if (p.claimed) throw new ClaimError('already_claimed')
  if (!p.reached) throw new ClaimError('not_reached')

  /** @type {GameEvent[]} */
  const events = []
  state.claimed[id] = now
  state.seen[id] ??= now
  grant(state, found.reward, 'achievement', found.title, events)
  state.updatedAt = now
  return events
}
