import type { GameEvent } from '@shared/game.js'

/**
 * Звукові ефекти, синтезовані Web Audio — без бібліотек і аудіофайлів (≈2 КБ, без ліцензій).
 *
 * iOS/Safari:
 *  - звук «розблоковується» першим дотиком (AudioContext створюємо й будимо в pointerdown);
 *  - Audio Session 'ambient' (нові iOS): звуки змішуються з музикою/подкастом, а не зупиняють її,
 *    і мовчать, коли вимикач на «беззвучно»;
 *  - після згортання iOS присипляє звук — будимо при наступному дотику.
 * Звуки завжди увімкнені (окремого перемикача немає — вимикач беззвучного режиму телефона й так їх глушить).
 */

export type SoundName = 'coin' | 'goal' | 'streak' | 'purchase' | 'fanfare' | 'achievement' | 'soft'

/** Підписи для DEV-панелі. */
export const SOUND_LABELS: Record<SoundName, string> = {
  coin: 'Монета (прийом їжі)',
  goal: 'Норма закрита',
  streak: 'Серія +1 день',
  purchase: 'Покупка',
  fanfare: 'Тиждень серії / нагорода ачівки',
  achievement: 'Нова ачівка',
  soft: 'Сповіщення',
}

// ─── Аудіоконтекст ───────────────────────────────────────────────────────────

let ctx: AudioContext | null = null
let master: GainNode | null = null

/** Створює/будить контекст. Викликається з дотику — інакше Safari не дасть звук. */
function wake(): void {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return
  if (!ctx) {
    // «фоновий» звук: змішується з музикою й поважає беззвучний режим (Safari 16.4+)
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
    if (session) session.type = 'ambient'
    ctx = new AudioContext()
    master = ctx.createGain()
    master.gain.value = 0.55
    master.connect(ctx.destination)
  }
  if (ctx.state !== 'running') void ctx.resume().catch(() => {})
}

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', wake, { passive: true, capture: true })
}

/** Одна нота з плавною атакою й згасанням; за бажанням — ковзання частоти. */
function tone(freq: number, at: number, dur: number, opts: { type?: OscillatorType; gain?: number; glideTo?: number } = {}) {
  if (!ctx || !master) return
  const t = ctx.currentTime + at
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = opts.type ?? 'sine'
  osc.frequency.setValueAtTime(freq, t)
  if (opts.glideTo) osc.frequency.exponentialRampToValueAtTime(opts.glideTo, t + dur * 0.8)
  const peak = opts.gain ?? 0.14
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(g).connect(master)
  osc.start(t)
  osc.stop(t + dur + 0.02)
}

const SOUNDS: Record<SoundName, () => void> = {
  // класичний «дзинь» монети: дві швидкі ноти вгору
  coin: () => {
    tone(987.8, 0, 0.07, { type: 'triangle', gain: 0.12 })
    tone(1318.5, 0.06, 0.28, { type: 'triangle', gain: 0.12 })
  },
  // норма закрита: м'який мажорний акорд арпеджіо
  goal: () => {
    tone(1046.5, 0, 0.42, { gain: 0.1 })
    tone(1318.5, 0.05, 0.42, { gain: 0.09 })
    tone(1568, 0.1, 0.5, { gain: 0.09 })
  },
  // серія: ковзання вгору й дзвіночок
  streak: () => {
    tone(420, 0, 0.22, { type: 'sine', gain: 0.08, glideTo: 900 })
    tone(1174.7, 0.16, 0.3, { type: 'triangle', gain: 0.1 })
  },
  // покупка: «клац» каси й два дзвіночки
  purchase: () => {
    tone(2200, 0, 0.03, { type: 'square', gain: 0.05 })
    tone(1568, 0.05, 0.22, { type: 'triangle', gain: 0.11 })
    tone(2093, 0.13, 0.32, { type: 'triangle', gain: 0.1 })
  },
  // фанфара: висхідне арпеджіо й акорд
  fanfare: () => {
    const notes = [523.3, 659.3, 784, 1046.5]
    notes.forEach((f, i) => tone(f, i * 0.085, 0.16, { type: 'triangle', gain: 0.11 }))
    tone(1046.5, 0.34, 0.6, { type: 'triangle', gain: 0.1 })
    tone(1318.5, 0.34, 0.6, { gain: 0.07 })
    tone(1568, 0.34, 0.65, { gain: 0.07 })
  },
  // нова ачівка: фанфара + іскорки вгорі
  achievement: () => {
    SOUNDS.fanfare()
    ;[2093, 2637, 3136].forEach((f, i) => tone(f, 0.62 + i * 0.07, 0.25, { gain: 0.05 }))
  },
  // тихий сигнал для сповіщень
  soft: () => tone(784, 0, 0.16, { gain: 0.07 }),
}

/** Програти звук. */
export function play(name: SoundName): void {
  wake()
  if (!ctx || ctx.state === 'closed') return
  SOUNDS[name]()
}

/** Що важливіше: з кількох подій однієї дії звучить одна, найважливіша. */
const PRIORITY: SoundName[] = ['achievement', 'fanfare', 'purchase', 'goal', 'streak', 'coin', 'soft']

/** Звук для подій гри (нагороди, серія, покупки) — один на дію. */
export function playForEvents(events: readonly GameEvent[]): void {
  const picked = new Set<SoundName>()
  for (const e of events) {
    if (e.type === 'reward') {
      if (e.coins < 0) picked.add('purchase')
      else if (e.reason === 'streakWeek' || e.reason === 'achievement') picked.add('fanfare')
      else if (e.reason === 'protein' || e.reason === 'kcal') picked.add('goal')
      else if (e.coins > 0) picked.add('coin')
    } else if (e.type === 'streak' && e.streak > 1) picked.add('streak')
    else if (e.type === 'rescue') picked.add('goal')
    else if (e.type === 'notice') picked.add('soft')
  }
  const name = PRIORITY.find((n) => picked.has(n))
  if (name) play(name)
}
