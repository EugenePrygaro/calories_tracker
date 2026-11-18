import { motion } from 'framer-motion'
import { ChevronRight, Flame, Gift, LoaderCircle, Snowflake, Trophy } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { REWARDS } from '@shared/game.js'
import {
  daysWord,
  nextStreakAchievement,
  streakChain,
  streakStatus,
  type ChainDay,
  type StreakStatus,
} from '@shared/streak.js'
import { CoinIcon } from '@/components/CoinIcon'
import { activateShopItem, useGame } from '@/data/store'
import { cn } from '@/lib/cn'
import { fromDateKey, toDateKey } from '@/lib/date'
import { useOnline } from '@/lib/online'
import { useDaySummaries } from '@/lib/stats'
import { useUiStore } from '@/store/ui'
import { flameFill, flameStyle, flameTier, nextFlameTier } from './flameTier'

const WEEK = 7
const dayLetter = (key: string) => fromDateKey(key).toLocaleDateString('uk-UA', { weekday: 'narrow' })

/** «1 заморозку», «2 заморозки», «5 заморозок». */
const PLURAL = new Intl.PluralRules('uk')
const freezesWord = (n: number) => {
  const rule = PLURAL.select(n)
  return rule === 'one' ? 'заморозку' : rule === 'few' ? 'заморозки' : 'заморозок'
}

