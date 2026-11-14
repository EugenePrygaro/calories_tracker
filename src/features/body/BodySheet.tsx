import { AnimatePresence, motion } from 'framer-motion'
import { Check, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { BODY_FIELDS, BODY_LABELS, type BodyField, type BodyRecord } from '@shared/model.js'
import { sanitizeBodyRecord } from '@shared/validate.js'
import { Button } from '@/components/ui/Button'
import { NumberField } from '@/components/ui/Field'
import { SheetFooter } from '@/components/ui/Modal'
import { Segmented } from '@/components/ui/Segmented'
import { deleteBodyRecord, saveBodyRecord, useBody, useTargetWeight, type BodyInput } from '@/data/store'
import { latestMeasure, weightSeries } from '@/lib/body'
import { addDays, formatDateKey, toDateKey } from '@/lib/date'
import { cm, kg, signed } from '@/lib/format'
import { useUiStore } from '@/store/ui'
import { WeightChart } from './WeightChart'

type Range = '1m' | '3m' | '1y' | 'all'
const RANGES = [
  { value: '1m', label: 'Місяць' },
  { value: '3m', label: '3 міс' },
  { value: '1y', label: 'Рік' },
  { value: 'all', label: 'Усе' },
] as const satisfies readonly { value: Range; label: string }[]
const RANGE_DAYS: Record<Range, number | null> = { '1m': 30, '3m': 91, '1y': 365, all: null }

/** Шторка «Параметри тіла»: графік ваги, заміри за вибраний день, історія. */
export function BodySheet() {
  const records = useBody()
  const target = useTargetWeight()
  const date = useUiStore((s) => s.selectedDate)
  const [range, setRange] = useState<Range>('3m')

  const days = RANGE_DAYS[range]
  const from = days === null ? '' : addDays(toDateKey(), -days)
  const points = weightSeries(records).filter((p) => p.date >= from)
  const change = points.length > 1 ? Math.round(((points.at(-1)?.value ?? 0) - (points[0]?.value ?? 0)) * 10) / 10 : null

  return (
    <div className="flex flex-1 flex-col gap-4">
      {/* Фільтр періоду — над графіком, впливає на графік і підсумок */}
      <Segmented label="Період" value={range} options={RANGES} onChange={setRange} />

      <section className="card-static flex flex-col gap-2 rounded-3xl p-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-bold">Вага</h3>
          {change !== null && (
            <span className="text-xs text-muted">
              за період <b className={change < 0 ? 'text-primary' : 'text-fg'}>{signed(change)} кг</b>
            </span>
          )}
        </div>
        <WeightChart points={points} target={target} />
      </section>

      <BodyForm key={date} date={date} record={records.find((r) => r.date === date)} records={records} />

      <History records={records} />
    </div>
  )
}

type FormState = Record<BodyField, string>

/** Число в поле вводу з українською комою: 78,4 */
const toField = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','))

function BodyForm({ date, record, records }: { date: string; record: BodyRecord | undefined; records: readonly BodyRecord[] }) {
  const [f, setF] = useState<FormState>(() => ({
    weight: toField(record?.weight),
    chest: toField(record?.chest),
    waist: toField(record?.waist),
    hips: toField(record?.hips),
  }))
  const [saved, setSaved] = useState(false)
  const set = (k: BodyField) => (v: string) => {
    setSaved(false)
    setF((s) => ({ ...s, [k]: v }))
  }

  let valid = true
  try {
    sanitizeBodyRecord({ date, ...f, updatedAt: 1 })
  } catch {
    valid = false
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return
    void saveBodyRecord(date, f as BodyInput)
      .then(() => setSaved(true))
      .catch(() => {})
  }

  /** Підказка в порожньому полі — останнє відоме значення. */
  const placeholder = (field: BodyField) => {
    const m = latestMeasure(records, field)
    return m ? (field === 'weight' ? kg(m.value) : cm(m.value)) : '—'
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <h3 className="text-xs font-bold tracking-wider text-muted uppercase">
        Заміри · {formatDateKey(date)}
      </h3>
      <NumberField
        label={BODY_LABELS.weight.label}
        suffix={BODY_LABELS.weight.unit}
        value={f.weight}
        onChange={set('weight')}
        placeholder={placeholder('weight')}
      />
      <div className="grid grid-cols-3 gap-3">
        {BODY_FIELDS.filter((x) => x !== 'weight').map((field) => (
          <NumberField
            key={field}
            label={BODY_LABELS[field].label}
            suffix={BODY_LABELS[field].unit}
            value={f[field]}
            onChange={set(field)}
            placeholder={placeholder(field)}
          />
        ))}
      </div>
      <SheetFooter>
        <Button type="submit" disabled={!valid} className="flex-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={saved ? 'saved' : 'save'}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="flex items-center gap-2"
            >
              {saved ? (
                <>
                  <Check className="size-5" /> Збережено
                </>
              ) : record ? (
                'Оновити заміри'
              ) : (
                'Зберегти заміри'
              )}
            </motion.span>
          </AnimatePresence>
        </Button>
      </SheetFooter>
    </form>
  )
}

/** Історія — і таблиця значень графіка, і місце, де можна видалити помилковий запис. */
function History({ records }: { records: readonly BodyRecord[] }) {
  const rows = [...records].reverse().slice(0, 30)
  if (rows.length === 0) return null

  return (
    <section className="flex flex-col pb-2">
      <h3 className="pb-1 text-xs font-bold tracking-wider text-muted uppercase">Історія</h3>
      <ul>
        <AnimatePresence initial={false}>
          {rows.map((r) => (
            <motion.li
              key={r.date}
              layout
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-3 border-b border-line/60 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{formatDateKey(r.date)}</p>
                  <p className="truncate text-xs text-muted">
                    {[
                      r.chest !== null && `Г ${cm(r.chest)}`,
                      r.waist !== null && `Т ${cm(r.waist)}`,
                      r.hips !== null && `С ${cm(r.hips)}`,
                    ]
                      .filter(Boolean)
                      .join(' · ') || 'лише вага'}
                  </p>
                </div>
                <span className="text-sm font-bold">{r.weight !== null ? `${kg(r.weight)} кг` : '—'}</span>
                <button
                  type="button"
                  aria-label={`Видалити заміри за ${formatDateKey(r.date)}`}
                  onClick={() => void deleteBodyRecord(r.date).catch(() => {})}
                  className="flex size-11 items-center justify-center rounded-full text-muted active:bg-white/5"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  )
}
