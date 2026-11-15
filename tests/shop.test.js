import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newGameState, onEntrySaved, registerActivity } from '../shared/game.js'
import { MAX_SHIELD_SLOTS, PRICES, SLOT_PRICES, ShopError, buyItem, consumeItem } from '../shared/shop.js'
import { sanitizeGame } from '../server/game.js'

const NOW = Date.UTC(2026, 10, 14, 12) // «сьогодні» = 2026-11-14
const TODAY = '2026-11-14'
const GOALS = { kcal: 2000, protein: 120, fat: 70, carbs: 220 }
const ZERO = { kcal: 0, protein: 0, fat: 0, carbs: 0 }

const rich = (coins = 5000) => Object.assign(newGameState(), { coins })
/** @param {() => unknown} fn @param {string} code */
const throwsCode = (fn, code) => assert.throws(fn, (e) => e instanceof ShopError && e.code === code)

test('покупка списує калокоїни, кладе товар в інвентар і рахується для «Першого шопінгу»', () => {
  const s = rich(200)
  const events = buyItem(s, 'boost', NOW)
  assert.equal(s.coins, 200 - PRICES.boost)
  assert.equal(s.inventory.boost, 1)
  assert.equal(s.counters.shopPurchases, 1)
  assert.deepEqual(events, [{ type: 'reward', reason: 'shop', coins: -PRICES.boost, label: 'Бустер ×2' }])
})

test('не вистачає калокоїнів / невідомий товар — покупки немає', () => {
  const s = rich(10)
  throwsCode(() => buyItem(s, 'shield', NOW), 'not_enough_coins')
  throwsCode(() => buyItem(s, 'nope', NOW), 'unknown')
  assert.equal(s.coins, 10)
  assert.equal(s.counters.shopPurchases, 0)
})

test('заморозки обмежені слотами; розширення додає слот до максимуму 4 за зростаючою ціною', () => {
  const s = rich()
  buyItem(s, 'shield', NOW)
  buyItem(s, 'shield', NOW)
  throwsCode(() => buyItem(s, 'shield', NOW), 'inventory_full')
  assert.equal(s.counters.maxShieldsHeld, 2) // «Броня від зривів»

  const before = s.coins
  buyItem(s, 'shieldSlot', NOW)
  buyItem(s, 'shieldSlot', NOW)
  assert.equal(before - s.coins, SLOT_PRICES[0] + SLOT_PRICES[1])
  assert.equal(s.shieldSlots, MAX_SHIELD_SLOTS)
  throwsCode(() => buyItem(s, 'shieldSlot', NOW), 'max_level')
  buyItem(s, 'shield', NOW)
  assert.equal(s.shields, 3)
})

test('бустер ×2 подвоює нагороди за їжу й норми лише сьогодні; вдруге за день не активується', () => {
  const s = rich(0)
  s.inventory.boost = 2
  consumeItem(s, 'boost', NOW)
  assert.equal(s.boostDate, TODAY)
  throwsCode(() => consumeItem(s, 'boost', NOW), 'already_active')
  assert.equal(s.inventory.boost, 1)

  const totals = { ...ZERO, kcal: 2000, protein: 120 }
  const events = onEntrySaved(s, { date: TODAY, isNewEntry: true, meals: new Set(['breakfast']), totals, goals: GOALS }, NOW)
  const coins = events.filter((e) => e.type === 'reward').map((e) => e.coins)
  assert.deepEqual(coins, [10, 30, 50]) // 5×2, 15×2, 25×2

  // учорашній запис — без подвоєння
  const y = onEntrySaved(s, { date: '2026-11-13', isNewEntry: true, meals: new Set(['lunch']), totals: ZERO, goals: GOALS }, NOW)
  assert.equal(y.find((e) => e.type === 'reward')?.coins, 5)
})

