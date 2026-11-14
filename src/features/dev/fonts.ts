/**
 * Шрифти для dev-перемикача: безкоштовні (Google Fonts, SIL OFL), з кирилицею (ґ є і ї).
 * Play — шрифт застосунку, підключений локально (@fontsource, main.tsx);
 * решту для порівняння тягнемо з Google Fonts лише в dev-панелі.
 */
export interface FontOption {
  family: string
  /** Параметр `wght` для Google Fonts css2 — лише ті накреслення, що реально існують. */
  weights: string
  note: string
}

export const DEFAULT_FONT = 'Play'
export const SYSTEM_FONT = 'system-ui'

export const FONTS: readonly FontOption[] = [
  { family: 'Play', weights: '400;700', note: 'шрифт застосунку' },
  { family: 'Tektur', weights: '400;500;600;700', note: 'кібер, кутастий' },
  { family: 'Commissioner', weights: '400;500;600;700', note: 'гнучкий гротеск' },
  { family: 'Onest', weights: '400;500;600;700', note: 'як у recipe-book' },
  { family: 'Manrope', weights: '400;500;600;700', note: 'сучасний геометричний' },
  { family: 'Geologica', weights: '400;500;600;700', note: 'технічний, з характером' },
]

/** Підвантажує шрифт з Google Fonts (окремий <link> на кожен — помилка одного не ламає інші). */
export function loadFont(font: FontOption): void {
  if (font.family === DEFAULT_FONT) return // уже локально
  const id = `dev-font-${font.family.replace(/\s+/g, '-')}`
  if (document.getElementById(id)) return
  const link = document.createElement('link')
  link.id = id
  link.rel = 'stylesheet'
  link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font.family)}:wght@${font.weights}&display=swap`
  document.head.appendChild(link)
}

const STORAGE_KEY = 'dev:font'

export function applyFont(family: string): void {
  const root = document.documentElement.style
  if (family === DEFAULT_FONT) root.removeProperty('--font-app')
  else if (family === SYSTEM_FONT) root.setProperty('--font-app', 'system-ui, sans-serif')
  else root.setProperty('--font-app', `'${family}', system-ui, sans-serif`)
  try {
    localStorage.setItem(STORAGE_KEY, family)
  } catch {
    // приватний режим — просто не запам'ятовуємо
  }
}

/** Відновлює шрифт, вибраний у dev-панелі (лише коли панель увімкнена). */
export function restoreFont(): string {
  let family: string | null = null
  try {
    family = localStorage.getItem(STORAGE_KEY)
  } catch {
    // ignore
  }
  const font = FONTS.find((f) => f.family === family)
  if (font) {
    loadFont(font)
    applyFont(font.family)
    return font.family
  }
  if (family === SYSTEM_FONT) {
    applyFont(SYSTEM_FONT)
    return SYSTEM_FONT
  }
  return DEFAULT_FONT
}
