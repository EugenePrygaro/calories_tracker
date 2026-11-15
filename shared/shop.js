/**
 * Магазин: каталог товарів за калокоїни і чиста логіка покупки й використання.
 * Сервер (api/game.js) застосовує її до стану гри, клієнт лише показує каталог і стан.
 *
 * Куплене лягає в інвентар (GameState.inventory, заморозки — у shields) і
 * використовується окремою дією, коли треба. Розширення слотів діє одразу й назавжди.
 * Теми купуються раз і назавжди (GameState.themes), активна — GameState.activeTheme.
 */
import { BASE_SHIELD_SLOTS, REWARDS, grant, localToday, newDayAwards, payStreakWeeks, trackHoldings } from './game.js'

/** @typedef {import('./game.js').GameState} GameState */
/** @typedef {import('./game.js').GameEvent} GameEvent */

/** @typedef {'boosters' | 'holiday' | 'styles' | 'marketplace'} ShopCategory */
/** Теми оформлення: святкові та естетичні стилі (кольори, ефекти, а в стилів — і шрифт). */
/** @typedef {'newyear' | 'halloween' | 'spring' | 'valentine' | 'crimson' | 'synthwave' | 'obsidian' | 'amethyst' | 'espresso' | 'rainbow' | 'orbital'} ThemeId */
/** @typedef {'shield' | 'cheatMeal' | 'boost' | 'superFlame' | 'shieldSlot' | 'temu' | ThemeId} ShopItemId */
/** Товари, що лежать в інвентарі й використовуються окремою дією. */
/** @typedef {'cheatMeal' | 'boost' | 'superFlame' | 'temu'} UsableItemId */
/** @typedef {'unknown' | 'not_enough_coins' | 'inventory_full' | 'max_level' | 'none_left' | 'already_active' | 'kcal_done' | 'nothing_to_restore' | 'already_owned' | 'not_owned' | 'not_enough_styles'} ShopErrorCode */

/**
 * @typedef {{
 *   id: ShopItemId,
 *   category: ShopCategory,
 *   title: string,
 *   desc: string,
 *   icon: string,
 * }} ShopItem
 */

/** @type {readonly { id: ShopCategory, title: string }[]} */
export const SHOP_CATEGORIES = [
  { id: 'boosters', title: 'Бустери' },
  { id: 'holiday', title: 'Святкові теми' },
  { id: 'styles', title: 'Естетичні стилі' },
  { id: 'marketplace', title: 'Маркетплейс' },
]

/** @type {readonly ThemeId[]} */
export const THEME_IDS = ['newyear', 'halloween', 'spring', 'valentine', 'crimson', 'synthwave', 'obsidian', 'amethyst', 'espresso', 'rainbow', 'orbital']
/** Тема за замовчуванням («Смарагдовий графіт») — безкоштовна й завжди доступна. */
export const DEFAULT_THEME = 'default'
/** Не тема, а режим: щодня випадковий естетичний стиль із куплених (див. dailyStyle). */
export const RANDOM_THEME = 'random'

