import { useEffect } from 'react'
import { useGame } from '@/data/store'
import { applyTheme, readCachedTheme, type AppTheme } from '@/lib/theme'
import { useGameUi } from '@/store/gameUi'
import { WinterDecor } from './WinterDecor'

const initial = readCachedTheme()

/** Активна тема: примірка → DEV-перегляд → вибір із гри → остання збережена (поки гра вантажиться). */
function useActiveTheme(): AppTheme {
  const tryOn = useGameUi((s) => s.tryOn?.theme)
  const preview = useGameUi((s) => s.themePreview)
  const chosen = useGame()?.activeTheme as AppTheme | undefined
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
          <WinterDecor />
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
