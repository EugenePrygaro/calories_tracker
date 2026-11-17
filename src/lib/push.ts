import { api } from '@/data/api'

/**
 * Пуш-сповіщення з боку клієнта. На iPhone (iOS 16.4+) вони працюють лише в застосунку,
 * доданому на головний екран, і дозвіл можна просити тільки з тапу — тому enablePush
 * викликається напряму з кнопки, і запит дозволу йде першим.
 */
export type PushStatus = 'needs-install' | 'unsupported' | 'denied' | 'off' | 'on'

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  return supported() ? navigator.serviceWorker.getRegistration() : undefined
}

export async function pushStatus(): Promise<PushStatus> {
  if (!supported()) return isIos() && !isStandalone() ? 'needs-install' : 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await registration()
  if (!reg) return 'unsupported' // сервіс-воркера немає (наприклад, у режимі розробки)
  return (await reg.pushManager.getSubscription()) ? 'on' : 'off'
}

/** base64url → байти (ключ VAPID для підписки). */
function keyBytes(base64: string): Uint8Array<ArrayBuffer> {
  const pad = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

/** Увімкнути: дозвіл (з тапу) → підписка пристрою → збереження на сервері. */
export async function enablePush(): Promise<PushStatus> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'
  const reg = await navigator.serviceWorker.ready
  const { publicKey } = await api.getPush()
  if (!publicKey) throw new Error('push_not_configured')
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }))
  await api.savePush(sub.toJSON(), new Date().getTimezoneOffset())
  return 'on'
}

export async function disablePush(): Promise<void> {
  const sub = await (await registration())?.pushManager.getSubscription()
  if (!sub) return
  await api.deletePush(sub.endpoint).catch(() => {})
  await sub.unsubscribe()
}

const RESYNC_KEY = 'push:resync'

/**
 * Раз на добу освіжаємо підписку на сервері: iOS інколи міняє її, а часовий пояс міг змінитися.
 * Нічого не робить, якщо сповіщення не ввімкнені (без зайвих запитів).
 */
export async function resyncPush(): Promise<void> {
  try {
    if (!supported() || Notification.permission !== 'granted') return
    const today = new Date().toDateString()
    if (localStorage.getItem(RESYNC_KEY) === today) return
    const sub = await (await registration())?.pushManager.getSubscription()
    if (!sub) return
    await api.savePush(sub.toJSON(), new Date().getTimezoneOffset())
    localStorage.setItem(RESYNC_KEY, today)
  } catch {
    // офлайн чи сервер недоступний — спробуємо наступного разу
  }
}
