/**
 * Property-based tests for multi-payer activity diff — payer change detection.
 *
 * Feature: multi-payer-expenses
 * - Property 5: Activity Diff Payer Change Detection
 *
 * Validates: Requirements 5.1, 5.2, 5.4
 */

import fc from 'fast-check'
import { computeExpenseChanges, serializePayers } from '../activity-diff'

// --- Generators ---

const arbUserId = fc.uuid()

/**
 * Generates a payer entry: { userId, amount } with positive integer amount.
 */
const arbPayerEntry = fc.record({
  userId: arbUserId,
  amount: fc.integer({ min: 1, max: 1_000_000 }),
})

/**
 * Generates a payer state: an array of 1–5 unique-userId payer entries.
 * Ensures no duplicate userIds (since ExpensePaidBy has composite key).
 */
const arbPayerState = fc
  .array(arbPayerEntry, { minLength: 1, maxLength: 5 })
  .map((entries) => {
    // Deduplicate by userId, keeping first occurrence
    const seen = new Set<string>()
    return entries.filter((e) => {
      if (seen.has(e.userId)) return false
      seen.add(e.userId)
      return true
    })
  })
  .filter((entries) => entries.length >= 1)

/**
 * Builds a minimal "existing" expense object suitable for computeExpenseChanges.
 * Non-payer fields are fixed so they don't generate noise changes.
 */
function buildExistingExpense(
  payers: Array<{ userId: string; amount: number }>,
) {
  const total = payers.reduce((sum, p) => sum + p.amount, 0)
  return {
    title: 'Test Expense',
    amount: total,
    expenseDate: new Date('2024-01-15T00:00:00.000Z'),
    categoryId: 1,
    paidById: payers[0].userId,
    splitMode: 'EVENLY',
    isReimbursement: false,
    notes: null,
    recurrenceRule: null,
    paidFor: payers.map((p) => ({ userId: p.userId })),
    payers,
  }
}

/**
 * Builds a minimal "updated" form values object suitable for computeExpenseChanges.
 * Non-payer fields match the existing expense so only payer changes are detected.
 */
function buildUpdatedFormValues(
  payers: Array<{ userId: string; amount: number }>,
) {
  const total = payers.reduce((sum, p) => sum + p.amount, 0)
  return {
    title: 'Test Expense',
    amount: total,
    expenseDate: new Date('2024-01-15T00:00:00.000Z'),
    category: 1,
    paidBy: payers.map((p) => ({ participant: p.userId, amount: p.amount })),
    splitMode: 'EVENLY',
    isReimbursement: false,
    notes: null,
    recurrenceRule: null,
    paidFor: payers.map((p) => ({ participant: p.userId })),
  }
}

/**
 * Compares two payer states as sets of (userId, amount) pairs.
 * Order-independent — only the content matters.
 */
function payerSetsEqual(
  a: Array<{ userId: string; amount: number }>,
  b: Array<{ userId: string; amount: number }>,
): boolean {
  const sortedA = [...a].sort((x, y) => x.userId.localeCompare(y.userId))
  const sortedB = [...b].sort((x, y) => x.userId.localeCompare(y.userId))
  if (sortedA.length !== sortedB.length) return false
  return sortedA.every(
    (entry, i) =>
      entry.userId === sortedB[i].userId && entry.amount === sortedB[i].amount,
  )
}

// --- Constants ---

const PBT_NUM_RUNS = 100

// --- Tests ---

