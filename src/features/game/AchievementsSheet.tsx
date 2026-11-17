import { AnimatePresence, motion } from 'framer-motion'
import { Check, ChevronLeft, ChevronRight, Flame, Lock, PartyPopper, Sparkles } from 'lucide-react'
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
import { useOnline } from '@/lib/online'
import { useGameUi } from '@/store/gameUi'
import { AchievementIcon } from './AchievementIcon'
import { claimableAchievements } from './useClaimableCount'
import { GROUP_ORDER, GROUPS, TIERS } from './achievementStyle'

type Filter = AchievementGroup | 'all'
/** open — ще не отримані (з прогресом і «Забрати»), claimed — список уже отриманих */
type View = 'open' | 'claimed'

/**
 * Вітрина досягнень: лише ще не отримані — з прогресом і кнопкою «Забрати нагороду».
 * Отримані — окремим списком за тапом на плашку «Отримано».
 */
export function AchievementsSheet() {
  const game = useGame()
  const foods = useFoods()
  const [filter, setFilter] = useState<Filter>('all')
  const [view, setView] = useState<View>('open')
  if (!game) return <p className="py-10 text-center text-sm text-muted">Завантаження…</p>

  const stats = statsOf(game, foods.filter((f) => f.source === 'own').length)
  const claimedCount = ACHIEVEMENTS.filter((a) => a.id in game.claimed).length
  const claimable = claimableAchievements(game, foods.filter((f) => f.source === 'own').length)
  const claimableIn = (group: AchievementGroup | 'all') =>
    group === 'all' ? claimable.length : claimable.filter((a) => a.group === group).length
  const groups = filter === 'all' ? GROUP_ORDER : [filter]

  if (view === 'claimed') {
    return (
      <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-4 pb-4">
        <button
          type="button"
          onClick={() => setView('open')}
          className="flex items-center gap-1 self-start rounded-full bg-white/[0.05] py-2 pr-4 pl-2.5 text-sm font-bold active:bg-white/10"
        >
          <ChevronLeft className="size-4" /> Не отримані
        </button>
        <h3 className="flex items-center gap-2 text-sm font-bold">
          <Sparkles className="size-4 text-primary" /> Отримано {claimedCount} з {ACHIEVEMENTS.length}
        </h3>
        {claimedCount === 0 ? (
          <p className="rounded-2xl bg-white/[0.03] px-4 py-8 text-center text-sm text-muted">Ще жодного — усе попереду!</p>
        ) : (
          GROUP_ORDER.map((group) => <Category key={group} group={group} stats={stats} game={game} mode="claimed" />)
        )}
      </motion.div>
    )
  }

  const left = ACHIEVEMENTS.filter((a) => !(a.id in game.claimed) && (filter === 'all' || a.group === filter)).length

  return (
    <div className="flex flex-col gap-4 pb-4">
      <Summary game={game} claimed={claimedCount} onClaimed={() => setView('claimed')} />

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
        <Category key={group} group={group} stats={stats} game={game} mode="open" />
      ))}
      {left === 0 && (
        <p className="flex flex-col items-center gap-2 rounded-2xl bg-white/[0.03] px-4 py-8 text-center text-sm text-muted">
          <PartyPopper className="size-6 text-primary" />
          Тут усе отримано — загляньте в «Отримано»
        </p>
      )}
    </div>
  )
}

function Category({ group, stats, game, mode }: { group: AchievementGroup; stats: AchievementStats; game: GameState; mode: View }) {
  const all = ACHIEVEMENTS.filter((a) => a.group === group)
  const done = all.filter((a) => a.id in game.claimed).length
  const items = all.filter((a) => (a.id in game.claimed) === (mode === 'claimed'))
  if (items.length === 0) return null
  const g = GROUPS[group]
  const Icon = g.icon
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-xs font-bold tracking-wider text-muted uppercase">
        <Icon className="size-4" style={{ color: g.color }} />
        {g.title}
        <span className="ml-auto font-normal normal-case">
          {done} / {all.length}
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

function Summary({ game, claimed, onClaimed }: { game: GameState; claimed: number; onClaimed: () => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {/* «Отримано» — кнопка: відкриває список уже отриманих досягнень */}
      <motion.button
        type="button"
        onClick={onClaimed}
        whileTap={{ scale: 0.96 }}
        aria-label={`Отримано ${claimed} з ${ACHIEVEMENTS.length}: показати отримані`}
        className="card flex items-center gap-1 rounded-2xl px-3 py-2.5 text-left ring-1 ring-inset ring-primary/25"
      >
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-center gap-1 text-[11px] text-muted">
            <Sparkles className="size-4 text-primary" /> Отримано
          </span>
          <span className="text-base font-bold">
            {claimed} / {ACHIEVEMENTS.length}
          </span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-primary" />
      </motion.button>
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
  const online = useOnline()
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
            disabled={!claimable || busy || !online}
            onClick={claim}
            whileTap={claimable ? { scale: 0.96 } : {}}
            exit={{ opacity: 0, scale: 0.9 }}
            className={cn(
              'relative flex h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold transition',
              claimable ? 'bg-accent-gradient glow text-white' : 'bg-white/[0.04] text-muted',
            )}
          >
            {claimable ? (online ? 'Забрати нагороду' : 'Потрібен інтернет') : 'Ще не досягнуто'}
          </motion.button>
        )}
      </AnimatePresence>
    </motion.article>
  )
}
