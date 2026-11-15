import { AnimatePresence, motion } from 'framer-motion'
import {
  Check,
  ChevronDown,
  Eye,
  FlameKindling,
  Package,
  PackagePlus,
  Palette,
  PartyPopper,
  Rocket,
  ShoppingCart,
  Snowflake,
  Ticket,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import type { GameState } from '@shared/game.js'
import {
  SHOP_CATEGORIES,
  SHOP_ITEMS,
  buyBlocker,
  capOf,
  displayedTheme,
  consumeBlocker,
  isThemeId,
  isUsableItemId,
  ownedOf,
  priceOf,
  type ShopCategory,
  type ShopItem,
  type ShopItemId,
} from '@shared/shop.js'
import { AnimatedNumber } from '@/components/AnimatedNumber'
import { CoinIcon } from '@/components/CoinIcon'
import { activateShopItem, buyShopItem, chooseTheme, useGame } from '@/data/store'
import { useGameUi } from '@/store/gameUi'
import { useUiStore } from '@/store/ui'
import { cn } from '@/lib/cn'
import { toDateKey } from '@/lib/date'
import { int } from '@/lib/format'
import { Swatches } from './ThemePicker'
import { THEME_LOOK } from './themeStyle'

/** Вигляд товарів, що не є темами: іконка й колір (CSS-змінна теми). */
const LOOK: Partial<Record<ShopItemId, { icon: LucideIcon; color: string }>> = {
  shield: { icon: Snowflake, color: 'var(--shield)' },
  cheatMeal: { icon: Ticket, color: 'var(--warning)' },
  boost: { icon: Zap, color: 'var(--accent-primary)' },
  superFlame: { icon: FlameKindling, color: 'var(--streak)' },
  shieldSlot: { icon: PackagePlus, color: 'var(--accent-secondary)' },
  temu: { icon: Package, color: '#ff7a1a' },
}

function lookOf(id: ShopItemId): { icon: LucideIcon; color: string } {
  if (isThemeId(id)) return { icon: THEME_LOOK[id].icon, color: THEME_LOOK[id].swatches[1] }
  return LOOK[id] ?? { icon: Package, color: 'var(--text-muted)' }
}

const CATEGORY_ICONS: Record<ShopCategory, LucideIcon> = {
  boosters: Rocket,
  holiday: PartyPopper,
  styles: Palette,
  marketplace: ShoppingCart,
}

/** Магазин: баланс, товари за категоріями, кількість в інвентарі, «Купити» / «Використати» / «Застосувати». */
export function ShopSheet() {
  const game = useGame()
  if (!game) return <p className="py-10 text-center text-sm text-muted">Завантаження…</p>

  return (
    <div className="flex flex-col gap-7 pb-6">
      <Balance game={game} />
      {SHOP_CATEGORIES.map((cat) => {
        const Icon = CATEGORY_ICONS[cat.id]
        return (
          <section key={cat.id} className="flex flex-col gap-2">
            <h3 className="flex items-center gap-2 px-1 text-xs font-bold tracking-wider text-muted uppercase">
              <Icon className="size-4 text-primary" /> {cat.title}
            </h3>
            {SHOP_ITEMS.filter((it) => it.category === cat.id).map((it) =>
              isThemeId(it.id) ? (
                <ThemeCard key={it.id} item={it} game={game} index={SHOP_ITEMS.indexOf(it)} />
              ) : (
                <ItemCard key={it.id} item={it} game={game} index={SHOP_ITEMS.indexOf(it)} />
              ),
            )}
          </section>
        )
      })}
    </div>
  )
}

function Balance({ game }: { game: GameState }) {
  const today = toDateKey()
  const active = [
    game.boostDate === today ? 'Бустер ×2 сьогодні' : null,
    game.days[today]?.cheat ? 'Читміл сьогодні' : null,
  ].filter((x) => x !== null)

  return (
    <div className="card flex items-center gap-4 rounded-3xl p-5">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-main/70 text-coin ring-1 ring-inset ring-coin/40">
        <CoinIcon className="size-7" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
        <span className="text-[10px] font-bold tracking-wider text-coin/80 uppercase">Баланс</span>
        <AnimatedNumber value={game.coins} format={int} className="text-2xl font-bold" />
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <AnimatePresence>
          {active.map((label) => (
            <motion.span
              key={label}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-bold text-primary"
            >
              {label}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>
    </div>
  )
}

/**
 * Спільний каркас картки. За замовчуванням згорнута — лише рядок: іконка, назва, мітка (скільки є /
 * кольори теми), ціна чи статус. Тап — розгортає опис і дії. Так довгий список гортається швидко.
 */
function CardShell({
  item,
  index,
  badge,
  summary,
  children,
}: {
  item: ShopItem
  index: number
  badge: ReactNode
  /** коротко праворуч у згорнутому стані: ціна, «Активна», «Максимум»… */
  summary: ReactNode
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const { icon: Icon, color } = lookOf(item.id)
  return (
    <motion.article
      layout="position"
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.03 + index * 0.03, type: 'spring', stiffness: 380, damping: 30 }}
      className={cn('card flex flex-col rounded-3xl transition-shadow', open && 'ring-1 ring-inset ring-white/[0.08]')}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-3 rounded-3xl p-3.5 text-left active:bg-white/[0.03]"
      >
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-2xl ring-1 ring-inset"
          style={{
            color,
            background: `color-mix(in oklab, ${color} 15%, transparent)`,
            ['--tw-ring-color' as string]: `color-mix(in oklab, ${color} 35%, transparent)`,
          }}
        >
          <Icon className="size-5.5" strokeWidth={1.9} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-[15px] leading-tight font-bold">{item.title}</span>
          <span className="flex items-center">{badge}</span>
        </span>
        <AnimatePresence initial={false}>
          {!open && (
            <motion.span
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.15 }}
              className="shrink-0"
            >
              {summary}
            </motion.span>
          )}
        </AnimatePresence>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ type: 'spring', stiffness: 400, damping: 28 }} className="shrink-0 text-muted">
          <ChevronDown className="size-5" />
        </motion.span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-4 px-5 pt-1 pb-5">
              <p className="text-[13px] leading-relaxed text-muted">{item.desc}</p>
              <div className="flex min-h-10 items-center gap-3 border-t border-line/70 pt-4">{children}</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.article>
  )
}

