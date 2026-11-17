import { Bell, BellOff, Send } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { api } from '@/data/api'
import { disablePush, enablePush, pushStatus, type PushStatus } from '@/lib/push'
import { useUiStore } from '@/store/ui'

const HINTS: Record<Exclude<PushStatus, 'on' | 'off'>, string> = {
  'needs-install': 'Щоб отримувати сповіщення на iPhone, додайте застосунок на головний екран: Safari → «Поділитися» → «На початковий екран» — і відкрийте його звідти.',
  denied: 'Сповіщення заборонені. Дозвольте їх: Параметри iPhone → Сповіщення → Calories.',
  unsupported: 'Сповіщення працюють у встановленій версії застосунку (з головного екрана).',
}

/**
 * Налаштування сповіщень: порятунок серії, заморозка й підсумок тижня — щовечора близько 22:00.
 * Тут же — тестове сповіщення, щоб одразу перевірити, що все доходить.
 */
export function NotificationsSetting() {
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const toast = useUiStore((s) => s.showToast)

  useEffect(() => {
    void pushStatus().then(setStatus)
  }, [])

  if (status === null) return null

  const run = (fn: () => Promise<void>) => {
    setBusy(true)
    void fn()
      .catch((err: unknown) =>
        toast(err instanceof Error && err.message === 'push_not_configured' ? 'Сповіщення ще не налаштовані на сервері (ключі VAPID)' : 'Не вдалося — спробуйте ще раз'),
      )
      .finally(() => setBusy(false))
  }

  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-bold tracking-wider text-muted uppercase">Сповіщення</h3>
      <div className="flex flex-col gap-3 rounded-2xl bg-white/[0.03] p-4 ring-1 ring-inset ring-white/[0.07]">
        <p className="flex items-start gap-2.5 text-sm">
          {status === 'on' ? <Bell className="mt-0.5 size-4 shrink-0 text-primary" /> : <BellOff className="mt-0.5 size-4 shrink-0 text-muted" />}
          <span>
            {status === 'on' ? <b>Увімкнено</b> : <b>Вимкнено</b>}
            <span className="block text-xs text-muted">Порятунок серії, заморозка й підсумок тижня — щовечора близько 22:00</span>
          </span>
        </p>

        {status === 'off' && (
          <Button disabled={busy} onClick={() => run(async () => setStatus(await enablePush()))} className="w-full">
            <Bell className="size-4" /> Увімкнути сповіщення
          </Button>
        )}

        {status === 'on' && (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  const { sent } = await api.testPush()
                  toast(sent > 0 ? 'Тестове надіслано — зачекайте кілька секунд' : 'Не дійшло — спробуйте вимкнути й увімкнути', { tone: 'info' })
                })
              }
              className="flex-1 text-sm"
            >
              <Send className="size-4" /> Тестове
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await disablePush()
                  setStatus('off')
                })
              }
              className="flex-1 text-sm"
            >
              <BellOff className="size-4" /> Вимкнути
            </Button>
          </div>
        )}

        {status !== 'on' && status !== 'off' && <p className="text-xs leading-relaxed text-muted">{HINTS[status]}</p>}
      </div>
    </section>
  )
}
