import { useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { useUiStore, type Modal as ModalState } from '@/store/ui'
import { AddFoodSheet } from './add/AddFoodSheet'
import { BodySheet } from './body/BodySheet'
import { AchievementsSheet } from './game/AchievementsSheet'
import { EditEntryForm } from './EditEntryForm'
import { GoalsForm } from './GoalsForm'

function titleOf(m: ModalState): string {
  switch (m.type) {
    case 'add':
      return 'Додати їжу'
    case 'edit':
      return 'Редагувати запис'
    case 'goals':
      return 'Профіль і цілі'
    case 'body':
      return 'Параметри тіла'
    case 'achievements':
      return 'Досягнення'
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
    <Modal open={modal !== null} title={shown ? titleOf(shown) : ''} onClose={close} tall={shown?.type === 'add' || shown?.type === 'body' || shown?.type === 'achievements'}>
      {shown?.type === 'add' && <AddFoodSheet key={JSON.stringify(shown)} initialMeal={shown.meal} onDone={close} />}
      {shown?.type === 'edit' && (
        <EditEntryForm key={shown.entryId} date={shown.date} entryId={shown.entryId} onDone={close} />
      )}
      {shown?.type === 'goals' && <GoalsForm onDone={close} />}
      {shown?.type === 'body' && <BodySheet />}
      {shown?.type === 'achievements' && <AchievementsSheet />}
    </Modal>
  )
}
