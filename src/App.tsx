import { AnimatePresence, motion, type PanInfo } from 'framer-motion'
import { CloudOff, Plus } from 'lucide-react'
import { useEffect } from 'react'
import { MEAL_TYPES } from '@shared/model.js'
import { ThemeEffects } from '@/components/ThemeEffects'
import { Toast } from '@/components/Toast'
import { loadDay, useDay } from '@/data/store'
import { BodyCard } from '@/features/body/BodyCard'
import { DailySummary } from '@/features/DailySummary'
import { DateHeader } from '@/features/DateHeader'
import { DevPanel } from '@/features/dev/DevPanel'
import { AchievementUnlockModal } from '@/features/game/AchievementUnlockModal'
import { RewardFeed } from '@/features/game/RewardFeed'
import { StreakNotice } from '@/features/game/StreakNotice'
import { MealSection } from '@/features/MealSection'
import { ModalHost } from '@/features/ModalHost'
import { cn } from '@/lib/cn'
import { haptic } from '@/lib/haptics'
import { mealByTime, useUiStore } from '@/store/ui'

/** Свайп по дню: вліво — наступний, вправо — попередній. */
const SWIPE_DISTANCE = 70
const SWIPE_VELOCITY = 400

const slide = {
  enter: (dir: number) => ({ x: dir * 48, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir * -48, opacity: 0 }),
}

/** Поява карток по черзі — лише при відкритті застосунку, не при кожній зміні дня. */
let introPlayed = false
const intro = {
  hidden: { opacity: 0, y: 24, scale: 0.97 },
  show: (i: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { delay: 0.05 + i * 0.07, type: 'spring' as const, stiffness: 260, damping: 26 },
  }),
}

export default function App() {
  const date = useUiStore((s) => s.selectedDate)
  const direction = useUiStore((s) => s.direction)
  const shiftDate = useUiStore((s) => s.shiftDate)
  const openModal = useUiStore((s) => s.openModal)
  const day = useDay(date)
  useEffect(() => {
    introPlayed = true
  }, [])
  const isEmpty = day.loaded && day.entries.length === 0

  const onSwipe = (_: unknown, info: PanInfo) => {
    const { offset, velocity } = info
    if (Math.abs(offset.y) > Math.abs(offset.x)) return // це був скрол
    if (offset.x < -SWIPE_DISTANCE || velocity.x < -SWIPE_VELOCITY) {
      haptic()
      shiftDate(1)
    } else if (offset.x > SWIPE_DISTANCE || velocity.x > SWIPE_VELOCITY) {
      haptic()
      shiftDate(-1)
    }
  }

  return (
    <div className="relative mx-auto flex w-full max-w-[480px] flex-col gap-4 overflow-x-clip px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
      <DateHeader />
      <StreakNotice />

      {day.error && (
        <button
          type="button"
          onClick={() => void loadDay(date)}
          className="flex items-center gap-2 rounded-2xl border border-warning/40 bg-warning/10 px-4 py-3 text-left text-sm text-warning"
        >
          <CloudOff className="size-5 shrink-0" />
          {day.loaded ? 'Немає зв’язку з сервером — дані можуть бути застарілими.' : 'Не вдалося завантажити день.'}{' '}
          Натисніть, щоб повторити.
        </button>
      )}

      {/* Свайп по дню: лише розпізнаємо жест (без перетягування); вертикальний скрол — за браузером */}
      <motion.div
        onPanEnd={onSwipe}
        style={{ touchAction: 'pan-y' }}
        className={cn('relative flex flex-col gap-4 transition-opacity', !day.loaded && 'opacity-50')}
      >
        {/* Дашборд не перебудовується між днями: дуга й числа плавно перетікають з попереднього дня */}
        <motion.div custom={0} variants={intro} initial={introPlayed ? false : 'hidden'} animate="show">
          <DailySummary entries={day.entries} />
        </motion.div>

        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <motion.div
            key={date}
            custom={direction}
            variants={slide}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'spring', stiffness: 420, damping: 40 }}
            className="flex flex-col gap-4"
          >
            {MEAL_TYPES.map((meal, i) => (
              <motion.div
                key={meal}
                custom={i + 1}
                variants={intro}
                initial={introPlayed ? false : 'hidden'}
                animate="show"
              >
                <MealSection meal={meal} entries={day.entries.filter((e) => e.meal === meal)} />
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>
      </motion.div>

      {/* Особисті параметри — не залежать від дня, тому поза каруселлю днів */}
      <motion.div custom={5} variants={intro} initial={introPlayed ? false : 'hidden'} animate="show">
        <BodyCard />
      </motion.div>

      {/* Головна дія — в зоні великого пальця */}
      <motion.button
        type="button"
        aria-label="Додати їжу"
        // onTap (pointer events), а не onClick: одразу після швидкого свайпу Chrome
        // не генерує click — вважає тап зупинкою інерції, і кнопка «не реагувала».
        onTap={() => openModal({ type: 'add', meal: mealByTime() })}
        whileTap={{ scale: 0.9 }}
        className="glow bg-accent-gradient fixed right-5 bottom-[calc(1.25rem+env(safe-area-inset-bottom))] z-30 flex size-16 items-center justify-center rounded-full text-white"
      >
        {/* Порожній день — кнопка м'яко «кличе» хвилями */}
        {isEmpty &&
          [0, 1].map((i) => (
            <motion.span
              key={i}
              aria-hidden
              className="absolute inset-0 rounded-full border-2 border-primary"
              initial={{ scale: 1, opacity: 0 }}
              animate={{ scale: 1.7, opacity: [0, 0.5, 0] }}
              transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 1.2, delay: i * 0.6, ease: 'easeOut' }}
            />
          ))}
        <Plus className="relative size-8" strokeWidth={2.5} />
      </motion.button>

      <ModalHost />
      <Toast />
      <RewardFeed />
      <AchievementUnlockModal />
      <DevPanel />
      <ThemeEffects />
    </div>
  )
}
