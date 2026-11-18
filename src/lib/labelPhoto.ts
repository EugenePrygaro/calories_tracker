import { useEffect, useState } from 'react'
import { ApiError, NetworkError, api, type LabelReading } from '@/data/api'

/**
 * Фото етикетки для Gemini: стискаємо на телефоні до ~1600 px JPEG — дрібний шрифт таблиці
 * ще читається, а запит важить кілька сотень КБ замість кількох МБ (і вкладається в ліміт Vercel).
 * Орієнтацію беремо з EXIF (фото з камери iPhone часто «лежить на боці» без цього).
 */
const MAX_SIDE = 1600
const QUALITY = 0.85

export async function compressPhoto(file: Blob): Promise<{ data: string; mimeType: 'image/jpeg' }> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file))
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode_failed'))), 'image/jpeg', QUALITY),
  )
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('read_failed'))
    reader.readAsDataURL(blob)
  })
  return { data: dataUrl.slice(dataUrl.indexOf(',') + 1), mimeType: 'image/jpeg' }
}

/** Фото → що прочитав Gemini. Помилки — зрозумілим текстом (labelError). */
export async function readLabelPhoto(file: Blob, signal?: AbortSignal): Promise<LabelReading> {
  const { data, mimeType } = await compressPhoto(file)
  return (await api.readLabel(data, mimeType, signal)).label
}

export function labelError(err: unknown): string {
  if (err instanceof NetworkError) return 'Немає зв’язку з сервером — введи цифри вручну.'
  if (err instanceof ApiError) {
    if (err.message === 'ai_daily_limit') return 'Ліміт фото на сьогодні вичерпано — введи цифри вручну.'
    if (err.message === 'ai_rate_limited') return 'Google тимчасово обмежив запити — спробуй за хвилину.'
    if (err.message === 'ai_not_configured') return 'AI не налаштовано на сервері.'
    if (err.message === 'image_too_large') return 'Фото завелике — спробуй ще раз.'
  }
  return 'Не вдалося прочитати етикетку — спробуй ще раз або введи вручну.'
}

let configured: Promise<boolean> | null = null

/**
 * Чи є на сервері ключ Gemini: true / false, null — ще не знаємо. Питаємо раз за сесію.
 * Кнопку фото показуємо завжди: без ключа вона підказує, як увімкнути.
 */
export function useAiConfigured(): boolean | null {
  const [ok, setOk] = useState<boolean | null>(null)
  useEffect(() => {
    let alive = true
    configured ??= api
      .aiStatus()
      .then((r) => r.configured)
      .catch(() => {
        configured = null // без мережі — спитаємо наступного разу
        return false
      })
    void configured.then((v) => alive && setOk(v))
    return () => {
      alive = false
    }
  }, [])
  return ok
}
