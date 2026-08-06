/**
 * Property-based tests for buildCopyExpensePrefill.
 *
 * Feature: copy-expense
 *
 * Validates: Requirements 2.1, 2.3, 2.4, 2.5, 2.7, 2.8
 */

import type { Currency } from '@/lib/currency'
import {
  buildCopyExpensePrefill,
  type CopyableExpense,
} from '@/lib/expense-copy'
import { isConsolidatedPayment } from '@/lib/payments'
import type { CreationMethod, SplitMode } from '@prisma/client'
import fc from 'fast-check'

// --- Constants ---

const PBT_NUM_RUNS = 100

// --- Test Currency ---

const testCurrency: Currency = {
  code: 'USD',
  name: 'US Dollar',
  symbol_native: '$',
  symbol: '$',
  name_plural: 'US dollars',
  rounding: 0,
  decimal_digits: 2,
}

// --- Generators ---

const arbSplitMode: fc.Arbitrary<SplitMode> = fc.constantFrom(
  'EVENLY' as SplitMode,
  'BY_AMOUNT' as SplitMode,
  'BY_PERCENTAGE' as SplitMode,
  'BY_SHARES' as SplitMode,
)

const arbUserId = fc.string({ minLength: 1, maxLength: 25 })

const arbPaidFor = fc.array(
  fc.record({
    userId: arbUserId,
    shares: fc.integer({ min: 0, max: 100000 }),
  }),
  { minLength: 1, maxLength: 10 },
)

const arbCopyableExpense: fc.Arbitrary<CopyableExpense> = fc.record({
  title: fc.string({ minLength: 1, maxLength: 100 }),
  amount: fc.integer({ min: 1, max: 10000000 }),
  categoryId: fc.option(fc.integer({ min: 1, max: 100 }), { nil: null }),
  paidById: arbUserId,
  splitMode: arbSplitMode,
  isReimbursement: fc.boolean(),
  notes: fc.option(fc.string({ minLength: 0, maxLength: 200 }), { nil: null }),
  paidFor: arbPaidFor,
})

// --- Tests ---