/** Ціна в згорнутому рядку; тьмяна, якщо калокоїнів бракує. */
function PriceTag({ price, block }: { price: number | null; block: ReturnType<typeof buyBlocker> }) {
  if (block === 'max_level' || price === null) return <span className="text-xs font-bold text-muted">Максимум</span>
  if (block === 'inventory_full') return <span className="text-xs font-bold text-muted">Повний</span>
  return (
    <span className={cn('flex items-center gap-1 text-sm font-bold', block === 'not_enough_coins' ? 'text-muted' : 'text-coin')}>
      {int(price)} <CoinIcon className="size-4" strokeWidth={2.2} />
    </span>
  )
}

/** Підказка, чому «Використати» зараз недоступне. */
const USE_HINTS: Partial<Record<string, string>> = {
  already_active: 'Діє сьогодні',
  kcal_done: 'Норму вже зараховано',
  nothing_to_restore: 'Знадобиться, коли серія обірветься',
}

function ItemCard({ item, game, index }: { item: ShopItem; game: GameState; index: number }) {
  const [busy, setBusy] = useState<'buy' | 'use' | null>(null)
  const { color } = lookOf(item.id)
  const price = priceOf(item.id, game)
  const owned = ownedOf(item.id, game)
  const cap = capOf(item.id, game)
  const buyBlock = buyBlocker(item.id, game)
  const usable = isUsableItemId(item.id) ? item.id : null
  const useBlock = usable ? consumeBlocker(usable, game, toDateKey()) : null

  const run = (kind: 'buy' | 'use', action: () => Promise<void>) => {
    setBusy(kind)
    void action()
      .catch(() => {}) // причину покаже тост
      .finally(() => setBusy(null))
  }

  const ownedLabel =
    item.id === 'shield' || item.id === 'superFlame'
      ? `${owned} / ${cap}`
      : item.id === 'shieldSlot'
        ? `слотів ${owned} / ${cap}`
        : `× ${owned}`

  const badge = (
    // скільки є: спалахує, коли кількість змінилась
    <motion.span
      key={owned}
      initial={{ scale: 1 }}
      animate={{ scale: [1, 1.25, 1] }}
      transition={{ duration: 0.4 }}
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold',
        owned > 0 ? 'bg-white/[0.08] text-fg' : 'bg-white/[0.04] text-muted',
      )}
    >
      {ownedLabel}
    </motion.span>
  )

  return (
    <CardShell item={item} index={index} badge={badge} summary={<PriceTag price={price} block={buyBlock} />}>
      {usable && owned > 0 ? (
        useBlock ? (
          <span className="min-w-0 flex-1 text-xs text-muted">{USE_HINTS[useBlock] ?? ''}</span>
        ) : (
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            disabled={busy !== null}
            onClick={() => run('use', () => activateShopItem(usable))}
            className="flex h-10 flex-1 items-center justify-center rounded-full text-sm font-bold ring-1 ring-inset disabled:opacity-60"
            style={{
              color,
              background: `color-mix(in oklab, ${color} 14%, transparent)`,
              ['--tw-ring-color' as string]: `color-mix(in oklab, ${color} 45%, transparent)`,
            }}
          >
            {busy === 'use' ? 'Зачекайте…' : 'Використати'}
          </motion.button>
        )
      ) : (
        <span className="min-w-0 flex-1 text-xs text-muted">
          {buyBlock === 'not_enough_coins' && price !== null && `Ще ${int(price - game.coins)} до покупки`}
        </span>
      )}
      <BuyButton price={price} block={buyBlock} busy={busy === 'buy'} onBuy={() => run('buy', () => buyShopItem(item.id))} />
    </CardShell>
  )
}

