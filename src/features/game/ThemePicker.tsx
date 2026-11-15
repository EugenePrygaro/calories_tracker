import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { chooseTheme, useGame } from '@/data/store'
import { cn } from '@/lib/cn'
import type { AppTheme } from '@/lib/theme'
import { ALL_THEMES, THEME_LOOK } from './themeStyle'

/**
 * Перемикач тем у налаштуваннях: стандартна + куплені.
 * Не показується, поки не куплено жодної теми.
 */
export function ThemePicker() {
  const game = useGame()
  if (!game) return null
  const owned = ALL_THEMES.filter((t) => t === 'default' || t in game.themes)
  if (owned.length < 2) return null

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-bold tracking-wider text-muted uppercase">Тема оформлення</h3>
      <div role="radiogroup" aria-label="Тема оформлення" className="flex flex-col gap-2">
        {owned.map((t) => (
          <ThemeOption key={t} theme={t} active={game.activeTheme === t} />
        ))}
      </div>
    </section>
  )
}

function ThemeOption({ theme, active }: { theme: AppTheme; active: boolean }) {
  const look = THEME_LOOK[theme]
  const Icon = look.icon
  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={active}
      whileTap={{ scale: 0.96 }}
      onClick={() => void chooseTheme(theme).catch(() => {})}
      className={cn(
        'relative flex items-center gap-2.5 rounded-2xl px-3 py-3 text-left text-sm font-bold ring-1 ring-inset transition-colors',
        active ? 'bg-primary/10 ring-primary/60' : 'bg-white/[0.03] ring-white/[0.07]',
      )}
    >
      <Swatches colors={look.swatches} />
      <span className="min-w-0 flex-1 truncate">{look.title}</span>
      {active ? <Check className="size-4 shrink-0 text-primary" /> : <Icon className="size-4 shrink-0 text-muted" />}
    </motion.button>
  )
}

/** Три кружечки-зразки кольорів теми, що наїжджають один на одного. */
export function Swatches({ colors, size = 'size-4' }: { colors: readonly string[]; size?: string }) {
  return (
    <span className="flex shrink-0 -space-x-1.5">
      {colors.map((c) => (
        <span key={c} className={cn(size, 'rounded-full ring-2 ring-card')} style={{ background: c }} />
      ))}
    </span>
  )
}
