import { AnimatePresence, motion } from 'framer-motion'
import {
  Check,
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
          <section key={cat.id} className="flex flex-col gap-3">
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

/** Спільний каркас картки: шапка (іконка, назва, бейдж), опис, нижній ряд дій під тонкою лінією. */
function CardShell({
  item,
  index,
  badge,
  children,
}: {
  item: ShopItem
  index: number
  badge: ReactNode
  children: ReactNode
}) {
  const { icon: Icon, color } = lookOf(item.id)
  return (
    <motion.article
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 + index * 0.04, type: 'spring', stiffness: 380, damping: 30 }}
      className="card flex flex-col gap-4 rounded-3xl p-5"
    >
      <div className="flex items-center gap-4">
        <span
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl ring-1 ring-inset"
          style={{
            color,
            background: `color-mix(in oklab, ${color} 15%, transparent)`,
            ['--tw-ring-color' as string]: `color-mix(in oklab, ${color} 35%, transparent)`,
          }}
        >
          <Icon className="size-6" strokeWidth={1.9} />
        </span>
        <h4 className="min-w-0 flex-1 text-base leading-tight font-bold">{item.title}</h4>
        {badge}
      </div>
      <p className="text-[13px] leading-relaxed text-muted">{item.desc}</p>
      <div className="flex min-h-10 items-center gap-3 border-t border-line/70 pt-4">{children}</div>
    </motion.article>
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
        'shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold',
        owned > 0 ? 'bg-white/[0.08] text-fg' : 'bg-white/[0.04] text-muted',
      )}
    >
      {ownedLabel}
    </motion.span>
  )

  return (
    <CardShell item={item} index={index} badge={badge}>
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
  const active = game.activeTheme === theme
  const price = priceOf(theme, game)
  const buyBlock = buyBlocker(theme, game)

  const run = (action: () => Promise<void>) => {
    setBusy(true)
    void action()
      .catch(() => {})
      .finally(() => setBusy(false))
  }

  return (
    <CardShell item={item} index={index} badge={<Swatches colors={THEME_LOOK[theme].swatches} size="size-5" />}>
      {!owned ? (
        <>
          <span className="min-w-0 flex-1 text-xs text-muted">
            {buyBlock === 'not_enough_coins' && price !== null && `Ще ${int(price - game.coins)} до покупки`}
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
