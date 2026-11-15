import { lazy, Suspense, useState } from 'react'
import { newlyUnlocked, statsOf } from '@shared/achievements.js'
import { useDataStore } from '@/data/store'
import { useGameUi } from '@/store/gameUi'

/*
 * Рідкісні оверлеї — окремими чанками: модалка нової ачівки (з ~30 іконками ачівок
 * і конфеті) та плашка примірки теми. Головний екран їх не вантажить, поки вони не знадобляться;
 * після першого показу компонент лишається змонтованим — щоб відпрацювали анімації закриття.
 */
const AchievementUnlockModal = lazy(() =>
  import('./AchievementUnlockModal').then((m) => ({ default: m.AchievementUnlockModal })),
)
const TryOnBanner = lazy(() => import('./TryOnBanner').then((m) => ({ default: m.TryOnBanner })))

/** Монтує компонент із першого разу, коли when стало true, і більше не розмонтовує. */
function useSticky(when: boolean): boolean {
  const [on, setOn] = useState(when)
  if (when && !on) setOn(true)
  return on || when
}

export function LazyOverlays() {
  const hasUnlock = useDataStore((s) => {
    const game = s.game
    if (!game) return false
    const own = s.foods.filter((f) => f.source === 'own').length
    return newlyUnlocked(game, statsOf(game, own)).length > 0
  })
  const tryOn = useGameUi((s) => s.tryOn !== null)
  const showUnlock = useSticky(hasUnlock)
  const showTryOn = useSticky(tryOn)

  return (
    <Suspense fallback={null}>
      {showTryOn && <TryOnBanner />}
      {showUnlock && <AchievementUnlockModal />}
    </Suspense>
  )
}
