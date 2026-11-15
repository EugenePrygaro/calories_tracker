import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles, Star } from 'lucide-react'
import { useEffect, useState } from 'react'
import { achievementProgress, newlyUnlocked, statsOf, type Achievement } from '@shared/achievements.js'
import { CoinIcon } from '@/components/CoinIcon'
import { ProgressBar } from '@/components/ProgressBar'
import { claimAchievementReward, dismissAchievement, useFoods, useGame } from '@/data/store'
import { int } from '@/lib/format'
import { useSheetFlag } from '@/lib/sheetFlag'
import { useUiStore } from '@/store/ui'
import { AchievementIcon } from './AchievementIcon'
import { GROUPS, TIERS } from './achievementStyle'

/** Розкриває CSS-змінну в колір (для конфеті). */
function cssColor(value: string): string {
  const name = value.match(/var\((--[\w-]+)\)/)?.[1]
  return name ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() : value
}

/**
 * Вискакує, щойно ачівку досягнуто: усе про неї + «Забрати нагороду» або «Пізніше».
 * «Пізніше» — нагорода лишається у вітрині досягнень, модалка більше не з'являється.
 * Кілька ачівок одразу — по черзі.
 */
export function AchievementUnlockModal() {
  const game = useGame()
  const foods = useFoods()

  // Поки відкрита шторка (додавання їжі тощо) — не перериваємо: модалка з'явиться після закриття
  const sheetOpen = useUiStore((s) => s.modal !== null)
  const ownFoods = foods.filter((f) => f.source === 'own').length
  const next = game && !sheetOpen ? newlyUnlocked(game, statsOf(game, ownFoods))[0] : undefined

  return (
    <AnimatePresence>
      {next && game && (
        <UnlockCard key={next.id} a={next} progress={achievementProgress(next, statsOf(game, ownFoods), game)} />
      )}
    </AnimatePresence>
  )
}

