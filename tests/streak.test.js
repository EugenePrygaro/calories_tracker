import { test } from 'node:test'
import assert from 'node:assert/strict'
import { daysWord, nextStreakAchievement, streakChain, streakStart, streakStatus } from '../shared/streak.js'

const TODAY = '2026-11-18'
const s = (over = {}) => ({ streak: 5, lastActiveDate: TODAY, shields: 0, ...over })

test('серія: стан на сьогодні', () => {
  assert.equal(streakStatus(s({ streak: 0, lastActiveDate: null }), TODAY).kind, 'none')
  assert.equal(streakStatus(s(), TODAY).kind, 'done')
  assert.equal(streakStatus(s({ lastActiveDate: '2026-11-17' }), TODAY).kind, 'pending')
  // 1 пропуск — безкоштовний
  assert.deepEqual(streakStatus(s({ lastActiveDate: '2026-11-16' }), TODAY), { kind: 'saved', missed: 1, shieldsNeeded: 0 })
  // 3 пропуски: 1 безкоштовний + 2 щити
  assert.deepEqual(streakStatus(s({ lastActiveDate: '2026-11-14', shields: 2 }), TODAY), {
    kind: 'saved',
    missed: 3,
    shieldsNeeded: 2,
  })
  assert.deepEqual(streakStatus(s({ lastActiveDate: '2026-11-14', shields: 1 }), TODAY), {
    kind: 'lost',
    missed: 3,
    shieldsNeeded: 2,
  })
})

test('серія: початок — за днями із записами, пропуски всередині не рахуються', () => {
  const active = new Set(['2026-11-10', '2026-11-12', '2026-11-13', '2026-11-18'])
  assert.equal(streakStart(active, TODAY, 3), '2026-11-12')
  assert.equal(streakStart(active, TODAY, 4), '2026-11-10')
  assert.equal(streakStart(active, TODAY, 9), null) // історії не вистачає
})

test('серія: ланцюжок — записи, безкоштовний пропуск, щити, старі дні', () => {
  // серія 4: 11-12 (запис), 13 пропуск (безкоштовно), 14 запис, 15–16 пропуски (безкоштовно + щит), 17 запис;
  // 08 — запис до серії; сьогодні ще без запису
  const active = new Set(['2026-11-08', '2026-11-11', '2026-11-12', '2026-11-14', '2026-11-17'])
  const chain = streakChain({ active, state: s({ streak: 4, lastActiveDate: '2026-11-17' }), today: TODAY, days: 11 })
  assert.deepEqual(
    chain.map((c) => `${c.date.slice(8)}:${c.kind}`),
    ['08:old', '09:missed', '10:missed', '11:active', '12:active', '13:grace', '14:active', '15:grace', '16:shield', '17:active', '18:today'],
  )
})

test('серія: пропуски після останнього запису — «закриються, якщо записати сьогодні»', () => {
  const active = new Set(['2026-11-14', '2026-11-15'])
  const saved = streakChain({ active, state: s({ streak: 2, lastActiveDate: '2026-11-15', shields: 1 }), today: TODAY, days: 5 })
  assert.deepEqual(
    saved.map((c) => `${c.date.slice(8)}:${c.kind}${c.pending ? '?' : ''}`),
    ['14:active', '15:active', '16:grace?', '17:shield?', '18:today'],
  )
  // щитів немає — серію вже не врятувати, пропуски просто пропуски
  const lost = streakChain({ active, state: s({ streak: 2, lastActiveDate: '2026-11-15' }), today: TODAY, days: 5 })
  assert.deepEqual(lost.map((c) => c.kind), ['active', 'active', 'missed', 'missed', 'today'])
})

test('серія: наступна ачівка й відмінки', () => {
  assert.equal(nextStreakAchievement(0)?.goal, 7)
  assert.equal(nextStreakAchievement(7)?.goal, 30)
  assert.equal(nextStreakAchievement(100), null)
  assert.deepEqual([1, 2, 5, 11, 21, 22].map(daysWord), ['день', 'дні', 'днів', 'днів', 'день', 'дні'])
})
