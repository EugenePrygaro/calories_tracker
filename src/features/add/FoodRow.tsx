import { BookmarkCheck, ChevronRight, UtensilsCrossed } from 'lucide-react'
import { useState } from 'react'
import type { FoodItem, FoodSource } from '@shared/model.js'
import { cn } from '@/lib/cn'
import { grams, kcal } from '@/lib/format'

/** Мініатюра: фото з каталогу (Сільпо, Zakaz.ua, Open Food Facts) або іконка, якщо фото немає чи воно не завантажилось. */
export function FoodThumb({ imageUrl, className }: { imageUrl?: string | null | undefined; className?: string }) {
  const [broken, setBroken] = useState(false)
  return (
    <span
      className={cn(
        'flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-elevated text-muted',
        className,
      )}
    >
      {imageUrl && !broken ? (
        <img
          src={imageUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
          className="size-full object-cover"
        />
      ) : (
        <UtensilsCrossed className="size-5" />
      )}
    </span>
  )
}

/** Звідки цифри: маленька іконка магазину/каталогу біля бренду (для власних страв — нічого). */
const SOURCE_ICONS: Partial<Record<FoodSource, { src: string; label: string }>> = {
  silpo: { src: `${import.meta.env.BASE_URL}sources/silpo.png`, label: 'Сільпо' },
  zakaz: { src: `${import.meta.env.BASE_URL}sources/auchan.svg`, label: 'Auchan' },
  off: { src: `${import.meta.env.BASE_URL}sources/off.png`, label: 'Open Food Facts' },
}

interface FoodRowProps {
  item: FoodItem
  saved?: boolean
  onPick: (item: FoodItem) => void
}

export function FoodRow({ item, saved = false, onPick }: FoodRowProps) {
  const p = item.per100
  const source = SOURCE_ICONS[item.source]
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(item)}
        className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left transition-colors active:bg-elevated"
      >
        <FoodThumb imageUrl={item.imageUrl} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{item.name}</span>
          {(source || item.brand) && (
            <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
              {source && (
                <img
                  src={source.src}
                  alt={source.label}
                  title={source.label}
                  className="size-4 shrink-0 rounded-[4px] object-contain"
                />
              )}
              {item.brand && <span className="truncate">{item.brand}</span>}
            </span>
          )}
          <span className="truncate text-xs text-muted">
            <b className="text-fg">{kcal(p.kcal)}</b> ккал · Б {grams(p.protein)} · Ж {grams(p.fat)} · В{' '}
            {grams(p.carbs)} <span className="opacity-70">/ 100 г</span>
          </span>
        </span>
        {saved && <BookmarkCheck aria-label="У моїх стравах" className="size-4 shrink-0 text-primary" />}
        <ChevronRight className="size-4 shrink-0 text-muted" />
      </button>
    </li>
  )
}
