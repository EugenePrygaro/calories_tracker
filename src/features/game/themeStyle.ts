import { Coffee, Crown, Diamond, Flower2, Orbit, Rainbow, Gamepad2, Gem, Ghost, Heart, Leaf, TreePine, type LucideIcon } from 'lucide-react'
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
  obsidian: { title: titleOf('obsidian'), icon: Crown, swatches: ['#0a0907', '#d6ad62', '#f0dcae'] },
  amethyst: { title: titleOf('amethyst'), icon: Diamond, swatches: ['#0d0b1c', '#a46bff', '#cdb8ff'] },
  espresso: { title: titleOf('espresso'), icon: Coffee, swatches: ['#140c07', '#e0913f', '#e9bf92'] },
  rainbow: { title: titleOf('rainbow'), icon: Rainbow, swatches: ['#ff5e8a', '#ffd23f', '#4fc8ff'] },
  orbital: { title: titleOf('orbital'), icon: Orbit, swatches: ['#050c18', '#2ee6ff', '#9ff3ff'] },
}

/** Усі теми по порядку: стандартна + магазинні. */
export const ALL_THEMES: readonly AppTheme[] = ['default', ...THEME_IDS]
