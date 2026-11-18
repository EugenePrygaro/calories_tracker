import { Camera, LoaderCircle, PencilLine } from 'lucide-react'
import { useCallback, useEffect, useEffectEvent, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { type LabelReading } from '@/data/api'
import { cn } from '@/lib/cn'
import { labelError, readLabelPhoto, useAiConfigured } from '@/lib/labelPhoto'
import { useUiStore } from '@/store/ui'

/**
 * Кнопка «сфотографувати»: прихований input із capture — на телефоні одразу системна камера
 * (у PWA на iPhone це надійніше за getUserMedia), на ПК — вибір файлу.
 */
export function PhotoPicker({
  onFile,
  label,
  className,
  children,
}: {
  onFile: (file: File) => void
  label: string
  className?: string | undefined
  children: ReactNode
}) {
  return (
    <label aria-label={label} title={label} className={cn('cursor-pointer', className)}>
      {children}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = '' // те саме фото ще раз — теж спрацює
          if (file) onFile(file)
        }}
      />
    </label>
  )
}

const NOT_CONFIGURED =
  'Фото етикетки ще не увімкнено: додай GEMINI_API_KEY у змінні Vercel і передеплой (локально — у файл .env.local).'

/** Кнопка фото етикетки: є завжди; без ключа Gemini на сервері — замість камери підказка, як увімкнути. */
export function LabelPhotoButton({
  onFile,
  label,
  className,
  children,
}: {
  onFile: (file: File) => void
  label: string
  className?: string
  children: ReactNode
}) {
  const ai = useAiConfigured()
  if (ai === false) {
    return (
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={() => useUiStore.getState().showToast(NOT_CONFIGURED, { tone: 'info' })}
        className={className}
      >
        {children}
      </button>
    )
  }
  return (
    <PhotoPicker onFile={onFile} label={label} className={className}>
      {children}
    </PhotoPicker>
  )
}

/** Крок «Gemini читає етикетку»: прев'ю фото, очікування, помилка з повтором або ручним введенням. */
export function LabelStep({
  file,
  onRead,
  onManual,
}: {
  file: File
  onRead: (label: LabelReading) => void
  onManual: () => void
}) {
  // «Інше фото» — новий зчитувач (key): свій прев'ю, свій запит, без скидання стану в ефекті
  const [shot, setShot] = useState({ file, n: 0 })
  return (
    <LabelReader
      key={shot.n}
      file={shot.file}
      onRead={onRead}
      onManual={onManual}
      onRetake={(f) => setShot((s) => ({ file: f, n: s.n + 1 }))}
    />
  )
}

function LabelReader({
  file,
  onRead,
  onManual,
  onRetake,
}: {
  file: File
  onRead: (label: LabelReading) => void
  onManual: () => void
  onRetake: (file: File) => void
}) {
  const [error, setError] = useState<string | null>(null)
  const done = useEffectEvent((label: LabelReading) => onRead(label))

  useEffect(() => {
    const ctrl = new AbortController()
    readLabelPhoto(file, ctrl.signal)
      .then((label) => {
        if (ctrl.signal.aborted) return
        if (label.found) done(label)
        else setError('Не бачу харчової цінності на фото — сфотографуй таблицю ближче й рівніше.')
      })
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) setError(labelError(err))
      })
    return () => ctrl.abort()
  }, [file])
  // адреса фото живе рівно стільки, скільки сама картинка (React 19: ref із функцією очищення)
  const showPhoto = useCallback(
    (img: HTMLImageElement | null) => {
      if (!img) return
      const url = URL.createObjectURL(file)
      img.src = url
      return () => URL.revokeObjectURL(url)
    },
    [file],
  )

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="relative aspect-[3/4] max-h-[50dvh] w-full overflow-hidden rounded-3xl bg-black">
        <img ref={showPhoto} alt="Фото етикетки" className="size-full object-contain" />
        {!error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 text-sm text-white">
            <LoaderCircle className="size-7 animate-spin" />
            Gemini читає етикетку…
          </div>
        )}
      </div>
      {error ? (
        <>
          <p className="rounded-2xl bg-warning/10 px-3 py-2 text-sm text-warning">{error}</p>
          <div className="flex gap-2">
            <PhotoPicker
              onFile={onRetake}
              label="Інше фото"
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-elevated text-sm font-bold"
            >
              <Camera className="size-5" /> Інше фото
            </PhotoPicker>
            <Button variant="ghost" onClick={onManual} className="flex-1 text-sm">
              <PencilLine className="size-4" /> Вручну
            </Button>
          </div>
        </>
      ) : (
        <p className="text-sm text-muted">
          Шукаємо таблицю «Харчова цінність»: калорії й БЖВ на 100 г, масу упаковки. Займає кілька секунд.
        </p>
      )}
    </div>
  )
}