/** Шторка «Серія»: чи зараховано сьогодні, ланцюжок днів, тижневий бонус, рекорд, заморозки й повернення серії. */
export function StreakSheet() {
  const game = useGame()
  const summaries = useDaySummaries()
  const openModal = useUiStore((s) => s.openModal)
  const online = useOnline()
  const [busy, setBusy] = useState(false)
  const today = toDateKey()

  if (!game) {
    return (
      <div className="flex flex-1 items-center justify-center py-16 text-muted">
        <LoaderCircle className="size-6 animate-spin" />
      </div>
    )
  }

  const status = streakStatus(game, today)
  // дні із записами: підсумки днів + остання активність за даними гри (вона точно зарахована);
  // сьогодні — лише якщо сервер уже зарахував (запис із офлайн-черги ще не рахується)
  const active = new Set(summaries.keys())
  if (game.lastActiveDate) active.add(game.lastActiveDate)
  if (status.kind !== 'done') active.delete(today)
  const chain = streakChain({ active, state: game, today, days: WEEK * 2 })

  // серія, яку вже не врятувати, наступним записом почнеться з 1
  const alive = status.kind !== 'lost' && status.kind !== 'none'
  const current = alive ? game.streak : 0
  const inWeek = current % WEEK
  const toBonus = WEEK - inWeek
  const next = nextStreakAchievement(game.bestStreak)
  const nextColor = nextFlameTier(current)
  const tierStreak = current || game.streak
  const hot = status.kind === 'done' && flameTier(tierStreak).heat >= 2
  const lost = game.lostStreak
  const superFlames = game.inventory.superFlame

  const restore = () => {
    setBusy(true)
    void activateShopItem('superFlame')
      .catch(() => {}) // причину покаже тост
      .finally(() => setBusy(false))
  }

  return (
    <div className="flex flex-col gap-4 pb-6" style={flameStyle(tierStreak)}>
      {/* Герой: велике число й стан сьогоднішнього дня */}
      <div className="flex flex-col items-center gap-1 pt-2 text-center">
        <motion.span
          key={status.kind}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 16 }}
          className="relative flex"
        >
          {/* гарячий вогник (30+ днів) — з жаром довкола */}
          {hot && (
            <span
              aria-hidden
              className="absolute -inset-5 rounded-full"
              style={{ background: 'radial-gradient(circle, color-mix(in oklab, var(--color-streak) 38%, transparent), transparent 68%)' }}
            />
          )}
          <Flame
            className={cn('relative size-16', status.kind === 'done' ? `${flameFill(tierStreak)} text-streak` : 'text-muted/60')}
            strokeWidth={1.6}
          />
        </motion.span>
        <p className={cn('text-5xl leading-none font-bold', !alive && 'text-muted')}>{game.streak}</p>
        <p className="text-sm text-muted">{daysWord(game.streak)} поспіль</p>
        <StatusLine status={status} shields={game.shields} />
      </div>

      {/* Ланцюжок за два тижні */}
      <Card>
        <div className="grid grid-cols-7 gap-y-2">
          {chain.map((d) => (
            <ChainCell key={d.date} day={d} today={today} fill={flameFill(tierStreak)} />
          ))}
        </div>
        <p className="flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-muted">
          <Legend icon={<Flame className="size-3 fill-streak/40 text-streak" />}>запис</Legend>
          <Legend icon={<Gift className="size-3 text-primary" />}>безкоштовний пропуск</Legend>
          <Legend icon={<Snowflake className="size-3 text-sky-300" />}>заморозка</Legend>
        </p>
      </Card>

      {/* Тижневий бонус */}
      <Card>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-bold">Тижневий бонус</h3>
          <span className="flex items-center gap-1 text-sm font-bold text-coin">
            +{REWARDS.streakWeek} <CoinIcon className="size-4" />
          </span>
        </div>
        <div className="flex gap-1.5">
          {Array.from({ length: WEEK }, (_, i) => (
            <span key={i} className={cn('h-2.5 flex-1 rounded-full', i < inWeek ? 'bg-streak' : 'bg-white/[0.08]')} />
          ))}
        </div>
        <p className="text-xs text-muted">
          Ще {toBonus} {daysWord(toBonus)} серії — і +{REWARDS.streakWeek} калокоїнів (кожні {WEEK} днів поспіль)
        </p>
      </Card>

      {/* Рекорд і наступна ачівка */}
      <Card>
        <Row icon={<Trophy className="size-5 text-coin" />} label="Рекорд">
          {game.bestStreak} {daysWord(game.bestStreak)}
          {alive && current > 0 && current >= game.bestStreak && <span className="ml-1 text-xs text-coin">— це зараз!</span>}
        </Row>
        {/* Наступна ціль: ачівка за серію; якщо на тій самій межі змінюється й колір вогника — разом */}
        {next && (
          <Row
            icon={
              <Flame
                className="size-5 text-streak"
                style={nextColor?.from === next.goal && nextColor.color ? { color: nextColor.color } : undefined}
              />
            }
            label={
              nextColor?.from === next.goal ? `${next.title} · ${nextColor.name.toLowerCase()} вогник` : next.title
            }
          >
            ще {Math.max(1, next.goal - current)} {daysWord(Math.max(1, next.goal - current))}
          </Row>
        )}
        {nextColor && nextColor.from !== next?.goal && (
          <Row
            icon={<Flame className="size-5 text-streak" style={nextColor.color ? { color: nextColor.color } : undefined} />}
            label={`${nextColor.name} вогник`}
          >
            ще {nextColor.from - current} {daysWord(nextColor.from - current)}
          </Row>
        )}
      </Card>

      {/* Заморозки */}
      <Card>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold">Заморозки</h3>
          <span className="flex gap-1" aria-label={`Заморозок ${game.shields} з ${game.shieldSlots}`}>
            {Array.from({ length: game.shieldSlots }, (_, i) => (
              <Snowflake key={i} className={cn('size-5', i < game.shields ? 'text-sky-300' : 'text-white/15')} />
            ))}
          </span>
        </div>
        <p className="text-xs text-muted">
          Перший пропущений день — безкоштовно, кожен наступний закриває одна заморозка. Витрачаються самі.
        </p>
        <LinkButton onClick={() => openModal({ type: 'shop' })}>Купити в магазині</LinkButton>
      </Card>

      {/* Обірвана серія — «Супер вогник» */}
      {lost && (
        <Card tone="streak">
          <h3 className="text-sm font-bold">
            Обірвана серія: {lost.value} {daysWord(lost.value)}
          </h3>
          <p className="text-xs text-muted">
            «Супер вогник» поверне її й додасть до поточної: {lost.value} + {game.streak} ={' '}
            {lost.value + game.streak} {daysWord(lost.value + game.streak)}.
          </p>
          {superFlames > 0 ? (
            <button
              type="button"
              disabled={busy || !online}
              onClick={restore}
              className="bg-accent-gradient glow h-11 rounded-2xl font-bold text-white disabled:opacity-50"
            >
              {online ? 'Повернути серію' : 'Потрібен інтернет'}
            </button>
          ) : (
            <LinkButton onClick={() => openModal({ type: 'shop' })}>«Супер вогник» у магазині</LinkButton>
          )}
        </Card>
      )}
    </div>
  )
}

