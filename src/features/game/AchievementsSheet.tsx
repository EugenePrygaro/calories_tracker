import { AnimatePresence, motion } from 'framer-motion'
import { Check, Flame, Lock, Sparkles } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import {
  ACHIEVEMENTS,
  achievementProgress,
  statsOf,
  type Achievement,
  type AchievementGroup,
  type AchievementStats,
} from '@shared/achievements.js'
import type { GameState } from '@shared/game.js'
import { CoinIcon } from '@/components/CoinIcon'
import { ProgressBar } from '@/components/ProgressBar'
import { gameAction, useFoods, useGame } from '@/data/store'
import { cn } from '@/lib/cn'
import { int } from '@/lib/format'
import { useGameUi } from '@/store/gameUi'
import { AchievementIcon } from './AchievementIcon'
import { claimableAchievements } from './useClaimableCount'
import { GROUP_ORDER, GROUPS, TIERS } from './achievementStyle'

type Filter = AchievementGroup | 'all'

/** Вітрина досягнень: категорії, прогрес і кнопка «Забрати нагороду». */
export function AchievementsSheet() {
  const game = useGame()
  const foods = useFoods()
  const [filter, setFilter] = useState<Filter>('all')
  if (!game) return <p className="py-10 text-center text-sm text-muted">Завантаження…</p>

  const stats = statsOf(game, foods.filter((f) => f.source === 'own').length)
  const claimedCount = ACHIEVEMENTS.filter((a) => a.id in game.claimed).length
  const claimable = claimableAchievements(game, foods.filter((f) => f.source === 'own').length)
  const claimableIn = (group: AchievementGroup | 'all') =>
    group === 'all' ? claimable.length : claimable.filter((a) => a.group === group).length
  const groups = filter === 'all' ? GROUP_ORDER : [filter]

  return (
    <div className="flex flex-col gap-4 pb-4">
      <Summary game={game} claimed={claimedCount} />

      {/* Фільтр за категоріями */}
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        <FilterChip active={filter === 'all'} onClick={() => setFilter('all')} badge={claimableIn('all')}>
          Усі
        </FilterChip>
        {GROUP_ORDER.map((g) => {
          const Icon = GROUPS[g].icon
          return (
            <FilterChip key={g} active={filter === g} onClick={() => setFilter(g)} badge={claimableIn(g)}>
              <Icon className="size-3.5" /> {GROUPS[g].title}
            </FilterChip>
          )
        })}
      </div>

      {groups.map((group) => (
        <Category key={group} group={group} stats={stats} game={game} />
      ))}
    </div>
  )
}

function Category({ group, stats, game }: { group: AchievementGroup; stats: AchievementStats; game: GameState }) {
  const items = ACHIEVEMENTS.filter((a) => a.group === group)
  const done = items.filter((a) => a.id in game.claimed).length
  const g = GROUPS[group]
  const Icon = g.icon
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-xs font-bold tracking-wider text-muted uppercase">
        <Icon className="size-4" style={{ color: g.color }} />
        {g.title}
        <span className="ml-auto font-normal normal-case">
          {done} / {items.length}
        </span>
      </h3>
      {items.map((a, i) => (
        <AchievementCard key={a.id} a={a} progress={achievementProgress(a, stats, game)} index={i} />
      ))}
    </section>
  )
}

function FilterChip({ active, onClick, badge, children }: { active: boolean; onClick: () => void; badge: number; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold whitespace-nowrap ring-1 ring-inset transition-colors',
        active ? 'bg-primary/15 text-primary ring-primary/40' : 'bg-white/[0.04] text-muted ring-white/[0.06]',
      )}
    >
      {children}
      {badge > 0 && (
        <span className="flex size-4 items-center justify-center rounded-full bg-danger text-[10px] text-white">{badge}</span>
      )}
    </button>
  )
}

function Summary({ game, claimed }: { game: GameState; claimed: number }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <SummaryTile label="Отримано" value={`${claimed} / ${ACHIEVEMENTS.length}`} icon={<Sparkles className="size-4 text-primary" />} />
      <SummaryTile label="Рекорд серії" value={`${game.bestStreak} дн.`} icon={<Flame className="size-4 text-streak" />} />
    </div>
  )
}

