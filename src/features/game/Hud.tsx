import { AnimatePresence, motion, type MotionStyle } from 'framer-motion'
import { Flame, Snowflake, Store, Trophy } from 'lucide-react'
import { AnimatedNumber } from '@/components/AnimatedNumber'
import { CoinIcon } from '@/components/CoinIcon'
import { useGame } from '@/data/store'
import { int } from '@/lib/format'
import { useGameUi } from '@/store/gameUi'
import { useUiStore } from '@/store/ui'
import { useClaimableCount } from './useClaimableCount'

/** HUD гейміфікації: баланс калокоїнів, серія днів (+щити-заморозки), ачівки. */
export function Hud() {
  const game = useGame()
  const openModal = useUiStore((s) => s.openModal)
  const claimable = useClaimableCount()
  const coins = game?.coins ?? 0
  const streak = game?.streak ?? 0
  const shields = game?.shields ?? 0

  return (
    <div className="card flex items-center gap-2 rounded-2xl p-2">
      {/* Гаманець — кнопка, що відкриватиме магазин */}
      <motion.button
        type="button"
        onClick={() => useGameUi.getState().info('Магазин скоро відкриється')}
        whileTap={{ scale: 0.96 }}
        aria-label={`Калокоїни: ${int(coins)}. Магазин`}
        // Рівна сірувата «таблетка» без відблиску зверху; лише блік, що пробігає (sheen)
        className="sheen flex h-12 min-w-0 flex-1 items-center gap-2.5 rounded-full py-1 pr-1.5 pl-1 text-left ring-1 ring-inset ring-white/[0.08]"
        style={
          {
            background: 'rgb(255 255 255 / 0.04)',
            '--sheen-delay': '3s',
          } as MotionStyle
        }
      >
        <span className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-main/70 ring-1 ring-inset ring-coin/40 [perspective:200px]">
          <motion.span
            key={coins} // монета перевертається, щойно баланс змінився
            initial={{ rotateY: 0, scale: 1 }}
            animate={{ rotateY: [0, 360], scale: [1, 1.18, 1] }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="flex text-coin"
            style={{ filter: 'drop-shadow(0 0 6px var(--coin))' }}
          >
            <CoinIcon className="size-6" />
          </motion.span>
        </span>
        <span className="relative flex min-w-0 flex-1 flex-col leading-tight">
          <span className="text-[10px] font-bold tracking-wider text-coin/80 uppercase">Калокоїни</span>
          <AnimatedNumber value={coins} format={int} className="truncate text-lg font-bold" />
        </span>
        <span className="relative flex size-8 shrink-0 items-center justify-center rounded-full bg-coin/20 text-coin ring-[1.5px] ring-inset ring-coin/70">
          <Store className="size-4" />
        </span>
      </motion.button>

      {/* Серія */}
      <span
        title={`Днів поспіль: ${streak}${shields ? ` · заморозок: ${shields}` : ''}`}
        className="flex h-10 shrink-0 items-center gap-1 rounded-full bg-streak/10 px-3 text-base font-bold ring-1 ring-inset ring-streak/25"
      >
        <motion.span
          key={streak} // одноразовий спалах при зміні серії (без нескінченної анімації)
          initial={{ scale: 1 }}
          animate={streak > 0 ? { scale: [1, 1.35, 1], rotate: [0, -10, 0] } : {}}
          transition={{ duration: 0.6 }}
          className="flex"
        >
          <Flame className={streak > 0 ? 'size-5 fill-streak/40 text-streak' : 'size-5 text-muted'} />
        </motion.span>
        {streak}
        {shields > 0 && (
          <span className="-mr-1 ml-1 flex items-center gap-0.5 rounded-full bg-shield/15 px-1.5 text-xs text-shield">
            <Snowflake className="size-3" />
            {shields}
          </span>
        )}
      </span>

      {/* Ачівки */}
      <motion.button
        type="button"
        onClick={() => openModal({ type: 'achievements' })}
        whileTap={{ scale: 0.88 }}
        aria-label={claimable > 0 ? `Досягнення: можна забрати ${claimable}` : 'Досягнення'}
        className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-coin ring-1 ring-inset ring-white/[0.06]"
      >
        <Trophy className="size-5" />
        <AnimatePresence>
          {claimable > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: [0, 1.3, 1] }}
              exit={{ scale: 0 }}
              className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-danger text-[10px] font-bold text-white"
            >
              {claimable}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  )
}
