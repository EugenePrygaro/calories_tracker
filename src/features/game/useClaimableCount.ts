import { ACHIEVEMENTS, achievementProgress, statsOf, type Achievement } from '@shared/achievements.js'
import type { GameState } from '@shared/game.js'
import { useFoods, useGame } from '@/data/store'

/** Ачівки, за які нагорода вже заслужена, але ще не забрана. */
export function claimableAchievements(game: GameState, ownFoods: number): Achievement[] {
  const stats = statsOf(game, ownFoods)
  return ACHIEVEMENTS.filter((a) => {
    const p = achievementProgress(a, stats, game)
    return p.reached && !p.claimed
  })
}

/** Скільки ачівок можна забрати просто зараз. */
export function useClaimableCount(): number {
  const game = useGame()
  const foods = useFoods()
  if (!game) return 0
  return claimableAchievements(game, foods.filter((f) => f.source === 'own').length).length
}