describe('Activity Diff — Multi-Payer Change Detection Property Tests', () => {
  describe('Property 5: Activity Diff Payer Change Detection', () => {
    /**
     * Validates: Requirements 5.1, 5.2, 5.4
     *
     * For any two payer states (old and new), the activity diff SHALL record a
     * `paidBy` field change if and only if the sets of (userId, amount) pairs differ.
     */
    it('records a paidBy change if and only if (userId, amount) sets differ', () => {
      fc.assert(
        fc.property(arbPayerState, arbPayerState, (oldPayers, newPayers) => {
          const existing = buildExistingExpense(oldPayers)
          const updated = buildUpdatedFormValues(newPayers)

          // Align non-payer fields that depend on payer total to avoid noise
          // We need to make amount/paidFor consistent so only paidBy change is tested
          existing.amount = oldPayers.reduce((s, p) => s + p.amount, 0)
          updated.amount = newPayers.reduce((s, p) => s + p.amount, 0)

          const changes = computeExpenseChanges(existing, updated)
          const paidByChange = changes.find((c) => c.field === 'paidBy')

          const setsAreDifferent = !payerSetsEqual(oldPayers, newPayers)

          if (setsAreDifferent) {
            expect(paidByChange).toBeDefined()
          } else {
            expect(paidByChange).toBeUndefined()
          }
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    /**
     * Validates: Requirements 5.1, 5.2, 5.4
     *
     * When a paidBy change IS recorded, the serialized old and new values
     * SHALL be parseable JSON arrays of {userId, amount} objects that
     * round-trip back to the original payer states.
     */
    it('serialized paidBy values round-trip back to original payer states', () => {
      fc.assert(
        fc.property(arbPayerState, arbPayerState, (oldPayers, newPayers) => {
          // Only test round-trip when sets actually differ
          if (payerSetsEqual(oldPayers, newPayers)) return

          const existing = buildExistingExpense(oldPayers)
          const updated = buildUpdatedFormValues(newPayers)

          existing.amount = oldPayers.reduce((s, p) => s + p.amount, 0)
          updated.amount = newPayers.reduce((s, p) => s + p.amount, 0)

          const changes = computeExpenseChanges(existing, updated)
          const paidByChange = changes.find((c) => c.field === 'paidBy')

          expect(paidByChange).toBeDefined()
          expect(paidByChange!.oldValue).not.toBeNull()
          expect(paidByChange!.newValue).not.toBeNull()

          // Parse the serialized values back
          const parsedOld = JSON.parse(paidByChange!.oldValue!) as Array<{
            userId: string
            amount: number
          }>
          const parsedNew = JSON.parse(paidByChange!.newValue!) as Array<{
            userId: string
            amount: number
          }>

          // Verify round-trip: parsed values should match original payer states (order-independent)
          expect(payerSetsEqual(parsedOld, oldPayers)).toBe(true)
          expect(payerSetsEqual(parsedNew, newPayers)).toBe(true)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    /**
     * Validates: Requirements 5.4
     *
     * When a single-payer expense remains single-payer with the same user and amount,
     * no paidBy change is recorded (identity case).
     */
    it('identical payer state produces no paidBy change', () => {
      fc.assert(
        fc.property(arbPayerState, (payers) => {
          const existing = buildExistingExpense(payers)
          const updated = buildUpdatedFormValues(payers)

          // Ensure consistent amounts
          existing.amount = payers.reduce((s, p) => s + p.amount, 0)
          updated.amount = payers.reduce((s, p) => s + p.amount, 0)

          const changes = computeExpenseChanges(existing, updated)
          const paidByChange = changes.find((c) => c.field === 'paidBy')

          expect(paidByChange).toBeUndefined()
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    /**
     * Validates: Requirements 5.2
     *
     * The serializePayers function produces valid JSON that can be parsed back,
     * and is order-independent (sorting by userId).
     */
    it('serializePayers produces order-independent JSON that round-trips', () => {
      fc.assert(
        fc.property(arbPayerState, (payers) => {
          const serialized = serializePayers(payers)
          const parsed = JSON.parse(serialized) as Array<{
            userId: string
            amount: number
          }>

          // Round-trip: parsed should contain same (userId, amount) pairs
          expect(payerSetsEqual(parsed, payers)).toBe(true)

          // Order-independence: shuffled input should produce same output
          const shuffled = [...payers].reverse()
          const serializedShuffled = serializePayers(shuffled)
          expect(serializedShuffled).toBe(serialized)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })
})
