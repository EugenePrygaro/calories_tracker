import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  addDays,
  analyze,
  foodBreakdown,
  goalForecast,
  insightChecks,
  intakeSummary,
  kcalForPace,
  realExpenditure,
  weightTrend,
} from '../shared/insights.js'

const TODAY = '2026-11-18'
/** Зважування кожні step днів за days днів: вага падає на perWeek кг на тиждень. */
const weighIns = (start, perWeek, days = 28, step = 2) =>
  Array.from({ length: Math.floor(days / step) + 1 }, (_, i) => {
    const back = days - i * step
    return { date: addDays(TODAY, -back), weight: Math.round((start + (perWeek / 7) * (days - back)) * 100) / 100, chest: null, waist: null, hips: null, updatedAt: 1 }
  })
const day = (date, kcal, over = {}) => ({
  date,
  kcal,
  protein: 130,
  fat: 60,
  carbs: 200,
  entries: 5,
  goals: { kcal: 2000, protein: 120, fat: 70, carbs: 220 },
  ...over,
})
const days = (n, kcal, over) => Array.from({ length: n }, (_, i) => day(addDays(TODAY, -(i + 1)), kcal, over))

test('тренд ваги: пряма через зважування, вага на сьогодні', () => {
  const t = weightTrend(weighIns(80, -0.5), TODAY)
  assert.equal(t?.perWeek, -0.5)
  assert.equal(t?.weight, 78)
  // замало зважувань чи надто короткий проміжок — тренду немає
  assert.equal(weightTrend(weighIns(80, -0.5).slice(-2), TODAY), null)
  assert.equal(weightTrend(weighIns(80, -0.5, 4, 2), TODAY), null)
  // дані поза вікном не враховуються
  assert.equal(weightTrend([{ date: '2026-01-01', weight: 90 }, ...weighIns(80, -0.5)], TODAY)?.perWeek, -0.5)
})

test('прогноз: дата цілі, стоїть, віддаляється, досягнуто', () => {
  const t = { perWeek: -0.5, weight: 78, weighIns: 15, spanDays: 28 }
  assert.deepEqual(goalForecast(t, 76, TODAY), { kind: 'eta', date: addDays(TODAY, 28), days: 28 })
  assert.deepEqual(goalForecast({ ...t, perWeek: 0.02 }, 76, TODAY), { kind: 'stalled' })
  assert.deepEqual(goalForecast({ ...t, perWeek: 0.3 }, 76, TODAY), { kind: 'away' })
  assert.deepEqual(goalForecast(t, 77.9, TODAY), { kind: 'reached' })
  assert.equal(goalForecast(t, 20, TODAY)?.kind, 'far') // 58 кг × 2 тиж/кг ≈ 812 днів > 2 років
  assert.equal(goalForecast(t, null, TODAY), null)
})

test('реальний розхід: з’їдене + калорії зміни ваги', () => {
  const intake = intakeSummary(days(28, 1800), TODAY)
  assert.equal(intake?.loggedDays, 28)
  // −0,5 кг/тиж = −550 ккал на день → розхід 1800 + 550
  assert.equal(realExpenditure({ perWeek: -0.5, weight: 78, weighIns: 15, spanDays: 28 }, intake), 2350)
  assert.equal(kcalForPace(2350, -0.5), 1800)
  // замало днів — не рахуємо
  assert.equal(realExpenditure({ perWeek: -0.5, weight: 78, weighIns: 15, spanDays: 28 }, intakeSummary(days(5, 1800), TODAY)), null)
})

test('їжа за вікно: лише завершені дні, будні проти вихідних', () => {
  const s = [...days(28, 1800), day(TODAY, 3000)] // сьогодні не враховується
  const i = intakeSummary(s, TODAY)
  assert.equal(i?.avg.kcal, 1800)
  assert.equal(i?.coverage, 1)
  const withWeekends = days(28, 1800).map((d) => ([0, 6].includes(new Date(`${d.date}T00:00:00Z`).getUTCDay()) ? { ...d, kcal: 2600 } : d))
  const w = intakeSummary(withWeekends, TODAY)
  assert.equal(w?.weekend, 2600)
  assert.equal(w?.weekday, 1800)
})

