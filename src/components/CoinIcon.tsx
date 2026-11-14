/**
 * Монета застосунку — лінійна іконка в стилі решти іконок (lucide: 24×24, обведення 2,
 * заокруглені кінці). Колір — від тексту (currentColor), зазвичай text-coin.
 */
export function CoinIcon({ className, strokeWidth = 2 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {/* обідок і внутрішнє кільце — як карбування на монеті */}
      <circle cx="12" cy="12" r="9.5" />
      <circle cx="12" cy="12" r="6.2" strokeOpacity="0.45" strokeWidth={strokeWidth * 0.75} />
      {/* іскра в центрі */}
      <path d="M12 8.6 13 11 15.4 12 13 13 12 15.4 11 13 8.6 12 11 11Z" fill="currentColor" strokeWidth={strokeWidth * 0.5} />
      {/* відблиск на обідку */}
      <path d="M6.2 8.4A7.6 7.6 0 0 1 9.4 5.3" strokeOpacity="0.6" strokeWidth={strokeWidth * 0.75} />
    </svg>
  )
}
