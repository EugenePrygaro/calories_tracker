import { AnimatePresence, motion } from 'framer-motion'
import { Bug, X } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { ACHIEVEMENTS } from '@shared/achievements.js'
import type { DevOp } from '@/data/api'
import { gameAction, useDataStore, useGame } from '@/data/store'
import { GROUP_ORDER, GROUPS } from '@/features/game/achievementStyle'
import { ALL_THEMES, THEME_LOOK } from '@/features/game/themeStyle'
import { toDateKey } from '@/lib/date'
import { SOUND_LABELS, play, type SoundName } from '@/lib/sound'
import { useGameUi } from '@/store/gameUi'
import { useUiStore } from '@/store/ui'

/**
 * Інструменти для тестування гейміфікації. Монтується лише коли ввімкнено (див. devEnabled.ts).
 * Серверні dev-дії вимикаються змінною середовища DISABLE_DEV_TOOLS=1.
 */
export function DevPanel() {
  const sheetOpen = useUiStore((s) => s.modal !== null)
  const [open, setOpen] = useState(false)
  if (sheetOpen) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] left-4 z-[70] flex items-center gap-1 rounded-full border border-secondary/60 bg-card px-3 py-2 text-xs font-bold text-secondary shadow-lg"
      >
        <Bug className="size-4" /> DEV
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed inset-x-2 bottom-[calc(7.5rem+env(safe-area-inset-bottom))] z-[70] mx-auto flex max-h-[75dvh] max-w-[464px] flex-col rounded-2xl border border-secondary/60 bg-card shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-2">
              <b className="text-sm">DEV · гейміфікація</b>
              <button type="button" onClick={() => setOpen(false)} aria-label="Закрити" className="p-1">
                <X className="size-4" />
              </button>
            </div>
            <div className="flex flex-col gap-4 overflow-y-auto p-4 text-sm">
              <GameDev />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function GameDev() {
  const game = useGame()
  const [busy, setBusy] = useState(false)
  const [achievementId, setAchievementId] = useState(ACHIEVEMENTS[0]?.id ?? '')
  const revealIcons = useGameUi((s) => s.revealIcons)
  const setRevealIcons = useGameUi((s) => s.setRevealIcons)
  const themePreview = useGameUi((s) => s.themePreview)
  const setThemePreview = useGameUi((s) => s.setThemePreview)
  const run = (op: DevOp, amount = 0, id?: string) => {
    setBusy(true)
    void gameAction({ action: 'dev', op, amount, ...(id ? { id } : {}) })
      .catch(() => {})
      .finally(() => setBusy(false))
  }
  const today = toDateKey()

  return (
    <>
      {game && (
        <dl className="grid grid-cols-3 gap-x-3 gap-y-1 rounded-xl bg-white/[0.04] p-3 text-xs">
          <Stat k="Калокоїни" v={game.coins} />
          <Stat k="Стрік" v={`${game.streak} (рекорд ${game.bestStreak})`} />
          <Stat k="Щити" v={game.shields} />
          <Stat k="Остання активність" v={game.lastActiveDate ?? '—'} />
          <Stat k="Страв залоговано" v={game.entriesLogged} />
          <Stat k="Серія білка" v={`${game.proteinStreak} (рекорд ${game.bestProteinStreak})`} />
          <Stat k="Нагороди сьогодні" v={dayAwards(game.days[today])} />
        </dl>
      )}

      <Group title="Калокоїни">
        <B onClick={() => run('addCoins', 50)} busy={busy}>+50</B>
        <B onClick={() => run('addCoins', 100)} busy={busy}>+100</B>
        <B onClick={() => run('addCoins', 1000)} busy={busy}>+1000</B>
        <B onClick={() => run('addCoins', -100)} busy={busy}>−100</B>
      </Group>

      <Group title="Стрік і заморозки">
        <B onClick={() => run('addShields', 1)} busy={busy}>+1 щит</B>
        <B onClick={() => run('addShields', -1)} busy={busy}>−1 щит</B>
        <B onClick={() => run('setStreak', 6)} busy={busy}>Стрік = 6</B>
        <B onClick={() => run('setStreak', 29)} busy={busy}>Стрік = 29</B>
        <B onClick={() => run('setStreak', 0)} busy={busy}>Стрік = 0</B>
      </Group>

      <Group title="Звуки">
        {(Object.keys(SOUND_LABELS) as SoundName[]).map((name) => (
          <B key={name} onClick={() => play(name)} busy={false}>
            {SOUND_LABELS[name]}
          </B>
        ))}
      </Group>

      <Group title="Тема (перегляд без покупки, лише тут)">
        <select
          value={themePreview ?? ''}
          onChange={(e) => setThemePreview((e.target.value || null) as typeof themePreview)}
          aria-label="Тема"
          className="h-10 w-full rounded-lg bg-elevated px-2 text-base text-fg"
        >
          <option value="">Як у грі{game ? ` (${THEME_LOOK[game.activeTheme as keyof typeof THEME_LOOK]?.title ?? game.activeTheme})` : ''}</option>
          {ALL_THEMES.map((t) => (
            <option key={t} value={t}>
              {THEME_LOOK[t].title}
              {game && t !== 'default' && t in game.themes ? ' ✓' : ''}
            </option>
          ))}
        </select>
      </Group>

      <Group title="Ачівки">
        <select
          value={achievementId}
          onChange={(e) => setAchievementId(e.target.value)}
          aria-label="Ачівка"
          className="h-10 w-full rounded-lg bg-elevated px-2 text-base text-fg"
        >
          {GROUP_ORDER.map((group) => (
            <optgroup key={group} label={GROUPS[group].title}>
              {ACHIEVEMENTS.filter((a) => a.group === group).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title} — {a.description}
                  {game && a.id in game.claimed ? ' ✓' : ''}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <B onClick={() => run('unlockAchievement', 0, achievementId)} busy={busy}>Отримати (модалка)</B>
        <B onClick={() => run('relockAchievement', 0, achievementId)} busy={busy}>Скинути</B>
        <label className="flex w-full items-center gap-2 rounded-lg bg-elevated px-3 py-2 text-xs">
          <input
            type="checkbox"
            checked={revealIcons}
            onChange={(e) => setRevealIcons(e.target.checked)}
            className="size-4 accent-[var(--accent-primary)]"
          />
          Справжні іконки замість замочка у вітрині
        </label>
      </Group>

      <Group title="Остання активність (потім додайте їжу на сьогодні)">
        <B onClick={() => run('setLastActive', 1)} busy={busy}>Учора → +1</B>
        <B onClick={() => run('setLastActive', 2)} busy={busy}>Пропуск 1 дня</B>
        <B onClick={() => run('setLastActive', 3)} busy={busy}>Пропуск 2 днів</B>
        <B onClick={() => run('setLastActive', 4)} busy={busy}>Пропуск 3 днів</B>
        <B onClick={() => run('clearToday')} busy={busy}>Скинути денні нагороди</B>
      </Group>

      <Group title="Перегляд без змін на сервері">
        <B
          onClick={() => {
            if (!game) return
            useDataStore.setState({
              game: { ...game, notice: { date: today, missed: 1, usedShields: 1, streak: game.streak || 5 } },
            })
          }}
        >
          «Серію врятовано»
        </B>
        <B
          onClick={() =>
            useGameUi.getState().push([
              { type: 'reward', reason: 'meal', coins: 5, label: 'Сніданок' },
              { type: 'reward', reason: 'kcal', coins: 20, label: 'Денна норма калорій' },
            ])
          }
        >
          Спливаючі нагороди
        </B>
      </Group>

      <Group title="Небезпечно">
        <B
          danger
          busy={busy}
          onClick={() => {
            if (confirm('Скинути весь прогрес гри (калокоїни, стрік, ачівки)?')) run('reset')
          }}
        >
          Скинути гру
        </B>
      </Group>
    </>
  )
}

function dayAwards(day: { meals: string[]; protein: boolean; kcal: boolean } | undefined): string {
  if (!day) return '—'
  return [`${day.meals.length}/4 прийоми`, day.protein && 'білок', day.kcal && 'ккал'].filter(Boolean).join(', ')
}

function Stat({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-muted">{k}</dt>
      <dd className="truncate font-bold">{v}</dd>
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h4 className="text-[11px] font-bold tracking-wider text-muted uppercase">{title}</h4>
      <div className="flex flex-wrap gap-2">{children}</div>
    </section>
  )
}

function B({ children, onClick, busy = false, danger = false }: { children: ReactNode; onClick: () => void; busy?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className={
        danger
          ? 'h-9 rounded-lg bg-danger/15 px-3 text-xs font-bold text-danger disabled:opacity-40'
          : 'h-9 rounded-lg bg-elevated px-3 text-xs font-bold text-fg active:bg-line disabled:opacity-40'
      }
    >
      {children}
    </button>
  )
}