function SummaryTile({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="card flex flex-col gap-1 rounded-2xl px-3 py-2.5">
      <span className="flex items-center gap-1 text-[11px] text-muted">
        {icon} {label}
      </span>
      <span className="text-base font-bold">{value}</span>
    </div>
  )
}

interface CardProps {
  a: Achievement
  progress: { current: number; goal: number; reached: boolean; claimed: boolean }
  index: number
}

function AchievementCard({ a, progress, index }: CardProps) {
  const [busy, setBusy] = useState(false)
  const reveal = useGameUi((s) => s.revealIcons)
  const g = GROUPS[a.group]
  const tier = TIERS[a.tier]
  const claimable = progress.reached && !progress.claimed
  const showIcon = progress.reached || reveal

  const claim = () => {
    setBusy(true)
    void gameAction({ action: 'claim', id: a.id })
      .catch(() => {})
      .finally(() => setBusy(false))
  }

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: (index % 6) * 0.04 }}
      className={cn(
        'card relative flex flex-col gap-3 overflow-hidden rounded-2xl p-4',
        claimable && 'ring-1 ring-primary/50',
      )}
    >
      {/* Готова до отримання — м'яке світіння */}
      {claimable && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-primary/10"
          animate={{ opacity: [0.3, 0.8, 0.3] }}
          transition={{ duration: 2.2, repeat: Infinity }}
        />
      )}

      <div className="relative flex items-center gap-3">
        <span
          className={cn(
            'flex size-12 shrink-0 items-center justify-center rounded-2xl ring-2 ring-inset',
            progress.reached ? g.tint : 'bg-white/[0.04] text-muted ring-white/[0.06]',
          )}
          // кільце кольору рівня (бронза/срібло/золото/діамант), коли ачівку досягнуто
          style={progress.reached ? { ['--tw-ring-color' as string]: tier.color } : undefined}
        >
          {showIcon ? <AchievementIcon a={a} className="size-6" /> : <Lock className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <span
            className="mb-0.5 inline-block rounded-full px-1.5 text-[10px] font-bold tracking-wide uppercase ring-1 ring-inset"
            style={{ color: tier.color, ['--tw-ring-color' as string]: `color-mix(in oklab, ${tier.color} 45%, transparent)` }}
          >
            {tier.label}
          </span>
          <p className="font-bold leading-tight">{a.title}</p>
          <p className="text-xs text-muted">{a.description}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-coin/10 px-2 py-1 text-xs font-bold text-coin ring-1 ring-inset ring-coin/25">
          +{int(a.reward)} <CoinIcon className="size-4" strokeWidth={2.2} />
        </span>
      </div>

      <div className="relative flex flex-col gap-1">
        <ProgressBar value={progress.current} max={progress.goal} barClassName={g.bar} sheenDelay={(index % 5) * 0.6} label={a.title} />
        <span className="text-right text-[11px] text-muted">
          {int(progress.current)} / {int(progress.goal)}
        </span>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {progress.claimed ? (
          <motion.span
            key="claimed"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative flex h-11 items-center justify-center gap-2 rounded-xl bg-white/[0.04] text-sm text-muted"
          >
            <Check className="size-4 text-primary" /> Нагороду отримано
          </motion.span>
        ) : (
          <motion.button
            key="claim"
            type="button"
            disabled={!claimable || busy}
            onClick={claim}
            whileTap={claimable ? { scale: 0.96 } : {}}
            exit={{ opacity: 0, scale: 0.9 }}
            className={cn(
              'relative flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold transition',
              claimable ? 'bg-accent-gradient glow text-white' : 'bg-white/[0.04] text-muted',
            )}
          >
            {claimable ? 'Забрати нагороду' : 'Ще не досягнуто'}
          </motion.button>
        )}
      </AnimatePresence>
    </motion.article>
  )
}