/** @type {readonly ShopItem[]} */
export const SHOP_ITEMS = [
  {
    id: 'shield',
    category: 'boosters',
    title: 'Заморозка',
    desc: 'Автоматично зберігає серію днів, якщо пропустив запис їжі.',
    icon: 'Snowflake',
  },
  {
    id: 'cheatMeal',
    category: 'boosters',
    title: 'Читміл-квиток',
    desc: 'Разовий жетон на свято: можна перевищити денну норму калорій, а день усе одно зарахується як успішний — для нагороди, статистики й ачівок.',
    icon: 'Ticket',
  },
  {
    id: 'boost',
    category: 'boosters',
    title: 'Бустер ×2',
    desc: 'Подвоює всі калокоїни за прийоми їжі та закриття норм до кінця поточної доби.',
    icon: 'Zap',
  },
  {
    id: 'superFlame',
    category: 'boosters',
    title: 'Супер вогник',
    desc: 'Повертає втрачену серію, якщо заморозки не вистачило, — скільки б днів не пропустив. В інвентарі — не більше одного.',
    icon: 'FlameKindling',
  },
  {
    id: 'shieldSlot',
    category: 'boosters',
    title: 'Розширення інвентарю',
    desc: 'Назавжди збільшує запас заморозок серії: з 2 до 3, а потім до 4.',
    icon: 'PackagePlus',
  },
  {
    id: 'newyear',
    category: 'holiday',
    title: 'Новорічна',
    desc: 'Морозна синя гама, крижані рамки й сніг, що падає на фоні.',
    icon: 'TreePine',
  },
  {
    id: 'halloween',
    category: 'holiday',
    title: 'Геловінська',
    desc: 'Гарбузовий неон на глибокому фіолетовому.',
    icon: 'Ghost',
  },
  {
    id: 'spring',
    category: 'holiday',
    title: 'Весняна',
    desc: 'Теплі пастельні акценти й пелюстки, що кружляють на фоні.',
    icon: 'Flower2',
  },
  {
    id: 'valentine',
    category: 'holiday',
    title: 'День закоханих',
    desc: 'Рожево-червона гама й сердечка, що здіймаються на фоні.',
    icon: 'Heart',
  },
  {
    id: 'crimson',
    category: 'styles',
    title: 'Багряна класика',
    desc: 'Насичений червоний на глибокому темному, тонкі золоті лінії й м’яка віньєтка.',
    icon: 'Gem',
  },
  {
    id: 'synthwave',
    category: 'styles',
    title: 'Synthwave / 8-біт',
    desc: 'Неоновий рожевий і бірюзовий, футуристичний шрифт, сітка-горизонт і ефект старого екрана.',
    icon: 'Gamepad2',
  },
  {
    id: 'obsidian',
    category: 'styles',
    title: 'Чорне золото',
    desc: 'Obsidian Gold: глибокий вугільно-чорний фон, матові картки з тонкими золотими контурами, теплі акценти шампань і золотий пил, що повільно здіймається.',
    icon: 'Crown',
  },
  {
    id: 'amethyst',
    category: 'styles',
    title: 'Королівський аметист',
    desc: 'Royal Amethyst: темно-індигові картки, світні лавандові й фіолетові акценти, делікатний фіолетовий градієнт на тлі й мерехтливі зорі.',
    icon: 'Diamond',
  },
  {
    id: 'espresso',
    category: 'styles',
    title: 'Еспресо',
    desc: 'Espresso: насичені темно-кавові й бронзові поверхні, бурштинове й мідне підсвічування, пара над «чашкою», кавові зерна й крема на весь екран.',
    icon: 'Coffee',
  },
  {
    id: 'rainbow',
    category: 'styles',
    title: 'Райдужна',
    desc: 'Усе в кольорах веселки й переливається: райдужні смуги й кнопки, контури карток, що змінюють барви, і північне сяйво на фоні.',
    icon: 'Rainbow',
  },
  {
    id: 'orbital',
    category: 'styles',
    title: 'Орбітальна',
    desc: 'Бортовий комп’ютер космічного корабля: глибокий темно-синій космос, орбітальні кільця калорій, координатна сітка й крижано-блакитні акценти.',
    icon: 'Orbit',
  },
  {
    id: 'temu',
    category: 'marketplace',
    title: 'Фігня з Temu',
    desc: 'Вкрай необхідна річ. Потрібніша за заморозки й навіть за врятування серії. У трекері не робить абсолютно нічого — використаєш, і вона зникне.',
    icon: 'Package',
  },
]

/**
 * Ціни в калокоїнах. Орієнтир — до 60 за день ідеальної гри (+100 за тиждень серії):
 * заморозка ≈ 2,5 дня, читміл ≈ 3 дні, супер вогник ≈ 6 днів;
 * бустер: звичайний день (≈ 40–45 за їжу й норми) він лише окуповує, вигідний —
 * коли плануєте закрити все (+60 зверху). Інакше його вигідно було б купувати щодня.
 */
export const PRICES = {
  shield: 150,
  cheatMeal: 180,
  boost: 50,
  superFlame: 350,
  /** ≈ тиждень серії: 7 × 60 + 100 за тиждень */
  temu: 520,
}
/** Ціна кожного наступного слота заморозки: 3-й, 4-й. */
export const SLOT_PRICES = [400, 800]
export const MAX_SHIELD_SLOTS = BASE_SHIELD_SLOTS + SLOT_PRICES.length
/** Тема — «середня» покупка: приблизно 10 днів серії (10 × 60 + тижневий бонус ≈ 700). */
export const THEME_PRICE = 600
/** Скільки днів із читмілом пам'ятаємо для статистики (з запасом на роки). */
export const MAX_CHEAT_DAYS = 400
/** Скільки однакових товарів можна тримати в інвентарі. */
export const MAX_STACK = 9

