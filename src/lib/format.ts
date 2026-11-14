import type { Nutrients } from '@shared/model.js'

const int = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 })
const dec = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 1 })

/** Калорії — цілим числом: «1 234». */
export const kcal = (n: number) => int.format(Math.round(n))

/** Грами: до 10 г з десятою частиною («2,5»), далі цілим. */
export const grams = (n: number) => (Math.abs(n) < 10 ? dec.format(n) : int.format(Math.round(n)))

const one = new Intl.NumberFormat('uk-UA', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** Вага — завжди з однією цифрою після коми: «78,4». */
export const kg = (n: number) => one.format(n)

/** Сантиметри: «96» або «95,5». */
export const cm = (n: number) => dec.format(n)

/** Зміна зі знаком: «−0,6», «+1,2», «0». */
export const signed = (n: number) => (n > 0 ? `+${dec.format(n)}` : n < 0 ? `−${dec.format(-n)}` : '0')

/** Короткий рядок БЖВ: «Б 10 · Ж 5 · В 15». */
export const macrosLine = (n: Nutrients) =>
  `Б ${grams(n.protein)} · Ж ${grams(n.fat)} · В ${grams(n.carbs)}`

/** Число з поля вводу: кома або крапка, порожнє → null. */
export function parseNum(value: string): number | null {
  const s = value.trim().replace(',', '.')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
