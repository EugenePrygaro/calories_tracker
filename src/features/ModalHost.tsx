import { LoaderCircle } from 'lucide-react'
import { Suspense, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useUiStore, type Modal as ModalState } from '@/store/ui'
import {
  AchievementsSheet,
  AddFoodSheet,
  BodySheet,
  CalcSheet,
  CalendarSheet,
  EditEntryForm,
  GoalsForm,
  ShopSheet,
  StatsSheet,
} from './lazySheets'

const TALL: ReadonlySet<ModalState['type']> = new Set(['add', 'body', 'achievements', 'shop', 'stats', 'calc'])

function titleOf(m: ModalState): string {
  switch (m.type) {
    case 'add':
      return 'Додати їжу'
    case 'edit':
      return 'Редагувати запис'
    case 'goals':
      return 'Налаштування'
    case 'body':
      return 'Параметри тіла'
    case 'achievements':
      return 'Досягнення'
    case 'shop':
      return 'Магазин'
    case 'stats':
      return 'Статистика'
    case 'calc':
      return 'Калькулятор порцій'
    case 'calendar':
      return 'Календар'
  }
}

/** Єдине місце, де рендеряться модалки; яка відкрита — вирішує Zustand. */
export function ModalHost() {
  const modal = useUiStore((s) => s.modal)
  const close = useUiStore((s) => s.closeModal)

  // Тримаємо останню модалку, щоб вміст не зникав під час анімації закриття.
  const [shown, setShown] = useState(modal)
  if (modal && modal !== shown) setShown(modal)

  return (
    <Modal open={modal !== null} title={shown ? titleOf(shown) : ''} onClose={close} tall={!!shown && TALL.has(shown.type)}>
      {/* Шторки — окремими чанками (див. lazySheets); зазвичай уже підтягнуті заздалегідь */}
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center py-16 text-muted">
            <LoaderCircle className="size-6 animate-spin" />
          </div>
        }
      >
      {shown?.type === 'add' && <AddFoodSheet key={JSON.stringify(shown)} initialMeal={shown.meal} onDone={close} />}
      {shown?.type === 'edit' && (
        <EditEntryForm key={shown.entryId} date={shown.date} entryId={shown.entryId} onDone={close} />
      )}
      {shown?.type === 'goals' && <GoalsForm onDone={close} />}
      {shown?.type === 'body' && <BodySheet />}
      {shown?.type === 'achievements' && <AchievementsSheet />}
      {shown?.type === 'shop' && <ShopSheet />}
      {shown?.type === 'stats' && <StatsSheet />}
      {shown?.type === 'calc' && <CalcSheet />}
      {shown?.type === 'calendar' && <CalendarSheet onDone={close} />}
      </Suspense>
    </Modal>
  )
}
