/**
 * Property-based tests for useFormPersistence hook.
 *
 * Feature: duplicate-expense-detection
 * - Property 9: Form Data Preservation Round-Trip
 *
 * Validates: Requirements 8.3
 *
 * @jest-environment jsdom
 */

import { act, renderHook } from '@testing-library/react'
import fc from 'fast-check'
import { useFormPersistence } from '../use-form-persistence'

// --- Constants ---

const PBT_NUM_RUNS = 100

// --- Generators ---

/** Arbitrary for valid SplitMode enum values */
const arbSplitMode = fc.constantFrom(
  'EVENLY' as const,
  'BY_SHARES' as const,
  'BY_PERCENTAGE' as const,
  'BY_AMOUNT' as const,
)

/** Arbitrary for valid RecurrenceRule enum values */
const arbRecurrenceRule = fc.constantFrom(
  'NONE' as const,
  'DAILY' as const,
  'WEEKLY' as const,
  'MONTHLY' as const,
)

/** Arbitrary for a valid Date within a reasonable range (2000–2030), serialized as ISO string */
const arbDateAsString = fc
  .integer({ min: 946684800000, max: 1893456000000 })
  .map((ms) => new Date(ms).toISOString())

/** Arbitrary for a paidFor entry */
const arbPaidForEntry = fc.record({
  participant: fc.string({ minLength: 1, maxLength: 20 }),
  shares: fc.integer({ min: 1, max: 1_000_000 }),
})

/** Arbitrary for a document entry */
const arbDocument = fc.record({
  id: fc.string({ minLength: 1, maxLength: 20 }),
  url: fc.webUrl(),
  width: fc.integer({ min: 1, max: 5000 }),
  height: fc.integer({ min: 1, max: 5000 }),
})

/**
 * Arbitrary for a valid ExpenseFormValues-like object.
 * We generate JSON-serializable form data (dates as ISO strings since
 * JSON.stringify/parse converts Date objects to strings).
 */
const arbExpenseFormValues = fc.record({
  expenseDate: arbDateAsString,
  title: fc.string({ minLength: 1, maxLength: 100 }),
  category: fc.integer({ min: 0, max: 50 }),
  amount: fc.integer({ min: 1, max: 10_000_000_00 }),
  originalAmount: fc.option(fc.integer({ min: 1, max: 10_000_000_00 }), {
    nil: undefined,
  }),
  originalCurrency: fc.option(fc.stringMatching(/^[A-Z]{3}$/), {
    nil: undefined,
  }),
  conversionRate: fc.option(
    fc.double({ min: 0.01, max: 1000, noNaN: true, noDefaultInfinity: true }),
    { nil: undefined },
  ),
  paidBy: fc.string({ minLength: 1, maxLength: 20 }),
  paidFor: fc.array(arbPaidForEntry, { minLength: 1, maxLength: 10 }),
  splitMode: arbSplitMode,
  saveDefaultSplittingOptions: fc.boolean(),
  isReimbursement: fc.boolean(),
  documents: fc.array(arbDocument, { minLength: 0, maxLength: 3 }),
  notes: fc.option(fc.string({ minLength: 0, maxLength: 200 }), {
    nil: undefined,
  }),
  recurrenceRule: arbRecurrenceRule,
})

// --- Tests ---

describe('useFormPersistence - Property-Based Tests', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })

  /**
   * Feature: duplicate-expense-detection, Property 9: Form Data Preservation Round-Trip
   *
   * For any valid ExpenseFormValues object, serializing it to sessionStorage
   * via useFormPersistence.save and then restoring it via useFormPersistence.restore
   * SHALL produce an object deeply equal to the original (round-trip property).
   *
   * Validates: Requirements 8.3
   */
  describe('Property 9: Form Data Preservation Round-Trip', () => {
    it('save followed by restore returns deeply equal data for any valid ExpenseFormValues', () => {
      fc.assert(
        fc.property(
          arbExpenseFormValues,
          fc.string({ minLength: 1, maxLength: 50 }),
          (formValues, storageKey) => {
            sessionStorage.clear()

            const { result } = renderHook(() =>
              useFormPersistence<typeof formValues>({ key: storageKey }),
            )

            let saveSuccess: boolean
            act(() => {
              saveSuccess = result.current.save(formValues)
            })

            expect(saveSuccess!).toBe(true)

            let restored: typeof formValues | null = null
            act(() => {
              restored = result.current.restore()
            })

            expect(restored).toEqual(formValues)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })
})