/** Тема: купується раз; потім — «Застосувати» або позначка «Активна». */
function ThemeCard({ item, game, index }: { item: ShopItem; game: GameState; index: number }) {
  const [busy, setBusy] = useState(false)
  if (!isThemeId(item.id)) return null
  const theme = item.id
  const owned = theme in game.themes
  const active = displayedTheme(game, toDateKey()) === theme
  const price = priceOf(theme, game)
  const buyBlock = buyBlocker(theme, game)

  const run = (action: () => Promise<void>) => {
    setBusy(true)
    void action()
      .catch(() => {})
      .finally(() => setBusy(false))
  }

  return (
    <CardShell
      item={item}
      index={index}
      badge={<Swatches colors={THEME_LOOK[theme].swatches} size="size-3.5" />}
      summary={
        active ? (
          <span className="flex items-center gap-1 text-xs font-bold text-primary">
            <Check className="size-3.5" /> Активна
          </span>
        ) : owned ? (
          <span className="text-xs font-bold text-muted">Куплено</span>
        ) : (
          <PriceTag price={price} block={buyBlock} />
        )
      }
    >
      {!owned ? (
        <>
          {/* Примірка: 10 секунд теми на справжньому екрані, щоб не купувати наосліп */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              useGameUi.getState().startTryOn(theme)
              useUiStore.getState().closeModal()
            }}
            className="flex h-10 items-center gap-1.5 rounded-full bg-white/[0.06] px-4 text-sm font-bold ring-1 ring-inset ring-white/[0.1]"
          >
            <Eye className="size-4" /> Приміряти
          </motion.button>
          <span className="min-w-0 flex-1 text-right text-[11px] leading-tight text-muted">
            {buyBlock === 'not_enough_coins' && price !== null && `ще ${int(price - game.coins)}`}
          </span>
          <BuyButton price={price} block={buyBlock} busy={busy} onBuy={() => run(() => buyShopItem(theme))} />
        </>
      ) : active ? (
        <>
          <span className="min-w-0 flex-1 text-xs text-muted">Перемкнути можна в налаштуваннях</span>
          <span className="flex h-10 items-center gap-1.5 rounded-full bg-primary/15 px-4 text-sm font-bold text-primary">
            <Check className="size-4" /> Активна
          </span>
        </>
      ) : (
        <>
          <span className="min-w-0 flex-1 text-xs text-muted">Куплено</span>
          <motion.button
            type="button"
            whileTap={{ scale: 0.95 }}
            disabled={busy}
            onClick={() => run(() => chooseTheme(theme))}
            className="flex h-10 items-center rounded-full bg-white/[0.06] px-4 text-sm font-bold ring-1 ring-inset ring-white/[0.1] disabled:opacity-60"
          >
            Застосувати
          </motion.button>
        </>
      )}
    </CardShell>
  )
}

function BuyButton({
  price,
  block,
  busy,
  onBuy,
}: {
  price: number | null
  block: ReturnType<typeof buyBlocker>
  busy: boolean
  onBuy: () => void
}) {
  if (block === 'max_level' || price === null) {
    return <span className="rounded-full bg-white/[0.04] px-4 py-2.5 text-xs font-bold text-muted">Максимум</span>
  }
  if (block === 'inventory_full') {
    return <span className="rounded-full bg-white/[0.04] px-4 py-2.5 text-xs font-bold text-muted">Інвентар повний</span>
  }
  const poor = block === 'not_enough_coins'
  return (
    <motion.button
      type="button"
      whileTap={poor ? {} : { scale: 0.94 }}
      disabled={poor || busy}
      onClick={onBuy}
      aria-label={`Купити за ${int(price)} калокоїнів`}
      className={cn(
        'flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-bold ring-1 ring-inset',
        poor ? 'bg-white/[0.04] text-muted ring-white/[0.06]' : 'sheen bg-coin/15 text-coin ring-coin/60',
      )}
    >
      {busy ? (
        'Купуємо…'
      ) : (
        <>
          {int(price)} <CoinIcon className="size-4" strokeWidth={2.2} />
        </>
      )}
    </motion.button>
  )
}
