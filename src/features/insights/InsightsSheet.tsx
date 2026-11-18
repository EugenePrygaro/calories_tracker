import { LoaderCircle } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { type FoodBreakdown } from '@shared/insights.js'
import { MEAL_LABELS, MEAL_TYPES } from '@shared/model.js'
import { api } from '@/data/api'
import { useGoals } from '@/data/store'
import { cn } from '@/lib/cn'
import { toDateKey } from '@/lib/date'
import { int, kg } from '@/lib/format'
import { monthLabel, useInsights } from '@/lib/insights'
import { CheckIcon } from './checkStyle'

const perWeekLabel = (n: number) =>
  `${n < 0 ? '−' : '+'}${Math.abs(n).toLocaleString('uk-UA', { maximumFractionDigits: 2 })} кг/тиж`

/** Шторка «Як іде схуднення»: прогноз, реальний розхід, перевірки, харчування, що дає найбільше калорій. */
export function InsightsSheet() {
  const a = useInsights()
  const goals = useGoals()
  const today = toDateKey()
  const [foods, setFoods] = useState<FoodBreakdown | null>(null)

  useEffect(() => {
    let alive = true
    api
      .getFoodMix(today)
      .then((r) => alive && setFoods(r.foods))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [today])

  return (
    <div className="flex flex-col gap-4 pb-6">
      {/* Прогноз ваги */}
      <Card title="Прогноз ваги">
        {a.trend ? (
          <>
            <div className="flex items-end gap-4">
              <Big value={`${kg(a.trend.weight)} кг`} label="вага за трендом" />
              <Big
                value={perWeekLabel(a.trend.perWeek)}
                label="темп"
                tone={a.trend.perWeek <= 0 ? 'text-primary' : 'text-warning'}
              />
            </div>
            {a.forecast && <p className="text-sm">{forecastSentence(a.forecast, a.targetWeight, today)}</p>}
            {a.targetWeight === null && <p className="text-sm text-muted">Задай цільову вагу в налаштуваннях — тут з’явиться дата.</p>}
            <Note>
              За {a.trend.weighIns} зважуваннями за {a.trend.spanDays} днів — пряма через точки, тож денні коливання води
              згладжено.
            </Note>
          </>
        ) : (
          <Note>Потрібно щонайменше 3 зважування за тиждень і більше — тоді тут з’явиться темп і дата цілі.</Note>
        )}
      </Card>

      {/* Реальний розхід */}
      <Card title="Реальний розхід">
        {a.tdee !== null ? (
          <>
            <Big value={`≈ ${int(a.tdee)} ккал`} label="на день — скільки ти насправді витрачаєш" />
            <div className="flex flex-col gap-1.5">
              {a.paces.map((p) => (
                <div key={p.perWeek} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-muted">Щоб худнути на {Math.abs(p.perWeek).toLocaleString('uk-UA')} кг/тиж</span>
                  <b>{int(p.kcal)} ккал</b>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-2 border-t border-line pt-1.5 text-sm">
                <span className="text-muted">Твоя норма зараз</span>
                <b>{int(goals.kcal)} ккал</b>
              </div>
            </div>
            <Note>
              Середнє з’їдене за 4 тижні плюс калорії фактичної зміни ваги (7 700 ккал ≈ 1 кг). Враховує і активність, і
              неточності записів.
            </Note>
          </>
        ) : a.checks.some((c) => c.id === 'mismatch') ? (
          <Note>Не рахуємо: вага й записи не сходяться — дивись «Що варто знати» нижче.</Note>
        ) : (
          <Note>Потрібно щонайменше 7 днів із записами й тренд ваги.</Note>
        )}
      </Card>

      {/* Перевірки */}
      {a.checks.length > 0 && (
        <Card title="Що варто знати">
          <ul className="flex flex-col gap-3">
            {a.checks.map((c) => (
              <li key={c.id} className="flex gap-2.5">
                <CheckIcon level={c.level} className="mt-0.5 size-5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{c.title}</p>
                  <p className="text-xs text-muted">{c.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Харчування за 4 тижні */}
      {a.intake && (
        <Card title={`Харчування · ${a.intake.loggedDays} з ${a.intake.windowDays} днів`}>
          <div className="flex flex-col gap-2">
            {(
              [
                ['Калорії', a.intake.avg.kcal, a.intake.goals.kcal, 'ккал'],
                ['Білки', a.intake.avg.protein, a.intake.goals.protein, 'г'],
                ['Жири', a.intake.avg.fat, a.intake.goals.fat, 'г'],
                ['Вуглеводи', a.intake.avg.carbs, a.intake.goals.carbs, 'г'],
              ] as const
            ).map(([label, value, goal, unit]) => (
              <Bar key={label} label={label} value={value} goal={goal} unit={unit} />
            ))}
          </div>
          {a.intake.weekday !== null && a.intake.weekend !== null && (
            <p className="text-sm text-muted">
              Будні ≈ <b className="text-fg">{int(a.intake.weekday)}</b> · вихідні ≈{' '}
              <b className="text-fg">{int(a.intake.weekend)}</b> ккал
            </p>
          )}
        </Card>
      )}

      {/* Що дає найбільше калорій */}
      <Card title="Найбільше калорій дають">
        {!foods ? (
          <Note>
            <LoaderCircle className="mr-1 inline size-3.5 animate-spin" /> Рахуємо за 4 тижні…
          </Note>
        ) : foods.foods.length === 0 ? (
          <Note>За 4 тижні записів ще немає.</Note>
        ) : (
          <>
            <ul className="flex flex-col gap-2">
              {foods.foods.map((f) => (
                <li key={f.name} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate">{f.name}</span>
                    <span className="shrink-0 text-xs text-muted">
                      <b className="text-fg">{f.share.toLocaleString('uk-UA')}%</b> · {f.times}×
                    </span>
                  </div>
                  <span className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                    <span className="block h-full rounded-full bg-primary/70" style={{ width: `${Math.min(f.share * 2.5, 100)}%` }} />
                  </span>
                </li>
              ))}
            </ul>
            <div className="grid grid-cols-4 gap-2">
              {MEAL_TYPES.map((m) => (
                <div key={m} className="rounded-xl bg-white/[0.04] px-2 py-1.5 text-center">
                  <p className="text-sm font-bold">{Math.round(foods.meals[m])}%</p>
                  <p className="truncate text-[10px] text-muted">{MEAL_LABELS[m]}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>

    </div>
  )
}

function forecastSentence(
  f: NonNullable<ReturnType<typeof useInsights>['forecast']>,
  target: number | null,
  today: string,
): string {
  const t = target === null ? '' : `${kg(target)} кг`
  switch (f.kind) {
    case 'eta':
      return `Ціль ${t} — орієнтовно ${monthLabel(f.date, today)} (≈ ${int(f.days)} днів) за поточного темпу.`
    case 'reached':
      return `Ціль ${t} досягнуто 🎉`
    case 'stalled':
      return `Вага майже не змінюється — за такого темпу ціль ${t} не наблизиться.`
    case 'away':
      return `Вага рухається від цілі ${t}.`
    case 'far':
      return `За поточного темпу до цілі ${t} понад 2 роки.`
  }
}

function Card({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06] ring-inset">
      <h3 className="text-sm font-bold">{title}</h3>
      {children}
    </section>
  )
}

function Big({ value, label, tone }: { value: string; label: string; tone?: string }) {
  return (
    <div className="flex flex-col">
      <span className={cn('text-2xl leading-tight font-bold', tone)}>{value}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  )
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-xs text-muted">{children}</p>
}

/** Середнє проти норми: смужка до 130% норми, риска — сама норма. */
function Bar({ label, value, goal, unit }: { label: string; value: number; goal: number; unit: string }) {
  const max = Math.max(goal * 1.3, value, 1)
  const over = goal > 0 && value > goal * 1.1
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-muted">{label}</span>
        <span>
          <b>{int(value)}</b> <span className="text-xs text-muted">/ {int(goal)} {unit}</span>
        </span>
      </div>
      <span className="relative h-1.5 rounded-full bg-white/[0.06]">
        <span
          className={cn('absolute inset-y-0 left-0 rounded-full', over ? 'bg-warning' : 'bg-primary/80')}
          style={{ width: `${(value / max) * 100}%` }}
        />
        {goal > 0 && <span className="absolute -inset-y-0.5 w-0.5 rounded-full bg-fg/60" style={{ left: `${(goal / max) * 100}%` }} />}
      </span>
    </div>
  )
}
