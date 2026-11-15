import { Flower2, Gamepad2, Gem, Ghost, Heart, Leaf, TreePine, type LucideIcon } from 'lucide-react'
import { SHOP_ITEMS, THEME_IDS } from '@shared/shop.js'
import type { AppTheme } from '@/lib/theme'

/** Вигляд теми в магазині, налаштуваннях і DEV-панелі: назва, іконка, три кольори-зразки. */
export interface ThemeLook {
  title: string
  icon: LucideIcon
  /** фон, акцент, другий акцент */
  swatches: readonly [string, string, string]
}

const titleOf = (id: string) => SHOP_ITEMS.find((x) => x.id === id)?.title ?? id

export const THEME_LOOK: Record<AppTheme, ThemeLook> = {
  default: { title: 'Смарагдовий графіт', icon: Leaf, swatches: ['#0c1210', '#17b26a', '#7ad9b4'] },
  newyear: { title: titleOf('newyear'), icon: TreePine, swatches: ['#08111f', '#4ea8ff', '#a8d8ff'] },
  halloween: { title: titleOf('halloween'), icon: Ghost, swatches: ['#0e0913', '#ff8a1f', '#bb86ff'] },
  spring: { title: titleOf('spring'), icon: Flower2, swatches: ['#16121a', '#f19abf', '#a9e5cd'] },
  valentine: { title: titleOf('valentine'), icon: Heart, swatches: ['#15090f', '#ff4f80', '#ffb4c9'] },
  crimson: { title: titleOf('crimson'), icon: Gem, swatches: ['#0c0506', '#d21e3d', '#d6b06a'] },
  synthwave: { title: titleOf('synthwave'), icon: Gamepad2, swatches: ['#0b0618', '#ff2fb3', '#00e5ff'] },
}

/** Усі теми по порядку: стандартна + магазинні. */
export const ALL_THEMES: readonly AppTheme[] = ['default', ...THEME_IDS]