function StatusLine({ status, shields }: { status: StreakStatus; shields: number }) {
  const { kind, missed, shieldsNeeded } = status
  const [tone, text] =
    kind === 'done'
      ? ['bg-streak/15 text-streak', '✓ Сьогодні зараховано']
      : kind === 'pending'
        ? ['bg-warning/15 text-warning', 'Сьогодні ще без запису — додай хоч щось, щоб серія не згоріла']
        : kind === 'saved'
          ? [
              'bg-warning/15 text-warning',
              shieldsNeeded === 0
                ? `Пропущено ${missed} ${daysWord(missed)} — це безкоштовно. Запиши сьогодні, і серія триватиме`
                : `Пропущено ${missed} ${daysWord(missed)}: запис сьогодні витратить ${shieldsNeeded} ${freezesWord(shieldsNeeded)} (є ${shields})`,
            ]
          : kind === 'lost'
            ? [
                'bg-danger/15 text-danger',
                `Пропущено ${missed} ${daysWord(missed)}, заморозок не вистачає — наступний запис почне нову серію`,
              ]
            : ['bg-white/[0.06] text-muted', 'Запиши першу страву — і серія почнеться']
  return <p className={cn('mt-2 rounded-full px-4 py-1.5 text-sm font-medium', tone)}>{text}</p>
}

function ChainCell({ day, today, fill }: { day: ChainDay; today: string; fill: string }) {
  const { kind, pending } = day
  return (
    <div className="flex flex-col items-center gap-1">
      <span
        className={cn(
          'flex size-9 items-center justify-center rounded-full',
          kind === 'active' && 'bg-streak/20',
          kind === 'old' && 'bg-white/[0.04]',
          kind === 'grace' && 'bg-primary/10',
          kind === 'shield' && 'bg-sky-400/10',
          kind === 'missed' && 'ring-1 ring-white/10 ring-inset',
          kind === 'today' && 'border-2 border-dashed border-streak/60',
          pending && 'border border-dashed border-white/25 opacity-50',
        )}
        title={day.date}
      >
        {kind === 'active' && <Flame className={cn('size-5 text-streak', fill)} />}
        {kind === 'old' && <Flame className="size-4 text-streak/30" />}
        {kind === 'grace' && <Gift className="size-4 text-primary" />}
        {kind === 'shield' && <Snowflake className="size-4 text-sky-300" />}
        {kind === 'today' && <Flame className="size-4 text-muted/50" />}
      </span>
      <span className={cn('text-[10px] uppercase', day.date === today ? 'font-bold text-fg' : 'text-muted')}>
        {dayLetter(day.date)}
      </span>
    </div>
  )
}

function Card({ children, tone }: { children: ReactNode; tone?: 'streak' }) {
  return (
    <section
      className={cn(
        'flex flex-col gap-3 rounded-2xl p-4 ring-1 ring-inset',
        tone === 'streak' ? 'bg-streak/10 ring-streak/25' : 'bg-white/[0.03] ring-white/[0.06]',
      )}
    >
      {children}
    </section>
  )
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      {icon}
      <span className="flex-1 text-sm">{label}</span>
      <span className="text-sm font-bold">{children}</span>
    </div>
  )
}

function Legend({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1">
      {icon}
      {children}
    </span>
  )
}

function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center gap-1 self-start text-sm font-bold text-primary">
      {children} <ChevronRight className="size-4" />
    </button>
  )
}
