/**
 * Property-based tests for the expense diff engine — idempotent comparison.
 *
 * Feature: activity-diff-changelog
 * - Property 5: Idempotent comparison — `computeExpenseChanges(expense, toFormValues(expense))` returns an empty array
 *
 * Validates: Requirements 2.5
 */

import fc from 'fast-check'
import { computeExpenseChanges } from '../activity-diff'

// --- Helpers ---

/**
 * Converts an existing expense (DB format) to form values format.
 * This mirrors the real-world conversion that happens when an expense
 * is loaded into an edit form.
 */
function toFormValues(expense: {
  title: string
  amount: number
  expenseDate: Date
  categoryId: number
  paidById: string
  splitMode: string
  isReimbursement: boolean
  notes?: string | null
  recurrenceRule?: string | null
  paidFor: Array<{ participantId: string }>
}) {
  return {
    title: expense.title,
    amount: expense.amount,
    expenseDate: expense.expenseDate,
    category: expense.categoryId,
    paidBy: expense.paidById,
    splitMode: expense.splitMode,
    isReimbursement: expense.isReimbursement,
    notes: expense.notes ?? null,
    recurrenceRule: expense.recurrenceRule ?? null,
    paidFor: expense.paidFor.map((p) => ({ participant: p.participantId })),
  }
}

// --- Generators ---

const arbParticipantId = fc.uuid()

const arbPaidFor = fc.array(fc.record({ participantId: arbParticipantId }), {
  minLength: 1,
  maxLength: 5,
})

const arbSplitMode = fc.constantFrom(
  'EVENLY',
  'BY_SHARES',
  'BY_PERCENTAGE',
  'BY_AMOUNT',
)

const arbExpense = fc.record({
  title: fc.string({ minLength: 1, maxLength: 100 }),
  amount: fc.integer({ min: 0, max: 10_000_000 }),
  expenseDate: fc.date({
    min: new Date('2000-01-01T00:00:00.000Z'),
    max: new Date('2100-01-01T00:00:00.000Z'),
    noInvalidDate: true,
  }),
  categoryId: fc.integer({ min: 0, max: 100 }),
  paidById: arbParticipantId,
  splitMode: arbSplitMode,
  isReimbursement: fc.boolean(),
  notes: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: null }),
  recurrenceRule: fc.option(fc.string({ minLength: 1, maxLength: 100 }), {
    nil: null,
  }),
  paidFor: arbPaidFor,
})

// --- Constants ---

const PBT_NUM_RUNS = 30

// --- Tests ---

describe('Expense Diff Engine — Idempotent Comparison Property Tests', () => {
  describe('Property 5: Idempotent comparison', () => {
    /**
     * Validates: Requirements 2.5
     *
     * For any valid expense, converting it to form values and comparing
     * with the original should produce no changes (empty array).
     * This ensures no false positives when nothing has actually changed.
     */
    it('computeExpenseChanges(expense, toFormValues(expense)) returns an empty array for any expense', () => {
      fc.assert(
        fc.property(arbExpense, (expense) => {
          const formValues = toFormValues(expense)
          const changes = computeExpenseChanges(expense, formValues)

          expect(changes).toEqual([])
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('roundtrip produces no changes even with null optional fields', () => {
      fc.assert(
        fc.property(arbExpense, (expense) => {
          // Force null optional fields
          const expenseWithNulls = {
            ...expense,
            notes: null,
            recurrenceRule: null,
          }
          const formValues = toFormValues(expenseWithNulls)
          const changes = computeExpenseChanges(expenseWithNulls, formValues)

          expect(changes).toEqual([])
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('roundtrip produces no changes with non-null optional fields', () => {
      const arbExpenseWithOptionals = fc.record({
        title: fc.string({ minLength: 1, maxLength: 100 }),
        amount: fc.integer({ min: 0, max: 10_000_000 }),
        expenseDate: fc.date({
          min: new Date('2000-01-01T00:00:00.000Z'),
          max: new Date('2100-01-01T00:00:00.000Z'),
          noInvalidDate: true,
        }),
        categoryId: fc.integer({ min: 0, max: 100 }),
        paidById: arbParticipantId,
        splitMode: arbSplitMode,
        isReimbursement: fc.boolean(),
        notes: fc.string({ minLength: 1, maxLength: 200 }),
        recurrenceRule: fc.string({ minLength: 1, maxLength: 100 }),
        paidFor: arbPaidFor,
      })

      fc.assert(
        fc.property(arbExpenseWithOptionals, (expense) => {
          const formValues = toFormValues(expense)
          const changes = computeExpenseChanges(expense, formValues)

          expect(changes).toEqual([])
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })
})