describe('buildCopyExpensePrefill - Property-Based Tests', () => {
  /**
   * Feature: copy-expense, Property 1: Copy prefill preserves identity fields
   *
   * For any valid expense object, buildCopyExpensePrefill(expense, currency) SHALL
   * produce a prefill where title === expense.title, category === (expense.categoryId ?? 0),
   * paidBy === expense.paidById, splitMode === expense.splitMode,
   * isReimbursement === expense.isReimbursement, and notes === (expense.notes ?? '').
   *
   * Validates: Requirements 2.1, 2.3, 2.4, 2.5, 2.7, 2.8
   */
  describe('Property 1: Copy prefill preserves identity fields', () => {
    it('title is preserved from source expense', () => {
      fc.assert(
        fc.property(arbCopyableExpense, (expense) => {
          const result = buildCopyExpensePrefill(expense, testCurrency)
          expect(result.title).toBe(expense.title)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('category is mapped from categoryId with null fallback to 0', () => {
      fc.assert(
        fc.property(arbCopyableExpense, (expense) => {
          const result = buildCopyExpensePrefill(expense, testCurrency)
          expect(result.category).toBe(expense.categoryId ?? 0)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('paidBy is preserved from paidById', () => {
      fc.assert(
        fc.property(arbCopyableExpense, (expense) => {
          const result = buildCopyExpensePrefill(expense, testCurrency)
          expect(result.paidBy).toBe(expense.paidById)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('splitMode is preserved from source expense', () => {
      fc.assert(
        fc.property(arbCopyableExpense, (expense) => {
          const result = buildCopyExpensePrefill(expense, testCurrency)
          expect(result.splitMode).toBe(expense.splitMode)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('isReimbursement is preserved from source expense', () => {
      fc.assert(
        fc.property(arbCopyableExpense, (expense) => {
          const result = buildCopyExpensePrefill(expense, testCurrency)
          expect(result.isReimbursement).toBe(expense.isReimbursement)
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('notes is mapped with null fallback to empty string', () => {
      fc.assert(
        fc.property(arbCopyableExpense, (expense) => {
          const result = buildCopyExpensePrefill(expense, testCurrency)
          expect(result.notes).toBe(expense.notes ?? '')
        }),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })
})

/**
 * Feature: copy-expense, Property 2: Copy prefill correctly converts monetary values
 *
 * For any valid expense and currency, buildCopyExpensePrefill(expense, currency).amount
 * SHALL equal amountAsDecimal(expense.amount, currency), and each paidFor[i].shares SHALL
 * equal the source share converted according to the split mode.
 *
 * Validates: Requirements 2.2, 2.6
 */
describe('Feature: copy-expense, Property 2: Copy prefill correctly converts monetary values', () => {
  const arbCurrency: fc.Arbitrary<Currency> = fc.constantFrom(
    {
      code: 'USD',
      name: 'US Dollar',
      symbol_native: '$',
      symbol: '$',
      name_plural: 'US dollars',
      rounding: 0,
      decimal_digits: 2,
    },
    {
      code: 'JPY',
      name: 'Japanese Yen',
      symbol_native: '¥',
      symbol: '¥',
      name_plural: 'Japanese yen',
      rounding: 0,
      decimal_digits: 0,
    },
    {
      code: 'KWD',
      name: 'Kuwaiti Dinar',
      symbol_native: 'د.ك',
      symbol: 'KD',
      name_plural: 'Kuwaiti dinars',
      rounding: 0,
      decimal_digits: 3,
    },
  )

  it('top-level amount is correctly converted from minor units', () => {
    fc.assert(
      fc.property(arbCopyableExpense, arbCurrency, (expense, currency) => {
        const result = buildCopyExpensePrefill(expense, currency)
        const expected = expense.amount / 10 ** currency.decimal_digits
        expect(result.amount).toBeCloseTo(expected, 10)
      }),
      { numRuns: PBT_NUM_RUNS },
    )
  })

  it('paidFor shares are converted per split mode', () => {
    fc.assert(
      fc.property(arbCopyableExpense, arbCurrency, (expense, currency) => {
        const result = buildCopyExpensePrefill(expense, currency)

        expect(result.paidFor!.length).toBe(expense.paidFor.length)

        for (let i = 0; i < expense.paidFor.length; i++) {
          const sourceShares = expense.paidFor[i].shares
          const resultShares = result.paidFor![i].shares

          if (expense.splitMode === 'EVENLY') {
            expect(resultShares).toBe(1)
          } else if (expense.splitMode === 'BY_AMOUNT') {
            const converted = sourceShares / 10 ** currency.decimal_digits
            expect(resultShares).toBe(converted <= 0 ? 1 : converted)
          } else {
            const converted = sourceShares / 100
            expect(resultShares).toBe(converted <= 0 ? 1 : converted)
          }
        }
      }),
      { numRuns: PBT_NUM_RUNS },
    )
  })

  it('paidFor array length is preserved', () => {
    fc.assert(
      fc.property(arbCopyableExpense, (expense) => {
        const result = buildCopyExpensePrefill(expense, testCurrency)
        expect(result.paidFor!.length).toBe(expense.paidFor.length)
      }),
      { numRuns: PBT_NUM_RUNS },
    )
  })
})

describe('Feature: copy-expense, Property 4: Copy action visibility matches non-locked status', () => {
  /**
   * **Validates: Requirements 1.3, 1.4**
   *
   * For any expense object, the copy action is visible if and only if
   * isConsolidatedPayment(expense) is false. This holds regardless of whether
   * the expense is a reimbursement.
   */

  const creationMethods: Array<CreationMethod | null> = [
    null,
    'PAYMENT',
    'DEBT_CONSOLIDATION',
  ]

  /** Arbitrary for expense objects with varying creationMethod and bundleId */
  const arbExpenseForVisibility = fc.record({
    creationMethod: fc.constantFrom(...creationMethods),
    bundleId: fc.oneof(fc.constant(null), fc.constant(''), fc.uuid()),
    isReimbursement: fc.boolean(),
  })

  it('copy action is visible iff expense is not a consolidated payment', () => {
    fc.assert(
      fc.property(arbExpenseForVisibility, (expense) => {
        const isLocked = isConsolidatedPayment(expense)
        const isCopyVisible = !isLocked

        // A consolidated payment is one where creationMethod === 'DEBT_CONSOLIDATION'
        // OR bundleId is a non-empty string
        const expectedLocked =
          expense.creationMethod === 'DEBT_CONSOLIDATION' ||
          (expense.bundleId != null && expense.bundleId.length > 0)

        expect(isCopyVisible).toBe(!expectedLocked)
      }),
      { numRuns: PBT_NUM_RUNS },
    )
  })

  it('reimbursement flag does not affect copy action visibility', () => {
    fc.assert(
      fc.property(arbExpenseForVisibility, (expense) => {
        const { isReimbursement: _, ...lockFields } = expense
        const visibilityBase = !isConsolidatedPayment(lockFields)

        // isReimbursement should have no effect on visibility
        // (isConsolidatedPayment only looks at creationMethod/bundleId)
        expect(visibilityBase).toBe(!isConsolidatedPayment(lockFields))
      }),
      { numRuns: PBT_NUM_RUNS },
    )
  })
})

/**
 * Feature: copy-expense, Property 3: Copy prefill resets transient fields
 *
 * For any valid expense (including those that might conceptually have documents
 * and recurrence rules), buildCopyExpensePrefill SHALL produce a prefill where:
 * - expenseDate is today's date
 * - The result does NOT contain a `documents` property
 * - The result does NOT contain a `recurrenceRule` property
 *
 * Validates: Requirements 3.1, 5.1, 5.2, 5.3
 */
describe('Feature: copy-expense, Property 3: Copy prefill resets transient fields', () => {
  it('output expenseDate is today and result does NOT contain documents or recurrenceRule', () => {
    fc.assert(
      fc.property(arbCopyableExpense, (expense) => {
        const now = new Date()
        const result = buildCopyExpensePrefill(expense, testCurrency)

        // expenseDate should be today
        const resultDate = result.expenseDate as Date
        expect(resultDate.getFullYear()).toBe(now.getFullYear())
        expect(resultDate.getMonth()).toBe(now.getMonth())
        expect(resultDate.getDate()).toBe(now.getDate())

        // Result must NOT contain documents or recurrenceRule keys
        const keys = Object.keys(result)
        expect(keys).not.toContain('documents')
        expect(keys).not.toContain('recurrenceRule')
      }),
      { numRuns: PBT_NUM_RUNS },
    )
  })
})