test('перевірки: темп, білок, жири, норма, вихідні, повнота — від найважливіших', () => {
  const trend = { perWeek: -1.2, weight: 80, weighIns: 15, spanDays: 28 }
  const intake = {
    loggedDays: 14,
    windowDays: 28,
    coverage: 0.5,
    avg: { kcal: 2300, protein: 80, fat: 40, carbs: 250 },
    goals: { kcal: 2000, protein: 120, fat: 70, carbs: 220 },
    weekday: 2100,
    weekend: 2700,
  }
  const checks = insightChecks({ trend, intake, weight: 80, targetWeight: 70 })
  assert.deepEqual(
    checks.map((c) => `${c.level}:${c.id}`),
    ['bad:protein', 'warn:coverage', 'warn:pace', 'warn:fat', 'warn:norm', 'warn:weekend'],
  )
  // усе добре
  const ok = insightChecks({
    trend: { ...trend, perWeek: -0.6 },
    intake: { ...intake, coverage: 1, loggedDays: 28, avg: { kcal: 1950, protein: 140, fat: 65, carbs: 200 }, weekend: 2150 },
    weight: 80,
    targetWeight: 70,
  })
  assert.deepEqual(ok.map((c) => `${c.level}:${c.id}`), ['good:pace', 'good:protein'])
  // вага стоїть / росте
  assert.equal(insightChecks({ trend: { ...trend, perWeek: 0.05 }, intake: null, weight: 80, targetWeight: 70 })[0]?.id, 'pace')
  assert.equal(insightChecks({ trend: { ...trend, perWeek: 0.5 }, intake: null, weight: 80, targetWeight: 70 })[0]?.level, 'bad')
})

test('що дає найбільше калорій: страви за назвою і прийоми їжі', () => {
  const e = (name, kcal, meal = 'lunch') => ({ name, kcal, meal })
  const b = foodBreakdown([e('Хліб', 300), e('хліб ', 200, 'dinner'), e('Борщ', 400), e('Яблуко', 100, 'snack')], 7, 2)
  assert.deepEqual(b.foods, [
    { name: 'Хліб', kcal: 500, share: 50, times: 2 },
    { name: 'Борщ', kcal: 400, share: 40, times: 1 },
  ])
  assert.deepEqual(b.meals, { breakfast: 0, lunch: 70, dinner: 20, snack: 10 })
  assert.equal(b.totalKcal, 1000)
})

test('analyze: усе разом — прогноз, розхід, темпи', () => {
  const a = analyze({ summaries: days(28, 1800), body: weighIns(80, -0.5), targetWeight: 70, today: TODAY })
  assert.equal(a.trend?.perWeek, -0.5)
  assert.equal(a.tdee, 2350)
  assert.equal(a.forecast?.kind, 'eta')
  assert.deepEqual(a.paces.map((p) => p.kcal), [2080, 1800, 1530])
  assert.equal(a.weight, 78)
})

test('analyze: розхід поза правдоподібним — не показуємо, пояснюємо; небезпечні темпи приховані', () => {
  // їсть «1300», а вага росте на 0,7 кг/тиж → розхід ≈ 530 ккал — так не буває
  const odd = analyze({ summaries: days(28, 1300), body: weighIns(75, 0.7), targetWeight: 60, today: TODAY })
  assert.equal(odd.tdee, null)
  assert.deepEqual(odd.paces, [])
  assert.equal(odd.checks.find((c) => c.id === 'mismatch')?.level, 'warn')
  // розхід 1 730: −0,5 кг/тиж дало б 1 180 ккал, −0,75 — 905 (< 1 200) — не пропонуємо
  const low = analyze({ summaries: days(28, 1450), body: weighIns(70, -0.25), targetWeight: 60, today: TODAY })
  assert.equal(low.tdee, 1730)
  // 1 730 − 275 = 1 455 → до десятків
  assert.deepEqual(low.paces.map((p) => [p.perWeek, p.kcal]), [[-0.25, 1460]])
  // г/кг на межі — з двома знаками
  const fat = insightChecks({ trend: null, intake: { loggedDays: 28, windowDays: 28, coverage: 1, avg: { kcal: 1900, protein: 140, fat: 46, carbs: 200 }, goals: { kcal: 2000, protein: 120, fat: 70, carbs: 220 }, weekday: null, weekend: null }, weight: 80, targetWeight: 70 })
  assert.match(fat.find((c) => c.id === 'fat')?.detail ?? '', /^0,58 г\/кг/)
})
