import { Camera, LoaderCircle, Sparkles } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { MealType, Portion, PortionUnit } from '@shared/model.js'
import { scale } from '@shared/nutrition.js'
import { Button } from '@/components/ui/Button'
import { Field, NumberField } from '@/components/ui/Field'
import { SheetFooter } from '@/components/ui/Modal'
import { Switch } from '@/components/ui/Switch'
import type { LabelReading } from '@/data/api'
import { addEntry, buildEntry, newOwnFood, saveFood, type EntryDraft } from '@/data/store'
import { cn } from '@/lib/cn'
import { labelError, readLabelPhoto } from '@/lib/labelPhoto'
import { parseNum } from '@/lib/format'
import { useUiStore } from '@/store/ui'
import { NutrientsPreview } from '../NutrientsPreview'
import { LabelPhotoButton } from './LabelPhoto'
import { PortionChips, PortionEditor } from './Portions'

const n0 = (s: string) => parseNum(s) ?? 0
/** Число в поле — з комою, як усюди в застосунку. */
const field = (n: number) => String(n).replace('.', ',')

type Notice = { tone: 'ok' | 'warn'; text: string }

/** Що показати після фото: чи впевнений Gemini і що він перерахував. */
function labelNotice(l: LabelReading): Notice {
  const check = l.confidence === 'low' ? 'Gemini не впевнений — уважно перевір цифри.' : 'Перевір цифри перед збереженням.'
  return { tone: l.confidence === 'low' ? 'warn' : 'ok', text: [`Заповнено з фото етикетки. ${check}`, l.note].filter(Boolean).join(' ') }
}

/** Чернетка проходить ту саму валідацію, що й на сервері → повертає нормалізований запис. */
function tryBuild(draft: EntryDraft) {
  try {
    return buildEntry(draft, 'preview-id', 1)
  } catch {
    return null
  }
}

