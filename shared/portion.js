/**
 * Калькулятор порцій: скільки грамів кожної страви взяти, щоб влучити
 * в задані калорії (і, за бажанням, білки/жири/вуглеводи).
 *
 * Задача — невід'ємні найменші квадрати: мінімізуємо відносні відхилення від
 * заданих цілей (калорії — майже жорстка умова, БЖВ лише розподіляють їх між стравами) плюс слабку «тягу» до рівного
 * розподілу калорій між стравами — тоді, якщо задано лише калорії, вони просто
 * діляться порівну, а з БЖВ — страви підбираються під макроси.
 * Порція кожної страви обмежена (див. portionCap): інакше, щоб «дотягнути» жири,
 * розв'язувач радо пропонує 2 кг салату. Краще недобрати макрос — підсумок це підсвітить.
 * Розв'язок — прискорений проєкційний градієнт (FISTA); страв мало, тож це миттєво.
 */

/** @typedef {import('./model.js').Nutrients} Nutrients */
/** @typedef {{ kcal: number, protein?: number | null, fat?: number | null, carbs?: number | null }} PortionTarget */

const KEYS = /** @type {const} */ (['kcal', 'protein', 'fat', 'carbs'])
const WEIGHT = { kcal: 40, protein: 1, fat: 1, carbs: 1 }
/** Слабка тяга до рівного розподілу калорій, коли задано макроси (без них — сильна). */
const SPREAD_WITH_MACROS = 0.02
const SPREAD_KCAL_ONLY = 1
/** Межа порції без відомої типової порції, г. */
export const DEFAULT_CAP = 600

/**
 * Найбільша розумна порція страви: три типові порції, але від 300 до 1000 г.
 * @param {number | null | undefined} servingGrams
 */
export function portionCap(servingGrams) {
  return servingGrams && servingGrams > 0 ? Math.min(Math.max(servingGrams * 3, 300), 1000) : DEFAULT_CAP
}
const ITERATIONS = 4000

/**
 * @param {readonly Nutrients[]} per100 поживність кожної страви на 100 г
 * @param {PortionTarget} target
 * @param {readonly number[]} [caps] найбільша порція кожної страви, г (за замовчуванням DEFAULT_CAP)
 * @returns {number[]} грами для кожної страви (округлені до 5 г, або до 1 г для дрібних порцій)
 */
export function solvePortions(per100, target, caps = []) {
  const n = per100.length
  const K = target.kcal
  if (n === 0 || !(K > 0)) return per100.map(() => 0)

  // Рядки цілей, які задано: [коефіцієнти на 100 г, ціль, вага]
  const rows = KEYS.flatMap((key) => {
    const goal = key === 'kcal' ? K : target[key]
    if (goal == null || !(goal > 0)) return []
    return [{ a: per100.map((p) => p[key]), goal, w: WEIGHT[key] }]
  })
  const hasMacros = rows.length > 1
  const lambda = hasMacros ? SPREAD_WITH_MACROS : SPREAD_KCAL_ONLY
  const kcal = per100.map((p) => p.kcal)
  const share = K / n
  const maxX = per100.map((_, i) => (caps[i] ?? DEFAULT_CAP) / 100)

  /** Градієнт цільової функції в точці x (x — у сотнях грамів). @param {number[]} x */
  const grad = (x) => {
    const g = new Array(n).fill(0)
    for (const { a, goal, w } of rows) {
      let value = 0
      for (let i = 0; i < n; i++) value += (a[i] ?? 0) * (x[i] ?? 0)
      const r = (value - goal) / goal
      for (let i = 0; i < n; i++) g[i] += (2 * w * r * (a[i] ?? 0)) / goal
    }
    for (let i = 0; i < n; i++) {
      const s = ((kcal[i] ?? 0) * (x[i] ?? 0) - share) / K
      g[i] += (2 * lambda * s * (kcal[i] ?? 0)) / K
    }
    return g
  }

  // Крок 1/L: L — оцінка зверху сталої Ліпшиця градієнта
  let L = 0
  for (const { a, goal, w } of rows) L += (2 * w * a.reduce((acc, v) => acc + v * v, 0)) / (goal * goal)
  L += (2 * lambda * Math.max(...kcal.map((k) => k * k))) / (K * K)
  const step = 1 / (L || 1)

  const project = (/** @type {number} */ v, /** @type {number} */ i) => Math.min(Math.max(v, 0), maxX[i] ?? 0)
  // старт — рівний розподіл калорій
  let x = kcal.map((k, i) => (k > 0 ? project(share / k, i) : 0))
  let y = [...x]
  let t = 1
  for (let it = 0; it < ITERATIONS; it++) {
    const g = grad(y)
    const next = y.map((v, i) => project(v - step * (g[i] ?? 0), i))
    const tNext = (1 + Math.sqrt(1 + 4 * t * t)) / 2
    y = next.map((v, i) => v + ((t - 1) / tNext) * (v - (x[i] ?? 0)))
    x = next
    t = tNext
  }

  return x.map((v) => roundGrams(v * 100))
}

/** До 5 г, а дрібні порції (олія, горіхи) — до 1 г. @param {number} g */
export function roundGrams(g) {
  if (g < 0.5) return 0
  return g < 30 ? Math.round(g) : Math.round(g / 5) * 5
}

/**
 * Поживність набору порцій.
 * @param {readonly Nutrients[]} per100 @param {readonly number[]} grams @returns {Nutrients}
 */
export function totalsOf(per100, grams) {
  const t = { kcal: 0, protein: 0, fat: 0, carbs: 0 }
  per100.forEach((p, i) => {
    const k = (grams[i] ?? 0) / 100
    t.kcal += p.kcal * k
    t.protein += p.protein * k
    t.fat += p.fat * k
    t.carbs += p.carbs * k
  })
  return t
}
