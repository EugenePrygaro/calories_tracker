import { AnimatePresence, motion } from 'framer-motion'
import { Palette, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { THEME_PRICE } from '@shared/shop.js'
import { CoinIcon } from '@/components/CoinIcon'
import { buyShopItem, useGame } from '@/data/store'
import { int } from '@/lib/format'
import { TRY_ON_SECONDS, useGameUi } from '@/store/gameUi'
import { useUiStore } from '@/store/ui'
import { THEME_LOOK } from './themeStyle'

/**
 * Примірка теми з магазину: тема діє TRY_ON_SECONDS секунд на справжньому екрані,
 * плашка внизу показує відлік і дає купити одразу. Після відліку — назад у магазин.
 */
export function TryOnBanner() {
  const tryOn = useGameUi((s) => s.tryOn)
  const endTryOn = useGameUi((s) => s.endTryOn)
  const openModal = useUiStore((s) => s.openModal)
  const coins = useGame()?.coins ?? 0
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!tryOn) return
    const t = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(t)
  }, [tryOn])

  const left = tryOn ? Math.max(Math.ceil((tryOn.until - now) / 1000), 0) : 0
  useEffect(() => {
    if (tryOn && left === 0) {
      endTryOn()
      openModal({ type: 'shop' }) // повертаємось до вибору
    }
  }, [tryOn, left, endTryOn, openModal])

  const buy = () => {
    if (!tryOn) return
    setBusy(true)
    void buyShopItem(tryOn.theme)
      .then(() => endTryOn())
      .catch(() => {})
      .finally(() => setBusy(false))
  }

  return (
    <AnimatePresence>
      {tryOn && (
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          className="fixed inset-x-4 bottom-[calc(6.25rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-[448px] items-center gap-3 rounded-full border border-line bg-card/95 py-2 pr-2 pl-3 shadow-2xl"
          role="status"
        >
          {/* Відлік — кільце, що спорожнюється */}
          <span className="relative flex size-9 shrink-0 items-center justify-center">
            <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
              <circle cx="18" cy="18" r="16" fill="none" strokeWidth="3" style={{ stroke: 'rgb(255 255 255 / 0.1)' }} />
              <circle
                cx="18"
                cy="18"
                r="16"
                fill="none"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={100.5}
                strokeDashoffset={100.5 * (1 - left / TRY_ON_SECONDS)}
                style={{ stroke: 'var(--accent-primary)', transition: 'stroke-dashoffset 0.25s linear' }}
              />
            </svg>
            <span className="text-xs font-bold">{left}</span>
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="flex items-center gap-1 text-[11px] text-muted">
              <Palette className="size-3.5" /> Примірка
            </span>
            <span className="block truncate text-sm font-bold">{THEME_LOOK[tryOn.theme].title}</span>
          </span>
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            onClick={buy}
            disabled={busy || coins < THEME_PRICE}
            className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-coin/15 px-3.5 text-sm font-bold text-coin ring-1 ring-inset ring-coin/60 disabled:opacity-50"
          >
            {int(THEME_PRICE)} <CoinIcon className="size-4" strokeWidth={2.2} />
          </motion.button>
          <button
            type="button"
            aria-label="Завершити примірку"
            onClick={() => {
              endTryOn()
              openModal({ type: 'shop' })
            }}
            className="flex size-10 shrink-0 items-center justify-center rounded-full text-muted active:bg-white/5"
          >
            <X className="size-5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