/** Страви немає в пошуку → вводимо цінність на 100 г вручну й одразу зберігаємо собі. */
export function ManualStep({
  meal,
  initialName,
  barcode,
  prefill,
  onDone,
}: {
  meal: MealType
  initialName: string
  /** Відскановано, але ніде не знайшли — запам'ятаємо зі стравою, наступного разу знайдеться одразу */
  barcode?: string | undefined
  /** Gemini прочитав етикетку — поля вже заповнені */
  prefill?: LabelReading | undefined
  onDone: () => void
}) {
  const date = useUiStore((s) => s.selectedDate)
  const [f, setF] = useState(() => ({
    name: prefill?.name || initialName,
    grams: '',
    kcal: prefill?.per100 ? field(prefill.per100.kcal) : '',
    protein: prefill?.per100 ? field(prefill.per100.protein) : '',
    fat: prefill?.per100 ? field(prefill.per100.fat) : '',
    carbs: prefill?.per100 ? field(prefill.per100.carbs) : '',
  }))
  const [saveToMine, setSaveToMine] = useState(true)
  // маса упаковки з етикетки — одразу порція «упаковка»
  const [portions, setPortions] = useState<Portion[]>(() =>
    prefill?.packageGrams ? [{ unit: 'package', grams: prefill.packageGrams }] : [],
  )
  const [reading, setReading] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(() => (prefill ? labelNotice(prefill) : null))
  /** Відкритий редактор порцій: false — закритий, null — без обраної одиниці. */
  const [editing, setEditing] = useState<PortionUnit | null | false>(false)
  const set = (k: keyof typeof f) => (v: string) => setF((s) => ({ ...s, [k]: v }))

  /** Фото етикетки прямо тут (напр. після сканера, коли штрихкод ніде не знайшовся) — заповнюємо поля. */
  const onPhoto = (file: File) => {
    setReading(true)
    setNotice(null)
    readLabelPhoto(file)
      .then((l) => {
        const p = l.per100
        if (!l.found || !p) {
          setNotice({ tone: 'warn', text: 'Не бачу харчової цінності на фото — сфотографуй таблицю ближче й рівніше.' })
          return
        }
        setF((s) => ({
          ...s,
          name: s.name || l.name,
          kcal: field(p.kcal),
          protein: field(p.protein),
          fat: field(p.fat),
          carbs: field(p.carbs),
        }))
        const pack = l.packageGrams
        if (pack) setPortions((ps) => [...ps.filter((x) => x.unit !== 'package'), { unit: 'package', grams: pack }])
        setNotice(labelNotice(l))
      })
      .catch((err: unknown) => setNotice({ tone: 'warn', text: labelError(err) }))
      .finally(() => setReading(false))
  }

  const draft: EntryDraft = {
    mode: 'weight',
    date,
    meal,
    name: f.name,
    grams: f.grams,
    per100: { kcal: f.kcal, protein: f.protein, fat: f.fat, carbs: f.carbs },
  }
  const built = tryBuild(draft)
  const preview = scale({ kcal: n0(f.kcal), protein: n0(f.protein), fat: n0(f.fat), carbs: n0(f.carbs) }, n0(f.grams))

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!built?.per100 || built.grams === null) return
    void addEntry(draft).catch(() => {})
    if (saveToMine) {
      void saveFood(
        newOwnFood({ name: built.name, per100: built.per100, servingGrams: built.grams, portions, barcode: barcode ?? null }),
      ).catch(() => {})
    }
    onDone()
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col gap-4">
      {barcode && (
        <p className="rounded-2xl bg-warning/10 px-3 py-2 text-xs text-warning">
          Штрихкод {barcode} ніде не знайдено. Сфотографуй етикетку або введи цифри вручну — страва збережеться з цим
          кодом, і наступного разу сканер знайде її одразу.
        </p>
      )}
      <LabelPhotoButton
        onFile={onPhoto}
        label="Заповнити з фото етикетки"
        className={cn(
          'flex h-11 items-center justify-center gap-2 rounded-2xl text-sm font-bold',
          barcode ? 'bg-accent-gradient glow text-white' : 'bg-primary/15 text-primary',
          reading && 'pointer-events-none opacity-60',
        )}
      >
        {reading ? <LoaderCircle className="size-4 animate-spin" /> : <Camera className="size-4" />}
        {reading ? 'Gemini читає етикетку…' : 'Заповнити з фото етикетки'}
      </LabelPhotoButton>
      {notice && (
        <p
          className={cn(
            'flex gap-2 rounded-2xl px-3 py-2 text-xs',
            notice.tone === 'ok' ? 'bg-primary/10 text-primary' : 'bg-warning/10 text-warning',
          )}
        >
          <Sparkles className="mt-px size-3.5 shrink-0" />
          {notice.text}
        </p>
      )}
      <Field label="Назва" value={f.name} onChange={set('name')} placeholder="Сирники" autoFocus={!f.name} />
      <NumberField label="Вага порції" suffix="г" value={f.grams} onChange={set('grams')} autoFocus={!!f.name} />
      <p className="-mb-2 text-xs font-medium tracking-wider text-muted uppercase">На 100 г продукту</p>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Калорії" suffix="ккал" value={f.kcal} onChange={set('kcal')} />
        <NumberField label="Білки" suffix="г" value={f.protein} onChange={set('protein')} />
        <NumberField label="Жири" suffix="г" value={f.fat} onChange={set('fat')} />
        <NumberField label="Вуглеводи" suffix="г" value={f.carbs} onChange={set('carbs')} />
      </div>
      <NutrientsPreview value={preview} />
      <Switch
        checked={saveToMine}
        onChange={setSaveToMine}
        label="Зберегти в мої страви"
        hint="Наступного разу знайдеться в пошуку"
      />
      {saveToMine &&
        (editing !== false ? (
          <PortionEditor
            portions={portions}
            onChange={setPortions}
            onClose={() => setEditing(false)}
            initialUnit={editing}
          />
        ) : (
          <PortionChips portions={portions} onSelect={(unit) => setEditing(unit)} onEdit={() => setEditing(null)} />
        ))}
      <SheetFooter>
        <Button type="submit" disabled={!built} className="flex-1">
          Додати
        </Button>
      </SheetFooter>
    </form>
  )
}