test('читміл одразу зараховує день: +25 за норму, перебір потім нічого не забирає', () => {
  const s = rich(0)
  s.inventory.cheatMeal = 1
  const events = consumeItem(s, 'cheatMeal', NOW)
  assert.equal(s.coins, 25)
  assert.equal(s.days[TODAY]?.cheat, true)
  assert.deepEqual(s.cheatDays, [TODAY]) // назавжди — для статистики
  assert.equal(events[0]?.type, 'reward')

  // 4000 ккал — далеко за нормою, але день лишається успішним і нагорода не повторюється
  const after = onEntrySaved(s, { date: TODAY, isNewEntry: true, meals: new Set(['dinner']), totals: { ...ZERO, kcal: 4000 }, goals: GOALS }, NOW)
  assert.equal(s.days[TODAY]?.kcal, true)
  assert.ok(!after.some((e) => e.type === 'reward' && e.reason === 'kcal'))
})

test('читміл не витрачається, якщо норму вже зараховано', () => {
  const s = rich(0)
  s.inventory.cheatMeal = 1
  onEntrySaved(s, { date: TODAY, isNewEntry: true, meals: new Set(['lunch']), totals: { ...ZERO, kcal: 2000 }, goals: GOALS }, NOW)
  throwsCode(() => consumeItem(s, 'cheatMeal', NOW), 'kcal_done')
  assert.equal(s.inventory.cheatMeal, 1)
})

test('супер вогник повертає обірвану серію — коли завгодно після обриву', () => {
  const s = rich(0)
  s.streak = 12
  s.streakWeeksPaid = 1
  s.lastActiveDate = '2026-11-10' // пропущено 3 дні: 1 безкоштовний, на 2 інші щитів немає
  registerActivity(s, TODAY, [])
  assert.equal(s.streak, 1)
  assert.deepEqual(s.lostStreak, { value: 12, weeksPaid: 1, date: TODAY })

  s.inventory.superFlame = 1
  const events = consumeItem(s, 'superFlame', NOW)
  assert.equal(s.streak, 13)
  assert.equal(s.lostStreak, null)
  // 13 днів: 1-й тиждень уже оплачено до обриву, 2-й ще не настав — без повторного бонусу
  assert.ok(!events.some((e) => e.type === 'reward'))
  assert.equal(s.streakWeeksPaid, 1)

  // без обірваної серії — нема що повертати
  s.inventory.superFlame = 1
  throwsCode(() => consumeItem(s, 'superFlame', NOW), 'nothing_to_restore')

  // обрив тиждень тому — однаково можна
  s.lostStreak = { value: 5, weeksPaid: 0, date: '2026-11-07' }
  consumeItem(s, 'superFlame', NOW)
  assert.equal(s.streak, 18)
  assert.equal(s.inventory.superFlame, 0)
})

test('супер вогник доплачує тижневий бонус, якщо повернута серія перетнула 7 днів', () => {
  const s = rich(0)
  s.streak = 2
  s.lostStreak = { value: 6, weeksPaid: 0, date: '2026-11-13' } // обірвалась учора
  s.inventory.superFlame = 1
  const events = consumeItem(s, 'superFlame', NOW)
  assert.equal(s.streak, 8)
  assert.deepEqual(
    events.filter((e) => e.type === 'reward').map((e) => e.coins),
    [100],
  )
})

test('використати те, чого немає, не можна', () => {
  const s = rich(0)
  throwsCode(() => consumeItem(s, 'boost', NOW), 'none_left')
  throwsCode(() => consumeItem(s, 'shield', NOW), 'unknown') // заморозка спрацьовує сама
})

