import { Bug, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DEFAULT_FONT, FONTS, SYSTEM_FONT, applyFont, loadFont, restoreFont } from './fonts'

/**
 * Інструменти розробника. Видно в `npm run dev`, а на Vercel — після
 * відкриття адреси з `?dev` (запам'ятовується; `?dev=0` вимикає).
 */
function isDevEnabled(): boolean {
  if (import.meta.env.DEV) return true
  try {
    const param = new URLSearchParams(location.search).get('dev')
    if (param !== null) localStorage.setItem('dev:enabled', param === '0' ? '0' : '1')
    return localStorage.getItem('dev:enabled') === '1'
  } catch {
    return false
  }
}

const SAMPLE = 'Сніданок · 1 234 ккал · Б 12,5 Ж 4 В 38 — ґанок, їжа, єнот'

export function DevPanel() {
  const [enabled] = useState(isDevEnabled)
  const [open, setOpen] = useState(false)
  // restoreFont ідемпотентний (повторно не додає <link>), тож безпечний і в StrictMode
  const [current, setCurrent] = useState(() => (enabled ? restoreFont() : DEFAULT_FONT))

  useEffect(() => {
    if (open) FONTS.forEach(loadFont) // щоб кожен варіант у списку показувався своїм шрифтом
  }, [open])

  if (!enabled) return null

  const pick = (family: string) => {
    applyFont(family)
    setCurrent(family)
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 z-[70] flex items-center gap-1 rounded-full border border-secondary/60 bg-card px-3 py-2 text-xs font-bold text-secondary shadow-lg"
      >
        <Bug className="size-4" /> DEV
      </button>

      {open && (
        <div className="fixed inset-x-2 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-[70] mx-auto flex max-h-[70dvh] max-w-[464px] flex-col rounded-2xl border border-secondary/60 bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b border-line px-4 py-2">
            <b className="text-sm">Шрифт: {current}</b>
            <button type="button" onClick={() => setOpen(false)} aria-label="Закрити">
              <X className="size-4" />
            </button>
          </div>
          <ul className="overflow-y-auto p-2">
            {[...FONTS, { family: SYSTEM_FONT, note: 'системний шрифт телефона' }].map((f) => (
              <li key={f.family}>
                <button
                  type="button"
                  onClick={() => pick(f.family)}
                  className={`w-full rounded-xl px-3 py-2 text-left ${f.family === current ? 'bg-secondary/20' : 'hover:bg-elevated'}`}
                  style={{ fontFamily: `'${f.family}', system-ui` }}
                >
                  <span className="block text-base font-semibold">
                    {f.family} <span className="text-xs font-normal text-muted">— {f.note}</span>
                  </span>
                  <span className="block text-sm text-muted">{SAMPLE}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}