function UnlockCard({ a, progress }: { a: Achievement; progress: { current: number; goal: number } }) {
  const g = GROUPS[a.group]
  const tier = TIERS[a.tier]
  const [busy, setBusy] = useState(false)
  useSheetFlag(true)

  useEffect(() => {
    const colors = [cssColor(g.color), cssColor('var(--coin)'), '#ffffff']
    void import('canvas-confetti').then(({ default: confetti }) =>
      confetti({ particleCount: 70, spread: 80, startVelocity: 42, origin: { x: 0.5, y: 0.42 }, colors, zIndex: 95, disableForReducedMotion: true }),
    )
    // Вібрація лише після першої взаємодії зі сторінкою (інакше браузер її блокує).
    if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.([40, 30, 80])
  }, [g.color])

  const claim = () => {
    setBusy(true)
    void claimAchievementReward(a.id).catch(() => setBusy(false))
  }

  return (
    <motion.div
      className="fixed inset-0 z-[85] flex items-center justify-center bg-black/80 px-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`ach-${a.id}`}
    >
      <motion.div
        initial={{ scale: 0.7, y: 50, opacity: 0 }}
        animate={{ scale: 1, y: 0, opacity: 1 }}
        exit={{ scale: 0.85, y: 20, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        className="card relative w-full max-w-[350px] overflow-hidden rounded-3xl px-6 pt-7 pb-5 text-center"
      >
        {/* Світіння кольору групи зверху */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-24 h-64"
          style={{ background: `radial-gradient(closest-side, color-mix(in oklab, ${g.color} 38%, transparent), transparent)` }}
        />

        <p className="relative flex items-center justify-center gap-1.5 text-[11px] font-bold tracking-[0.25em] uppercase" style={{ color: g.color }}>
          <Sparkles className="size-3.5" /> Досягнення отримано
        </p>

        {/* Значок: промені, що обертаються, і медаль з іконкою групи */}
        <div className="relative mx-auto mt-4 flex size-40 items-center justify-center">
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full"
            style={{
              background: `repeating-conic-gradient(from 0deg, color-mix(in oklab, ${g.color} 40%, transparent) 0deg 9deg, transparent 9deg 24deg)`,
              maskImage: 'radial-gradient(circle, black 28%, transparent 70%)',
            }}
            animate={{ rotate: 360 }}
            transition={{ duration: 16, repeat: Infinity, ease: 'linear' }}
          />
          <motion.span
            initial={{ scale: 0, rotate: -25 }}
            animate={{ scale: [0, 1.2, 1], rotate: 0 }}
            transition={{ delay: 0.12, duration: 0.65 }}
            className="relative flex size-24 items-center justify-center rounded-[28px] text-white ring-4"
            style={{
              background: `linear-gradient(145deg, ${g.color}, color-mix(in oklab, ${g.color} 45%, black))`,
              boxShadow: `0 12px 40px -6px ${g.color}, inset 0 2px 0 rgb(255 255 255 / 0.35)`,
              // кільце кольору рівня: бронза / срібло / золото / діамант
              ['--tw-ring-color' as string]: tier.color,
            }}
          >
            <AchievementIcon a={a} className="size-12" strokeWidth={1.8} />
          </motion.span>
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              aria-hidden
              className="absolute text-coin"
              style={{ top: ['10%', '18%', '70%'][i], left: ['16%', '78%', '82%'][i] }}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1, 0.8, 1], opacity: [0, 1, 0.6, 1] }}
              transition={{ delay: 0.4 + i * 0.15, duration: 1.4, repeat: Infinity, repeatDelay: 1 }}
            >
              <Star className="size-4 fill-current" />
            </motion.span>
          ))}
        </div>

        <div className="relative mt-3 flex justify-center gap-1.5">
          <span className={`inline-flex rounded-full px-3 py-1 text-[11px] font-bold ring-1 ring-inset ${g.tint}`}>{g.title}</span>
          <span
            className="inline-flex rounded-full px-3 py-1 text-[11px] font-bold tracking-wide uppercase ring-1 ring-inset"
            style={{ color: tier.color, ['--tw-ring-color' as string]: `color-mix(in oklab, ${tier.color} 45%, transparent)` }}
          >
            {tier.label}
          </span>
        </div>
        <h2 id={`ach-${a.id}`} className="relative mt-2 text-2xl font-bold">
          {a.title}
        </h2>
        <p className="relative text-sm text-muted">{a.description}</p>

        <div className="relative mt-4 flex flex-col gap-1 text-left">
          <ProgressBar value={progress.current} max={progress.goal} barClassName={g.bar} className="h-2.5" />
          <span className="text-right text-[11px] text-muted">
            {int(progress.current)} / {int(progress.goal)}
          </span>
        </div>

        <div className="relative mt-3 flex justify-center">
          <motion.span
            initial={{ opacity: 0, y: 10, scale: 0.8 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.45, type: 'spring', stiffness: 300, damping: 14 }}
            className="flex items-center gap-2 rounded-full bg-coin/15 px-5 py-2 text-lg font-bold text-coin ring-1 ring-inset ring-coin/30"
            style={{ boxShadow: '0 0 24px -8px var(--coin)' }}
          >
            +{int(a.reward)} <CoinIcon className="size-6" />
          </motion.span>
        </div>

        <motion.button
          type="button"
          onClick={claim}
          disabled={busy}
          whileTap={{ scale: 0.97 }}
          autoFocus
          className="bg-accent-gradient glow relative mt-5 h-12 w-full rounded-2xl font-bold text-white disabled:opacity-60"
        >
          Забрати нагороду
        </motion.button>
        <button
          type="button"
          onClick={() => dismissAchievement(a.id)}
          className="relative mt-1 h-11 w-full rounded-2xl text-sm text-muted active:bg-white/5"
        >
          Пізніше
        </button>
      </motion.div>
    </motion.div>
  )
}
