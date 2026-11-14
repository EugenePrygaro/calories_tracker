/**
 * Ключ дня у форматі YYYY-MM-DD за локальним часом.
 * Рядок, а не Date/ISO: запис о 23:30 не «з'їде» на наступний день через UTC.
 */
export type DateKey = string

export function toDateKey(date: Date = new Date()): DateKey {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function fromDateKey(key: DateKey): Date {
  const [y = 0, m = 1, d = 1] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(key: DateKey, days: number): DateKey {
  const date = fromDateKey(key)
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** «Сьогодні, 14 лист.», «Вчора, 13 лист.», «Пт, 7 лист.» */
export function formatDateKey(key: DateKey): string {
  const date = fromDateKey(key)
  const short = date.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' })
  const today = toDateKey()
  if (key === today) return `Сьогодні, ${short}`
  if (key === addDays(today, -1)) return `Вчора, ${short}`
  if (key === addDays(today, 1)) return `Завтра, ${short}`
  const weekday = date.toLocaleDateString('uk-UA', { weekday: 'short' })
  return `${capitalize(weekday)}, ${short}`
}

/** Двоярусний підпис для шапки: «Сьогодні» + «пʼятниця, 14 листопада». */
export function dateLabel(key: DateKey): { title: string; subtitle: string } {
  const date = fromDateKey(key)
  const today = toDateKey()
  const sameYear = date.getFullYear() === new Date().getFullYear()
  const dayMonth = date.toLocaleDateString('uk-UA', {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
  const weekday = date.toLocaleDateString('uk-UA', { weekday: 'long' })

  const relative =
    key === today ? 'Сьогодні' : key === addDays(today, -1) ? 'Вчора' : key === addDays(today, 1) ? 'Завтра' : null
  return relative
    ? { title: relative, subtitle: `${weekday}, ${dayMonth}` }
    : { title: capitalize(weekday), subtitle: dayMonth }
}
