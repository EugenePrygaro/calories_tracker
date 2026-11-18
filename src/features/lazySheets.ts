import { lazy } from 'react'

/**
 * Шторки й рідкісні частини інтерфейсу — окремими чанками: старт парсить лише
 * головний екран. Коли браузер вільний, prefetchSheets() підтягує їх заздалегідь,
 * тож перше відкриття шторки однаково миттєве (а офлайн їх і так віддає сервіс-воркер).
 */
const loaders = {
  add: () => import('./add/AddFoodSheet'),
  edit: () => import('./EditEntryForm'),
  goals: () => import('./GoalsForm'),
  body: () => import('./body/BodySheet'),
  achievements: () => import('./game/AchievementsSheet'),
  shop: () => import('./game/ShopSheet'),
  stats: () => import('./stats/StatsSheet'),
  calc: () => import('./calc/CalcSheet'),
  calendar: () => import('./stats/CalendarSheet'),
  foods: () => import('./foods/FoodsSheet'),
  streak: () => import('./game/StreakSheet'),
  insights: () => import('./insights/InsightsSheet'),
}

export const AddFoodSheet = lazy(() => loaders.add().then((m) => ({ default: m.AddFoodSheet })))
export const EditEntryForm = lazy(() => loaders.edit().then((m) => ({ default: m.EditEntryForm })))
export const GoalsForm = lazy(() => loaders.goals().then((m) => ({ default: m.GoalsForm })))
export const BodySheet = lazy(() => loaders.body().then((m) => ({ default: m.BodySheet })))
export const AchievementsSheet = lazy(() => loaders.achievements().then((m) => ({ default: m.AchievementsSheet })))
export const ShopSheet = lazy(() => loaders.shop().then((m) => ({ default: m.ShopSheet })))
export const StatsSheet = lazy(() => loaders.stats().then((m) => ({ default: m.StatsSheet })))
export const CalcSheet = lazy(() => loaders.calc().then((m) => ({ default: m.CalcSheet })))
export const CalendarSheet = lazy(() => loaders.calendar().then((m) => ({ default: m.CalendarSheet })))
export const FoodsSheet = lazy(() => loaders.foods().then((m) => ({ default: m.FoodsSheet })))
export const StreakSheet = lazy(() => loaders.streak().then((m) => ({ default: m.StreakSheet })))
export const InsightsSheet = lazy(() => loaders.insights().then((m) => ({ default: m.InsightsSheet })))

/** DEV-панель — лише коли вона ввімкнена (на Vercel її чанк навіть не завантажується). */
export const DevPanel = lazy(() => import('./dev/DevPanel').then((m) => ({ default: m.DevPanel })))

/** Підтягнути шторки у вільний час після старту. */
export function prefetchSheets(): void {
  const run = () => {
    for (const load of Object.values(loaders)) void load().catch(() => {})
  }
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 4000 })
  else setTimeout(run, 2000)
}
