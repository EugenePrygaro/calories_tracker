import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scale, sum } from '../shared/nutrition.js'
import { requireDate, sanitizeEntry, sanitizeGoals, ValidationError } from '../shared/validate.js'

const base = { id: 'abcdef12-0000', date: '2026-11-14', meal: 'lunch', createdAt: 1, updatedAt: 1 }

test('weight: підсумок рахується з per100 і ваги, а не береться від клієнта', () => {
  const e = sanitizeEntry({
    ...base,
    mode: 'weight',
    name: '  Гречка   варена ',
    grams: '150',
    per100: { kcal: '110', protein: '4,2', fat: 1.1, carbs: 21.3 },
    kcal: 99999,
  })
  assert.equal(e.name, 'Гречка варена')
  assert.deepEqual(e.per100, { kcal: 110, protein: 4.2, fat: 1.1, carbs: 21.3 })
  assert.equal(e.grams, 150)
  assert.equal(e.kcal, 165)
  assert.equal(e.protein, 6.3)
})

test('weight: зміна ваги перераховує нутрієнти', () => {
  const e = sanitizeEntry({ ...base, mode: 'weight', name: 'Рис', grams: 100, per100: { kcal: 130, protein: 2.7, fat: 0.3, carbs: 28 } })
  const edited = sanitizeEntry({ ...e, grams: 250, updatedAt: 2 })
  assert.deepEqual(scale(e.per100 ?? { kcal: 0, protein: 0, fat: 0, carbs: 0 }, 250), {
    kcal: edited.kcal, protein: edited.protein, fat: edited.fat, carbs: edited.carbs,
  })
  assert.equal(edited.kcal, 325)
})

test('quick: назва за замовчуванням, жири й вуглеводи необов’язкові', () => {
  const e = sanitizeEntry({ ...base, mode: 'quick', name: '', kcal: '300', protein: '20', fat: '', carbs: undefined })
  assert.equal(e.name, 'Швидкий запис')
  assert.equal(e.grams, null)
  assert.equal(e.per100, null)
  assert.deepEqual([e.kcal, e.protein, e.fat, e.carbs], [300, 20, 0, 0])
})

test('quick: калорії та білки обов’язкові', () => {
  assert.throws(() => sanitizeEntry({ ...base, mode: 'quick', kcal: '', protein: 1 }), ValidationError)
  assert.throws(() => sanitizeEntry({ ...base, mode: 'quick', kcal: 100, protein: '' }), ValidationError)
})

test('відхиляє некоректні дані', () => {
  const ok = { ...base, mode: 'weight', name: 'X', grams: 100, per100: { kcal: 100 } }
  assert.doesNotThrow(() => sanitizeEntry(ok))
  assert.throws(() => sanitizeEntry({ ...ok, grams: 0 }), /invalid_grams/)
  assert.throws(() => sanitizeEntry({ ...ok, grams: -5 }), /invalid_grams/)
  assert.throws(() => sanitizeEntry({ ...ok, name: '   ' }), /invalid_name/)
  assert.throws(() => sanitizeEntry({ ...ok, meal: 'brunch' }), /invalid_meal/)
  assert.throws(() => sanitizeEntry({ ...ok, id: 'x' }), /invalid_id/)
  assert.throws(() => sanitizeEntry({ ...ok, per100: { kcal: 'abc' } }), /invalid_kcal/)
  assert.throws(() => sanitizeEntry({ ...ok, per100: { kcal: 100, fat: 101 } }), /invalid_fat/)
  assert.throws(() => sanitizeEntry({ ...ok, mode: 'other' }), /invalid_mode/)
})

test('requireDate приймає лише реальні дати', () => {
  assert.equal(requireDate('2028-02-29'), '2028-02-29')
  assert.throws(() => requireDate('2026-02-30'))
  assert.throws(() => requireDate('2026-1-5'))
})

test('цілі округлюються до цілих і мають межі', () => {
  assert.deepEqual(sanitizeGoals({ kcal: '2100,4', protein: 130, fat: 70.6, carbs: '250' }), {
    kcal: 2100, protein: 130, fat: 71, carbs: 250,
  })
  assert.throws(() => sanitizeGoals({ kcal: 100, protein: 1, fat: 1, carbs: 1 }), /invalid_kcal/)
})

test('sum без накопичення похибки float', () => {
  const items = Array.from({ length: 3 }, () => ({ kcal: 0.1, protein: 0.1, fat: 0.2, carbs: 0.3 }))
  assert.deepEqual(sum(items), { kcal: 0.3, protein: 0.3, fat: 0.6, carbs: 0.9 })
})