export class ShopError extends Error {
  /** @param {ShopErrorCode} code */
  constructor(code) {
    super(code)
    this.code = code
  }
}

/** @param {unknown} id @returns {id is ShopItemId} */
export const isShopItemId = (id) => typeof id === 'string' && SHOP_ITEMS.some((x) => x.id === id)
/** @param {unknown} id @returns {id is UsableItemId} */
export const isUsableItemId = (id) => id === 'cheatMeal' || id === 'boost' || id === 'superFlame' || id === 'temu'
/** @param {unknown} id @returns {id is ThemeId} */
export const isThemeId = (id) => typeof id === 'string' && /** @type {readonly string[]} */ (THEME_IDS).includes(id)

/**
 * Ціна товару зараз; null — купити вже неможливо (досягнуто максимуму).
 * @param {ShopItemId} id @param {GameState} state @returns {number | null}
 */
export function priceOf(id, state) {
  if (id === 'shieldSlot') return SLOT_PRICES[state.shieldSlots - BASE_SHIELD_SLOTS] ?? null
  if (isThemeId(id)) return THEME_PRICE
  return PRICES[id]
}

/** Скільки цього товару є. @param {ShopItemId} id @param {GameState} state */
export function ownedOf(id, state) {
  if (id === 'shield') return state.shields
  if (id === 'shieldSlot') return state.shieldSlots
  if (isThemeId(id)) return id in state.themes ? 1 : 0
  return state.inventory[id]
}

/** Ліміт: заморозки — за слотами, розширення — максимум слотів, супер вогник — 1, інше — MAX_STACK. @param {ShopItemId} id @param {GameState} state */
export function capOf(id, state) {
  if (id === 'shield') return state.shieldSlots
  if (id === 'shieldSlot') return MAX_SHIELD_SLOTS
  if (isThemeId(id) || id === 'superFlame') return 1
  return MAX_STACK
}

/**
 * Чому товар зараз не можна купити (null — можна). Спільне для сервера й кнопки в магазині.
 * @param {ShopItemId} id @param {GameState} state @returns {ShopErrorCode | null}
 */
export function buyBlocker(id, state) {
  if (isThemeId(id) && id in state.themes) return 'already_owned'
  const price = priceOf(id, state)
  if (price === null) return 'max_level'
  if (ownedOf(id, state) >= capOf(id, state)) return 'inventory_full'
  if (state.coins < price) return 'not_enough_coins'
  return null
}

/**
 * Чому товар зараз не можна використати (null — можна).
 * @param {UsableItemId} id @param {GameState} state @param {string} today місцева дата YYYY-MM-DD
 * @returns {ShopErrorCode | null}
 */
export function consumeBlocker(id, state, today) {
  if (state.inventory[id] <= 0) return 'none_left'
  if (id === 'boost') return state.boostDate === today ? 'already_active' : null
  if (id === 'cheatMeal') {
    const day = state.days[today]
    if (day?.cheat) return 'already_active'
    if (day?.kcal) return 'kcal_done' // день уже успішний — квиток нічого не дасть
    return null
  }
  if (id === 'temu') return null
  // супер вогник: повертає обірвану серію коли завгодно — скільки б днів не минуло
  return state.lostStreak ? null : 'nothing_to_restore'
}

/**
 * Купити товар.
 * @param {GameState} state @param {unknown} id @param {number} [now]
 * @returns {GameEvent[]}
 */
export function buyItem(state, id, now = Date.now()) {
  if (!isShopItemId(id)) throw new ShopError('unknown')
  const blocker = buyBlocker(id, state)
  if (blocker) throw new ShopError(blocker)
  const item = /** @type {ShopItem} */ (SHOP_ITEMS.find((x) => x.id === id))

  /** @type {GameEvent[]} */
  const events = []
  grant(state, -(/** @type {number} */ (priceOf(id, state))), 'shop', item.title, events)
  if (id === 'shield') state.shields++
  else if (id === 'shieldSlot') state.shieldSlots++
  else if (isThemeId(id)) {
    // нову тему одразу вмикаємо — це те, заради чого її купили
    state.themes[id] = now
    state.activeTheme = id
    events.push({ type: 'notice', label: `Тему «${item.title}» увімкнено` })
  } else state.inventory[id]++
  state.counters.shopPurchases++
  trackHoldings(state)
  state.updatedAt = now
  return events
}

