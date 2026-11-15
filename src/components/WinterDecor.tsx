/**
 * Новорічні прикраси зимової теми: гірлянда з лампочками, що мерехтять, уздовж верху
 * екрана та дві ялинкові кульки, що злегка гойдаються. Лише SVG + CSS-анімації
 * прозорості й повороту (композитор, без перемальовування); на паузі під шторкою.
 */

/** Один провис гірлянди — 80 px; плитки повторюються на всю ширину екрана. */
const SEG = 80
const SEGMENTS = 7
const COLORS = ['#ff5d6c', '#ffd25e', '#5ec8ff', '#7dffb0', '#ff9a5e']

/** Точка на провисі (квадратична крива від 0 до SEG з прогином 12 px). */
const sag = (t: number) => ({ x: t * SEG, y: 4 + 4 * 12 * t * (1 - t) })

export function Garland() {
  const bulbs = [0.18, 0.5, 0.82]
  return (
    <div aria-hidden className="fx-garland">
      <div className="flex justify-center">
        {Array.from({ length: SEGMENTS }, (_, s) => (
          <svg key={s} width={SEG} height={30} viewBox={`0 0 ${SEG} 30`} className="shrink-0 overflow-visible">
            <path d={`M0 4 Q ${SEG / 2} ${4 + 24} ${SEG} 4`} fill="none" strokeWidth="1.4" style={{ stroke: 'rgb(30 45 70 / 0.9)' }} />
            {bulbs.map((t, b) => {
              const p = sag(t)
              const color = COLORS[(s * bulbs.length + b) % COLORS.length] ?? '#fff'
              return (
                <g key={b} className="fx-bulb" style={{ animationDelay: `${((s * 3 + b) % 7) * 0.37}s` }}>
                  {/* сяйво — просто більше напівпрозоре коло, без фільтрів */}
                  <circle cx={p.x} cy={p.y + 7} r="7" fill={color} opacity="0.22" />
                  <rect x={p.x - 1.6} y={p.y} width="3.2" height="3" rx="0.8" fill="#4a5a72" />
                  <ellipse cx={p.x} cy={p.y + 6.5} rx="3" ry="4.2" fill={color} />
                  <ellipse cx={p.x - 1} cy={p.y + 5} rx="0.9" ry="1.4" fill="white" opacity="0.7" />
                </g>
              )
            })}
          </svg>
        ))}
      </div>
    </div>
  )
}

/** Ялинкова кулька на ниточці. */
function Bauble({ side, color, length, delay }: { side: 'left' | 'right'; color: string; length: number; delay: number }) {
  return (
    <div aria-hidden className={`fx-bauble fx-bauble-${side}`} style={{ animationDelay: `${delay}s` }}>
      <svg width="26" height={length + 28} viewBox={`0 0 26 ${length + 28}`}>
        <line x1="13" y1="0" x2="13" y2={length} strokeWidth="1" style={{ stroke: 'rgb(200 220 255 / 0.5)' }} />
        <rect x="9.5" y={length} width="7" height="4" rx="1" fill="#c9a24a" />
        <circle cx="13" cy={length + 14} r="10" fill={color} />
        <path d={`M4 ${length + 13} Q13 ${length + 17} 22 ${length + 13}`} fill="none" stroke="white" strokeOpacity="0.45" strokeWidth="1.2" />
        <ellipse cx="9.5" cy={length + 10} rx="2.4" ry="3.4" fill="white" opacity="0.45" />
      </svg>
    </div>
  )
}

export function WinterDecor() {
  return (
    <>
      <Garland />
      <Bauble side="left" color="#e2394f" length={8} delay={0} />
      <Bauble side="right" color="#2f7de1" length={14} delay={1.3} />
    </>
  )
}
