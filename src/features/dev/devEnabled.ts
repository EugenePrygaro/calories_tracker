/**
 * DEV-панель видно в `npm run dev`, а на Vercel — лише після відкриття адреси з `?dev`
 * (запам'ятовується; `?dev=0` вимикає). Серверні dev-дії вимикає DISABLE_DEV_TOOLS=1.
 */
export function isDevEnabled(): boolean {
  if (import.meta.env.DEV) return true
  try {
    const param = new URLSearchParams(location.search).get('dev')
    if (param !== null) localStorage.setItem('dev:enabled', param === '0' ? '0' : '1')
    return localStorage.getItem('dev:enabled') === '1'
  } catch {
    return false
  }
}
