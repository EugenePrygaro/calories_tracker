/**
 * Ключ дня у форматі YYYY-MM-DD за локальним часом.
 * Зберігаємо дати рядками, а не Date/ISO: так запис о 23:30 не «з'їде»
 * на наступний день через UTC, а індекс у Dexie лишається простим.
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

export function formatDateKey(key: DateKey): string {
  const today = toDateKey()
  if (key === today) return 'Сьогодні'
  if (key === addDays(today, -1)) return 'Вчора'
  if (key === addDays(today, 1)) return 'Завтра'
  return fromDateKey(key).toLocaleDateString('uk-UA', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  })
}