/**
 * Використати товар з інвентарю.
 * @param {GameState} state @param {unknown} id @param {number} [now] @param {number} [tzOffset]
 * @returns {GameEvent[]}
 */
export function consumeItem(state, id, now = Date.now(), tzOffset = 0) {
  if (!isUsableItemId(id)) throw new ShopError('unknown')
  const today = localToday(now, tzOffset)
  const blocker = consumeBlocker(id, state, today)
  if (blocker) throw new ShopError(blocker)

  /** @type {GameEvent[]} */
  const events = []
  state.inventory[id]--

  if (id === 'boost') {
    state.boostDate = today
    events.push({ type: 'notice', label: 'Бустер ×2 діє до кінця дня' })
  } else if (id === 'cheatMeal') {
    // День одразу зараховується як успішний: прапорець калоражу стоїть,
    // тож перебір норми вже нічого не забере
    const day = (state.days[today] ??= newDayAwards())
    day.cheat = true
    day.kcal = true
    // назавжди (прапорці днів тримаються лише тиждень) — для статистики й теплової карти
    if (!state.cheatDays.includes(today)) state.cheatDays = [...state.cheatDays, today].slice(-MAX_CHEAT_DAYS)
    const coins = state.boostDate === today ? REWARDS.kcal * 2 : REWARDS.kcal
    grant(state, coins, 'kcal', 'Читміл: день зараховано', events)
  } else if (id === 'temu') {
    events.push({ type: 'notice', label: 'Розпаковано… і вже зламалося' })
  } else {
    // Повертаємо обірвану серію: дні після обриву йдуть поспіль, тож просто додаємо
    const lost = /** @type {import('./game.js').LostStreak} */ (state.lostStreak)
    state.streak += lost.value
    state.streakWeeksPaid = Math.max(state.streakWeeksPaid, lost.weeksPaid)
    state.bestStreak = Math.max(state.bestStreak, state.streak)
    state.lostStreak = null
    events.push({ type: 'notice', label: 'Серію повернуто' }, { type: 'streak', streak: state.streak })
    payStreakWeeks(state, events)
  }
  state.updatedAt = now
  return events
}

/**
 * Увімкнути тему: стандартну або куплену.
 * @param {GameState} state @param {unknown} id @param {number} [now]
 */
export function setTheme(state, id, now = Date.now()) {
  if (id === RANDOM_THEME) {
    // випадковий стиль має сенс, коли є з чого обирати
    if (ownedStyles(state).length < 2) throw new ShopError('not_enough_styles')
    state.dailyRandomTheme = true
    state.updatedAt = now
    return
  }
  if (id !== DEFAULT_THEME && !isThemeId(id)) throw new ShopError('unknown')
  if (isThemeId(id) && !(id in state.themes)) throw new ShopError('not_owned')
  state.activeTheme = /** @type {ThemeId | 'default'} */ (id)
  state.dailyRandomTheme = false
  state.updatedAt = now
}

/** Естетичні стилі (без святкових тем) — з них обирається «стиль дня». */
export const STYLE_THEME_IDS = /** @type {ThemeId[]} */ (SHOP_ITEMS.filter((x) => x.category === 'styles').map((x) => x.id))

/** Куплені естетичні стилі. @param {GameState} state */
export const ownedStyles = (state) => STYLE_THEME_IDS.filter((id) => id in state.themes)

/** Детермінований номер від рядка — однаковий на всіх пристроях і без запитів. @param {string} s */
function hash(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

/**
 * «Стиль дня»: випадковий із куплених естетичних стилів, але стабільний протягом дня
 * (залежить лише від дати) і, якщо стилів кілька, — не той самий, що вчора.
 * @param {GameState} state @param {string} date YYYY-MM-DD @returns {string}
 */
export function dailyStyle(state, date) {
  const owned = ownedStyles(state)
  if (owned.length === 0) return state.activeTheme
  const pick = (/** @type {string} */ d) => hash(d) % owned.length
  let i = pick(date)
  const y = new Date(`${date}T00:00:00Z`)
  y.setUTCDate(y.getUTCDate() - 1)
  if (owned.length > 1 && i === pick(y.toISOString().slice(0, 10))) i = (i + 1) % owned.length
  return /** @type {string} */ (owned[i])
}

/** Яка тема зараз на екрані: вибрана або «стиль дня». @param {GameState} state @param {string} date */
export const displayedTheme = (state, date) => (state.dailyRandomTheme ? dailyStyle(state, date) : state.activeTheme)
