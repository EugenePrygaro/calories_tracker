import {
  Award,
  BatteryCharging,
  Beef,
  BookHeart,
  CalendarCheck,
  ChefHat,
  CookingPot,
  Coins,
  CopyCheck,
  Crosshair,
  Drumstick,
  Droplets,
  Dumbbell,
  Flame,
  Footprints,
  Grid2x2Check,
  HeartPulse,
  MoonStar,
  NotebookPen,
  PiggyBank,
  Salad,
  Scale,
  ShieldPlus,
  ShoppingBag,
  SlidersHorizontal,
  Snowflake,
  Sunrise,
  type LucideIcon,
} from 'lucide-react'
import type { Achievement, AchievementGroup, AchievementTier } from '@shared/achievements.js'

/** Вигляд категорії ачівок. Спільне для вітрини, модалки й DEV-панелі. */
export interface GroupStyle {
  title: string
  icon: LucideIcon
  /** CSS-змінна кольору категорії — для світіння, конфеті, градієнтів */
  color: string
  tint: string
  bar: string
}

export const GROUPS: Record<AchievementGroup, GroupStyle> = {
  diary: {
    title: 'Щоденник',
    icon: NotebookPen,
    color: 'var(--accent-primary)',
    tint: 'bg-primary/15 text-primary ring-primary/30',
    bar: 'bg-accent-gradient',
  },
  streak: {
    title: 'Серії',
    icon: Flame,
    color: 'var(--streak)',
    tint: 'bg-streak/15 text-streak ring-streak/30',
    bar: 'bg-gradient-to-r from-streak/70 to-streak',
  },
  nutrition: {
    title: 'Харчування',
    icon: Salad,
    color: 'var(--accent-protein)',
    tint: 'bg-protein/15 text-protein ring-protein/30',
    bar: 'bg-gradient-to-r from-protein/70 to-protein',
  },
  kitchen: {
    title: 'Кухня',
    icon: ChefHat,
    color: 'var(--accent-carbs)',
    tint: 'bg-carbs/15 text-carbs ring-carbs/30',
    bar: 'bg-gradient-to-r from-carbs/70 to-carbs',
  },
  economy: {
    title: 'Калокоїни й інвентар',
    icon: Coins,
    color: 'var(--coin)',
    tint: 'bg-coin/15 text-coin ring-coin/30',
    bar: 'bg-gradient-to-r from-coin/70 to-coin',
  },
}

/** Порядок категорій у вітрині. */
export const GROUP_ORDER: AchievementGroup[] = ['diary', 'streak', 'nutrition', 'kitchen', 'economy']

/** Іконки ачівок за назвою з каталогу (shared/achievements.js). */
const ICONS: Record<string, LucideIcon> = {
  BatteryCharging,
  Beef,
  BookHeart,
  CalendarCheck,
  ChefHat,
  CookingPot,
  CopyCheck,
  Crosshair,
  Drumstick,
  Droplets,
  Dumbbell,
  Flame,
  Footprints,
  Grid2x2Check,
  HeartPulse,
  MoonStar,
  NotebookPen,
  PiggyBank,
  Scale,
  ShieldPlus,
  ShoppingBag,
  SlidersHorizontal,
  Snowflake,
  Sunrise,
}

export const iconOf = (a: Achievement): LucideIcon => ICONS[a.icon] ?? Award

/** Рівень ачівки: назва й колір (токени --tier-*). */
export const TIERS: Record<AchievementTier, { label: string; color: string }> = {
  bronze: { label: 'Бронза', color: 'var(--tier-bronze)' },
  silver: { label: 'Срібло', color: 'var(--tier-silver)' },
  gold: { label: 'Золото', color: 'var(--tier-gold)' },
  diamond: { label: 'Діамант', color: 'var(--tier-diamond)' },
}
