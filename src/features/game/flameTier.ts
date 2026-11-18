import type { CSSProperties } from 'react'

/**
 * Вогник «розпалюється» разом із серією: жовтий → помаранчевий → червоний → розпечений.
 * `color: null` — колір теми (--streak). `heat` — наскільки «гарячий»: щільніша заливка й світіння.
 */
interface FlameTier {
  from: number
  name: string
  color: string | null
  heat: 0 | 1 | 2 | 3
}

export const FLAME_TIERS: readonly FlameTier[] = [
  { from: 1, name: 'Жовтий', color: '#fbbf24', heat: 0 },
  { from: 7, name: 'Помаранчевий', color: null, heat: 1 },
  { from: 30, name: 'Червоний', color: '#ff3b30', heat: 2 },
  { from: 100, name: 'Розпечений', color: '#ff1744', heat: 3 },
]

const first = FLAME_TIERS[0] as FlameTier

/** Рівень вогника для серії (для 0 — перший, але вогник тоді й так сірий). */
export function flameTier(streak: number): FlameTier {
  return [...FLAME_TIERS].reverse().find((t) => streak >= t.from) ?? first
}

/** Наступний рівень, до якого можна дорости, або null — уже найвищий. */
export function nextFlameTier(streak: number): FlameTier | null {
  return FLAME_TIERS.find((t) => t.from > streak) ?? null
}

/**
 * Стиль, що перефарбовує все «вогняне» всередині елемента (text-streak, bg-streak/…).
 * Tailwind читає --color-streak, обчислений на :root, тож перевизначаємо обидві змінні.
 */
export function flameStyle(streak: number): CSSProperties {
  const { color } = flameTier(streak)
  return color ? ({ '--streak': color, '--color-streak': color } as CSSProperties) : {}
}

/** Заливка іконки вогника: що гарячіший, то щільніша. */
const FILL = ['fill-streak/35', 'fill-streak/45', 'fill-streak/70', 'fill-streak/90'] as const
export const flameFill = (streak: number) => FILL[flameTier(streak).heat]

/**
 * Обводка плашки з вогником. Tailwind малює ring через box-shadow, а світіння нижче — теж box-shadow
 * (inline-стиль затер би ring), тож обводку задаємо тут для всіх станів, а не класом ring-*.
 * Товщина — тут, в одному місці.
 */
export const FLAME_RING_PX = 2.5
const ring = (color: string) => `inset 0 0 0 ${FLAME_RING_PX}px ${color}`
/** Сірий вогник (сьогодні ще не зараховано) */
export const FLAME_RING_OFF: CSSProperties = { boxShadow: ring('rgb(255 255 255 / 0.1)') }
const RING = ring('color-mix(in oklab, var(--color-streak) 25%, transparent)')

/**
 * Світіння навколо плашки — box-shadow, а не SVG-фільтр
 * (фільтри на анімованих елементах дорогі, див. README «Швидкодія»).
 */
const GLOW = [
  RING,
  RING,
  `${RING}, 0 0 14px -3px var(--color-streak)`,
  `${RING}, 0 0 22px -2px var(--color-streak), inset 0 0 12px -6px var(--color-streak)`,
] as const
/** Обводка + (на гарячих рівнях) світіння для плашки з вогником. */
export const flameGlow = (streak: number): CSSProperties => ({ boxShadow: GLOW[flameTier(streak).heat] })
