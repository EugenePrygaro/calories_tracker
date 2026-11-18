import { round1 } from '@shared/nutrition.js'
import { LIMITS, canonicalEan, type Food, type FoodItem, type Portion } from '@shared/model.js'

/** Грами для count порцій по unitGrams (з точністю до 0,1 г). */
export const portionGrams = (unitGrams: number, count: number) => round1(unitGrams * count)

/** «200г», «0,9 л», «1 кг», «500 мл» — остання згадка ваги чи об'єму в назві. */
const PACK_RE = /(\d+(?:[.,]\d+)?)\s*(кг|гр|г|мл|л)(?![\p{L}\d])/giu

/**
 * Порція «упаковка» з назви товару («Кефір Ферма 1% 840г» → 840 г; мл і л — як грами).
 * Нічого не знайшли або вага поза межами — null.
 */
export function packagePortion(name: string): Portion | null {
  const last = [...name.matchAll(PACK_RE)].at(-1)
  if (!last) return null
  const n = Number((last[1] ?? '').replace(',', '.'))
  const unit = (last[2] ?? '').toLowerCase()
  const grams = round1(unit === 'кг' || unit === 'л' ? n * 1000 : n)
  return grams >= LIMITS.grams.min && grams <= LIMITS.grams.max ? { unit: 'package', grams } : null
}

/** Знайдене сканером: без власних порцій — пропонуємо «упаковку» з назви. */
export function withPackagePortion(item: FoodItem): FoodItem {
  if ((item.portions ?? []).length > 0) return item
  const pack = packagePortion(item.name)
  return pack ? { ...item, portions: [pack] } : item
}

/** Страва з «Моїх страв» із цим штрихкодом (у страв з OFF і Zakaz.ua штрихкод — це й код у каталозі). */
export function findFoodByEan(foods: readonly Food[], ean: string): Food | undefined {
  return foods.find(
    (f) => f.barcode === ean || ((f.source === 'off' || f.source === 'zakaz') && canonicalEan(f.offCode) === ean),
  )
}
