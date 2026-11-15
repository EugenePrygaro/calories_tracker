import { create } from 'zustand'
import type { GameEvent } from '@shared/game.js'
import { isThemeId } from '@shared/shop.js'
import type { AppTheme } from '@/lib/theme'

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
  /** DEV: перегляд теми без покупки (лише на цьому пристрої); null — тема з гри */
  themePreview: AppTheme | null
  setThemePreview: (theme: AppTheme | null) => void
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

const PREVIEW_KEY = 'dev:theme'
function readPreview(): AppTheme | null {
  try {
    const v = localStorage.getItem(PREVIEW_KEY)
    return v === 'default' || isThemeId(v) ? v : null
  } catch {
    return null
  }
}

export const useGameUi = create<GameUiState>()((set) => ({
  toasts: [],
  revealIcons: readReveal(),
  themePreview: readPreview(),
  setThemePreview: (theme) => {
    try {
      if (theme === null) localStorage.removeItem(PREVIEW_KEY)
      else localStorage.setItem(PREVIEW_KEY, theme)
    } catch {
      // приватний режим — перегляд лише до перезавантаження
    }
    set({ themePreview: theme })
  },
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
        } else if (e.type === 'notice') {
          toasts.push({ id: ++nextId, label: e.label, coins: 0, tone: 'info' })
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
