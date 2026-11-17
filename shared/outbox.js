/**
 * Черга офлайн-змін (outbox): що не вдалося надіслати без мережі, чекає тут і йде на сервер,
 * щойно з'явиться зв'язок. Чиста логіка — склеювання змін і накладання черги на дані з сервера;
 * зберігання в localStorage і надсилання — у src/data/store.ts.
 *
 * Склеювання (за ключем об'єкта):
 *   - кілька збережень одного запису → лише останнє (але «новий» і foodId/source першого лишаються);
 *   - запис створили й видалили офлайн → на сервер не йде нічого;
 *   - видалили, а потім повернули → лише збереження.
 */

/** @typedef {import('./model.js').Entry} Entry */
/** @typedef {import('./model.js').Food} Food */
/** @typedef {import('./model.js').BodyRecord} BodyRecord */
/** @typedef {import('./model.js').Profile} Profile */

/**
 * @typedef {(
 *   | { kind: 'putEntry', key: string, entry: Entry, isNew: boolean, source?: 'copy', foodId?: string }
 *   | { kind: 'deleteEntry', key: string, id: string, date: string }
 *   | { kind: 'putProfile', key: string, profile: Profile }
 *   | { kind: 'putBody', key: string, record: BodyRecord }
 *   | { kind: 'deleteBody', key: string, date: string }
 *   | { kind: 'putFood', key: string, food: Food }
 * )} OutboxOp
 */

export const entryKey = (/** @type {string} */ id) => `entry:${id}`
export const bodyKey = (/** @type {string} */ date) => `body:${date}`
export const foodKey = (/** @type {string} */ id) => `food:${id}`
export const PROFILE_KEY = 'profile'

/**
 * Додати зміну в чергу (повертає нову чергу; стара не змінюється).
 * @param {readonly OutboxOp[]} queue @param {OutboxOp} op @returns {OutboxOp[]}
 */
export function enqueue(queue, op) {
  const i = queue.findIndex((q) => q.key === op.key)
  if (i < 0) return [...queue, op]
  const prev = /** @type {OutboxOp} */ (queue[i])
  const out = [...queue]

  if (op.kind === 'putEntry' && prev.kind === 'putEntry') {
    // нова версія того самого запису; ознаки першого збереження зберігаємо
    out[i] = {
      ...op,
      isNew: prev.isNew || op.isNew,
      ...((prev.source ?? op.source) ? { source: prev.source ?? op.source } : {}),
      ...((prev.foodId ?? op.foodId) ? { foodId: prev.foodId ?? op.foodId } : {}),
    }
    return out
  }
  if (op.kind === 'deleteEntry' && prev.kind === 'putEntry' && prev.isNew) {
    out.splice(i, 1) // сервер про запис ще не знає — і не дізнається
    return out
  }
  out[i] = op // інші випадки: остання дія перемагає
  return out
}

/**
 * Повернути на початок черги зміну, яку не вдалося надіслати (мережа зникла посеред запиту).
 * Якщо поки вона «летіла», той самий об'єкт змінили ще раз — новіша зміна перемагає,
 * але успадковує ознаки першого збереження.
 * @param {readonly OutboxOp[]} queue @param {OutboxOp} op @returns {OutboxOp[]}
 */
export function requeueFront(queue, op) {
  const i = queue.findIndex((q) => q.key === op.key)
  if (i < 0) return [op, ...queue]
  const newer = /** @type {OutboxOp} */ (queue[i])
  const out = [...queue]
  if (op.kind === 'putEntry' && op.isNew) {
    if (newer.kind === 'putEntry') {
      out[i] = {
        ...newer,
        isNew: true,
        ...((op.source ?? newer.source) ? { source: op.source ?? newer.source } : {}),
        ...((op.foodId ?? newer.foodId) ? { foodId: op.foodId ?? newer.foodId } : {}),
      }
    } else if (newer.kind === 'deleteEntry') {
      out.splice(i, 1) // створили й видалили, сервер так і не побачив
    }
  }
  return out
}

/**
 * Записи дня з сервера + ще не надіслані зміни цього дня.
 * @param {readonly Entry[]} entries @param {string} date @param {readonly OutboxOp[]} queue @returns {Entry[]}
 */
export function overlayDay(entries, date, queue) {
  let out = [...entries]
  for (const op of queue) {
    if (op.kind === 'putEntry' && op.entry.date === date) out = [...out.filter((e) => e.id !== op.entry.id), op.entry]
    else if (op.kind === 'deleteEntry' && op.date === date) out = out.filter((e) => e.id !== op.id)
  }
  return out.sort((a, b) => a.createdAt - b.createdAt)
}

/** @param {readonly Food[]} foods @param {readonly OutboxOp[]} queue @returns {Food[]} */
export function overlayFoods(foods, queue) {
  let out = [...foods]
  for (const op of queue) if (op.kind === 'putFood') out = [...out.filter((f) => f.id !== op.food.id), op.food]
  return out.sort((a, b) => b.updatedAt - a.updatedAt)
}

/** @param {readonly BodyRecord[]} records @param {readonly OutboxOp[]} queue @returns {BodyRecord[]} */
export function overlayBody(records, queue) {
  let out = [...records]
  for (const op of queue) {
    if (op.kind === 'putBody') out = [...out.filter((r) => r.date !== op.record.date), op.record]
    else if (op.kind === 'deleteBody') out = out.filter((r) => r.date !== op.date)
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/** @param {Profile | null} profile @param {readonly OutboxOp[]} queue @returns {Profile | null} */
export function overlayProfile(profile, queue) {
  const op = queue.find((q) => q.kind === 'putProfile')
  return op && op.kind === 'putProfile' ? op.profile : profile
}
