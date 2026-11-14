import { Coffee, Cookie, Moon, Sun, type LucideIcon } from 'lucide-react'
import type { MealType } from '@shared/model.js'

/** Іконки прийомів їжі — однакові на головній і в «Скопіювати з учора». */
export const MEAL_ICONS: Record<MealType, LucideIcon> = {
  breakfast: Coffee,
  lunch: Sun,
  dinner: Moon,
  snack: Cookie,
}
