import { DEFAULT_THEME, isThemeId, type ThemeId } from '@shared/shop.js'

export type AppTheme = ThemeId | typeof DEFAULT_THEME

const KEY = 'theme'

/** Остання застосована тема — щоб при запуску не блимала стандартна, поки вантажиться стан гри. */
export function readCachedTheme(): AppTheme {
  try {
    const v = localStorage.getItem(KEY)
    return isThemeId(v) ? v : DEFAULT_THEME
  } catch {
    return DEFAULT_THEME
  }
}

/**
 * Вмикає тему: атрибут <html data-theme>, колір системної смуги (theme-color).
 * @param remember запам'ятати для наступного запуску (DEV-перегляд — ні)
 */
export function applyTheme(theme: AppTheme, remember = true): void {
  const root = document.documentElement
  if (theme === DEFAULT_THEME) delete root.dataset.theme
  else root.dataset.theme = theme
  if (remember) {
    try {
      localStorage.setItem(KEY, theme)
    } catch {
      // приватний режим — не страшно
    }
  }
  const bg = getComputedStyle(root).getPropertyValue('--bg-main').trim()
  if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
}