test('sanitizeGame: поля магазину переживають збереження і не виходять за межі', () => {
  const s = sanitizeGame({
    shieldSlots: 99,
    inventory: { cheatMeal: 2, boost: -1, superFlame: 'x' },
    boostDate: TODAY,
    lostStreak: { value: 7, weeksPaid: 1, date: TODAY },
    days: { [TODAY]: { cheat: true } },
  })
  assert.equal(s.shieldSlots, MAX_SHIELD_SLOTS)
  assert.deepEqual(s.inventory, { cheatMeal: 2, boost: 0, superFlame: 0, temu: 0 })
  assert.equal(s.boostDate, TODAY)
  assert.deepEqual(s.lostStreak, { value: 7, weeksPaid: 1, date: TODAY })
  assert.equal(s.days[TODAY]?.cheat, true)
  assert.equal(sanitizeGame({}).shieldSlots, 2)
})

test('тема: купується раз і назавжди, одразу вмикається; перемикати можна лише на куплені', async () => {
  const { THEME_PRICE, setTheme } = await import('../shared/shop.js')
  const s = rich(THEME_PRICE + 10)
  const events = buyItem(s, 'newyear', NOW)
  assert.equal(s.coins, 10)
  assert.equal(s.activeTheme, 'newyear')
  assert.ok('newyear' in s.themes)
  assert.ok(events.some((e) => e.type === 'notice'))
  s.coins = 5000
  throwsCode(() => buyItem(s, 'newyear', NOW), 'already_owned')

  setTheme(s, 'default', NOW)
  assert.equal(s.activeTheme, 'default')
  throwsCode(() => setTheme(s, 'synthwave', NOW), 'not_owned')
  throwsCode(() => setTheme(s, 'plaid', NOW), 'unknown')
  setTheme(s, 'newyear', NOW)

  // збережений стан: невідомі теми відкидаються, активна — лише куплена
  const restored = sanitizeGame({ themes: { newyear: 1, plaid: 2 }, activeTheme: 'synthwave' })
  assert.deepEqual(Object.keys(restored.themes), ['newyear'])
  assert.equal(restored.activeTheme, 'default')
  assert.equal(sanitizeGame({ themes: { crimson: 1 }, activeTheme: 'crimson' }).activeTheme, 'crimson')
})

test('супер вогник — не більше одного в інвентарі', () => {
  const s = rich()
  buyItem(s, 'superFlame', NOW)
  throwsCode(() => buyItem(s, 'superFlame', NOW), 'inventory_full')
  assert.equal(s.inventory.superFlame, 1)
})

test('«Фігня з Temu»: купується за ціну тижня серії, використовується й зникає', () => {
  const s = rich(PRICES.temu)
  buyItem(s, 'temu', NOW)
  assert.equal(s.coins, 0)
  const events = consumeItem(s, 'temu', NOW)
  assert.equal(s.inventory.temu, 0)
  assert.equal(events[0]?.type, 'notice')
  throwsCode(() => consumeItem(s, 'temu', NOW), 'none_left')
})

test('стиль дня: лише куплені естетичні стилі, стабільний протягом дня, не як учора', async () => {
  const { dailyStyle, displayedTheme, setTheme, STYLE_THEME_IDS } = await import('../shared/shop.js')
  const s = rich()
  s.themes = { newyear: 1, crimson: 1, obsidian: 1, rainbow: 1 }
  s.activeTheme = 'newyear'
  throwsCode(() => setTheme({ ...s, themes: { crimson: 1, newyear: 1 } }, 'random', NOW), 'not_enough_styles')
  setTheme(s, 'random', NOW)
  assert.equal(s.dailyRandomTheme, true)
  const days = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']
  const picks = days.map((d) => dailyStyle(s, d))
  for (const p of picks) assert.ok(STYLE_THEME_IDS.includes(p) && p in s.themes && p !== 'newyear')
  assert.equal(dailyStyle(s, '2026-11-14'), dailyStyle(s, '2026-11-14'))
  assert.equal(displayedTheme(s, '2026-11-14'), picks[4])
  // вибір конкретної теми вимикає «стиль дня»
  setTheme(s, 'newyear', NOW)
  assert.equal(s.dailyRandomTheme, false)
  assert.equal(displayedTheme(s, '2026-11-14'), 'newyear')
})
