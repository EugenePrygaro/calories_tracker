/**
 * Фон «Орбітальної» теми: космос бортового комп'ютера.
 * Дешево: кожне кільце — окремий елемент, і анімується лише transform цілого шару
 * (rotateX нахиляє коло в еліпс, rotateZ веде «супутник» по орбіті) — композитор, без перемальовування.
 */

/** Орбіта: коло з пунктиром і супутником; нахил і швидкість задає CSS (.fx-orbit-*). */
function Orbit({ className, size, dot }: { className: string; size: number; dot: string }) {
  const r = size / 2 - 4
  return (
    <svg className={`fx-orbit ${className}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth="1.2" style={{ stroke: 'rgb(120 220 255 / 0.22)' }} />
      <circle cx={size / 2} cy={size / 2} r={r - 10} fill="none" strokeWidth="0.8" strokeDasharray="2 10" style={{ stroke: 'rgb(120 220 255 / 0.18)' }} />
      {/* супутник і його сяйво */}
      <circle cx={size / 2 + r} cy={size / 2} r="9" fill={dot} opacity="0.25" />
      <circle cx={size / 2 + r} cy={size / 2} r="3.5" fill={dot} />
    </svg>
  )
}

/** Координатний диск у куті: кільця, поділки, перехрестя. Статичний. */
function Dial({ className }: { className: string }) {
  const ticks = Array.from({ length: 36 }, (_, i) => i * 10)
  return (
    <svg className={`fx-dial ${className}`} width="260" height="260" viewBox="-130 -130 260 260">
      <g fill="none" style={{ stroke: 'rgb(120 220 255 / 0.16)' }}>
        <circle r="120" strokeWidth="1" />
        <circle r="84" strokeWidth="0.8" strokeDasharray="3 6" />
        <circle r="40" strokeWidth="0.8" />
        <line x1="-128" y1="0" x2="128" y2="0" strokeWidth="0.6" />
        <line x1="0" y1="-128" x2="0" y2="128" strokeWidth="0.6" />
        {ticks.map((a) => (
          <line key={a} x1="0" y1="-120" x2="0" y2={a % 90 === 0 ? -108 : -114} strokeWidth="1" transform={`rotate(${a})`} />
        ))}
      </g>
      <text x="6" y="-92" fontSize="9" style={{ fill: 'rgb(120 220 255 / 0.3)', fontFamily: 'ui-monospace, monospace' }}>
        0°
      </text>
      <text x="92" y="-4" fontSize="9" style={{ fill: 'rgb(120 220 255 / 0.3)', fontFamily: 'ui-monospace, monospace' }}>
        90°
      </text>
    </svg>
  )
}

export function OrbitalDecor() {
  return (
    <>
      <div className="fx-nebula" />
      <div className="fx-stars fx-space-b" />
      <div className="fx-stars fx-space-a" />
      <Dial className="fx-dial-tl" />
      <Dial className="fx-dial-br" />
      <div className="fx-orbits">
        <Orbit className="fx-orbit-1" size={980} dot="#7ff3ff" />
        <Orbit className="fx-orbit-2" size={720} dot="#b5f6ff" />
        <Orbit className="fx-orbit-3" size={1300} dot="#5fd8ff" />
      </div>
    </>
  )
}
