import { createElement } from 'react'
import type { Achievement } from '@shared/achievements.js'
import { iconOf } from './achievementStyle'

/** Іконка ачівки за назвою з каталогу (lucide-react). */
export function AchievementIcon({ a, className, strokeWidth }: { a: Achievement; className?: string; strokeWidth?: number }) {
  return createElement(iconOf(a), { className, ...(strokeWidth ? { strokeWidth } : {}) })
}
