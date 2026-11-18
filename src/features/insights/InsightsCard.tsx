import { motion } from 'framer-motion'
import { Activity, ChevronRight } from 'lucide-react'
import { int } from '@/lib/format'
import { useInsights } from '@/lib/insights'
import { useUiStore } from '@/store/ui'
import { CheckIcon } from './checkStyle'

/** Плашка «Як іде схуднення» на головній: розхід, темп і дві найважливіші перевірки. Тап — шторка з усім. */
export function InsightsCard() {
  const a = useInsights()
  const openModal = useUiStore((s) => s.openModal)
  // спершу те, що потребує уваги; якщо все добре — перше «добре»
  const shown = a.checks.slice(0, 2)
  const empty = !a.trend && !a.intake

  return (
    <motion.div data-main-card whileTap={{ scale: 0.985 }} className="card relative flex flex-col gap-3 rounded-3xl p-5">
      <button
        type="button"
        onClick={() => openModal({ type: 'insights' })}
        aria-label="Як іде схуднення: прогноз, реальний розхід і перевірки"
        className="absolute inset-0 rounded-3xl"
      />
      <header className="pointer-events-none flex items-center gap-2">
        <Activity className="size-5 text-primary" strokeWidth={1.8} />
        <h2 className="flex-1 text-base font-bold">Як іде схуднення</h2>
        <span className="text-[11px] text-muted">28 днів</span>
        <ChevronRight className="size-4 text-muted" />
      </header>

      {empty ? (
        <p className="pointer-events-none text-sm text-muted">
          Записуй їжу й зважуйся хоча б 3 рази за тиждень-два — тут з’явиться прогноз і аналіз.
        </p>
      ) : (
        <div className="pointer-events-none flex flex-col gap-2">
          {(a.tdee !== null || a.trend) && (
            <p className="text-sm text-muted">
              {a.tdee !== null && (
                <>
                  Розхід ≈ <b className="text-fg">{int(a.tdee)} ккал</b>
                </>
              )}
              {a.tdee !== null && a.trend && ' · '}
              {a.trend && (
                <b className="text-fg">
                  {a.trend.perWeek < 0 ? '−' : '+'}
                  {Math.abs(a.trend.perWeek).toLocaleString('uk-UA', { maximumFractionDigits: 2 })} кг/тиж
                </b>
              )}
            </p>
          )}
          {shown.map((c) => (
            <p key={c.id} className="flex items-center gap-2 text-sm">
              <CheckIcon level={c.level} className="size-4" />
              <span className="truncate">{c.title}</span>
            </p>
          ))}
        </div>
      )}
    </motion.div>
  )
}
