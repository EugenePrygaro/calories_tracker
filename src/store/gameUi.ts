import { create } from 'zustand'
import type { GameEvent } from '@shared/game.js'

/**
 * Черга того, що треба показати після дій у грі: спливаючі нагороди.
 * Сам стан гри (монети, стрік…) — у src/data/store.ts.
 */
export interface RewardToast {
  id: number
  label: string
  coins: number
  tone: 'reward' | 'streak' | 'info'
}

interface GameUiState {
  toasts: RewardToast[]
  /** DEV: показувати справжні іконки замість замочка у вітрині ачівок */
  revealIcons: boolean
  setRevealIcons: (value: boolean) => void
  push: (events: readonly GameEvent[]) => void
  removeToast: (id: number) => void
  /** Інформаційна підказка в стрічці нагород */
  info: (label: string) => void
}

let nextId = 0

const REVEAL_KEY = 'dev:revealIcons'
function readReveal(): boolean {
  try {
    return localStorage.getItem(REVEAL_KEY) === '1'
  } catch {
    return false
  }
}

export const useGameUi = create<GameUiState>()((set) => ({
  toasts: [],
  revealIcons: readReveal(),
  setRevealIcons: (value) => {
    try {
      localStorage.setItem(REVEAL_KEY, value ? '1' : '0')
    } catch {
      // приватний режим — просто не запам'ятовуємо
    }
    set({ revealIcons: value })
  },

  push: (events) =>
    set((s) => {
      const toasts: RewardToast[] = []
      for (const e of events) {
        if (e.type === 'reward' && e.coins !== 0) {
          toasts.push({ id: ++nextId, label: e.label, coins: e.coins, tone: 'reward' })
        } else if (e.type === 'streakReset') {
          toasts.push({ id: ++nextId, label: 'Серію почато заново', coins: 0, tone: 'info' })
        } else if (e.type === 'streak' && e.streak > 1) {
          toasts.push({ id: ++nextId, label: `${e.streak} днів поспіль`, coins: 0, tone: 'streak' })
        }
      }
      return { toasts: [...s.toasts, ...toasts].slice(-4) }
    }),
  removeToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  info: (label) => set((s) => ({ toasts: [...s.toasts, { id: ++nextId, label, coins: 0, tone: 'info' as const }].slice(-4) })),
}))
