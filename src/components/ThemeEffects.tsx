import { lazy, Suspense, useEffect } from 'react'
import { displayedTheme } from '@shared/shop.js'
import { useGame } from '@/data/store'
import { toDateKey } from '@/lib/date'
import { applyTheme, readCachedTheme, type AppTheme } from '@/lib/theme'
import { useGameUi } from '@/store/gameUi'

// Прикраси окремих тем — окремими чанками: вантажаться, лише коли тему ввімкнено
const WinterDecor = lazy(() => import('./WinterDecor').then((m) => ({ default: m.WinterDecor })))
const OrbitalDecor = lazy(() => import('./OrbitalDecor').then((m) => ({ default: m.OrbitalDecor })))

const initial = readCachedTheme()

/** Активна тема: примірка → DEV-перегляд → вибір із гри → остання збережена (поки гра вантажиться). */
function useActiveTheme(): AppTheme {
  const tryOn = useGameUi((s) => s.tryOn?.theme)
  const preview = useGameUi((s) => s.themePreview)
  const game = useGame()
  // вибрана тема або «стиль дня» (залежить лише від дати — без запитів)
  const chosen = game ? (displayedTheme(game, toDateKey()) as AppTheme) : undefined
  return tryOn ?? preview ?? chosen ?? initial
}

/**
 * Застосовує тему й малює її фонові ефекти (сніг, пелюстки, сітку…).
 * Шари — позаду вмісту й без подій дотику; scanlines — тонкий шар поверх.
 */
export function ThemeEffects() {
  const theme = useActiveTheme()
  // запам'ятовуємо лише справжній вибір — не примірку й не DEV-перегляд
  const temporary = useGameUi((s) => s.tryOn !== null || s.themePreview !== null)

  useEffect(() => {
    applyTheme(theme, !temporary)
  }, [theme, temporary])

  switch (theme) {
    case 'newyear':
      return (
        <>
          <div className="fx-layer" aria-hidden>
            <div className="fx-fall fx-snow-b" />
            <div className="fx-fall fx-snow-a" />
          </div>
          <Suspense fallback={null}>
            <WinterDecor />
          </Suspense>
        </>
      )
    case 'spring':
      return (
        <div className="fx-layer" aria-hidden>
          <div className="fx-fall fx-petals-b" />
          <div className="fx-fall fx-petals-a" />
        </div>
      )
    case 'valentine':
      return (
        <div className="fx-layer" aria-hidden>
          <div className="fx-rise fx-hearts" />
        </div>
      )
    case 'halloween':
      return (
        <div className="fx-layer" aria-hidden>
          <div className="fx-glow-bottom" />
          <div className="fx-rise fx-embers" />
        </div>
      )
    case 'crimson':
      return (
        <div className="fx-layer" aria-hidden>
          <div className="fx-vignette" />
        </div>
      )
    case 'orbital':
      return (
        <div className="fx-layer" aria-hidden>
          <Suspense fallback={null}>
            <OrbitalDecor />
          </Suspense>
        </div>
      )
    case 'rainbow':
      return (
        <div className="fx-layer" aria-hidden>
          <div className="fx-aurora" />
          <div className="fx-rise fx-prism-dust" />
        </div>
      )
    case 'espresso':
      return (
        <div className="fx-layer" aria-hidden>
          <div className="fx-espresso-glow" />
          <div className="fx-fall fx-beans" />
          <div className="fx-steam" style={{ left: '8%', animationDelay: '0s' }} />
          <div className="fx-steam" style={{ left: '46%', animationDelay: '-3.2s' }} />
          <div className="fx-steam" style={{ left: '80%', animationDelay: '-6.1s' }} />
        </div>
      )
    case 'amethyst':
      return (
        <div className="fx-layer" aria-hidden>
          <div className="fx-amethyst-aura" />
          <div className="fx-stars fx-stars-b" />
          <div className="fx-stars fx-stars-a" />
        </div>
      )
    case 'obsidian':
      return (
        <div className="fx-layer" aria-hidden>
          <div className="fx-gold-aura" />
          <div className="fx-rise fx-gold-dust-b" />
          <div className="fx-rise fx-gold-dust-a" />
        </div>
      )
    case 'synthwave':
      return (
        <>
          <div className="fx-layer" aria-hidden>
            <div className="fx-horizon">
              <div className="fx-sun" />
              <div className="fx-grid" />
            </div>
          </div>
          <div className="fx-scanlines" aria-hidden />
        </>
      )
    default:
      return null
  }
}
