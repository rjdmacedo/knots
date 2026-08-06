// Feature: server-authoritative-currency-conversion, Property 5: Non-conversion field updates preserve conversion data
// **Validates: Requirements 5.2**

import { Prisma } from '@prisma/client'
import fc from 'fast-check'

/**
 * Property 5: Non-conversion field updates preserve conversion data
 *
 * For any expense update that modifies only fields unrelated to conversion
 * (title, category, notes, paidBy, paidFor, splitMode, isReimbursement) while
 * leaving originalAmount, originalCurrency, and expenseDate unchanged, the
 * resulting expense SHALL retain the same conversionRate and amount as before
 * the update.
 *
 * Testing approach:
 * We directly test the change-detection logic from the update procedure.
 * The logic in resolve-update-conversion.ts is:
 *
 *   needsConversion = originalCurrency != null && originalCurrency !== '' &&
 *                     originalCurrency !== group.currencyCode
 *
 *   submittedOriginalAmount = formValues.originalAmount ?? formValues.amount
 *
 *   conversionFieldsChanged =
 *     submittedOriginalAmount !== existingExpense.originalAmount ||
 *     formValues.originalCurrency !== existingExpense.originalCurrency ||
 *     formValues.expenseDate.getTime() !== existingExpense.expenseDate.getTime()
 *
 *   if (needsConversion && !conversionFieldsChanged):
 *     → preserve existing amount, originalAmount, originalCurrency, conversionRate
 *
 * We extract this logic into a pure function and test it with fast-check to verify
 * that for any combination of non-conversion field changes, conversion data is preserved.
 */

// Extracted change-detection and data-preservation logic from update.procedure.ts
interface ExistingExpense {
  originalAmount: number | null
  originalCurrency: string | null
  expenseDate: Date
  amount: number
  conversionRate: Prisma.Decimal | null
}

interface FormValues {
  amount: number
  originalCurrency: string | null | undefined
  expenseDate: Date
  title: string
  category: number
  notes?: string
  paidBy: string
  splitMode: string
  isReimbursement: boolean
  originalAmount?: number
  conversionRate?: number
}

interface ConversionResult {
  amount: number
  originalAmount: number | null | undefined
  originalCurrency: string | null | undefined
  conversionRate: number | null | undefined
  resolveConversionCalled: boolean
}

/**
 * Replicates the update procedure's conversion logic.
 * Returns the final form values and whether resolveConversion would be called.
 */
function applyUpdateConversionLogic(
  existingExpense: ExistingExpense,
  groupCurrencyCode: string,
  formValues: FormValues,
): ConversionResult {
  const needsConversion =
    formValues.originalCurrency != null &&
    formValues.originalCurrency !== '' &&
    formValues.originalCurrency !== groupCurrencyCode

  if (needsConversion) {
    // The originalAmount from the client is the source of truth for change detection
    const submittedOriginalAmount =
      formValues.originalAmount ?? formValues.amount

    const conversionFieldsChanged =
      submittedOriginalAmount !== existingExpense.originalAmount ||
      formValues.originalCurrency !== existingExpense.originalCurrency ||
      formValues.expenseDate.getTime() !== existingExpense.expenseDate.getTime()

    if (conversionFieldsChanged) {
      // Re-resolve conversion (not our test path)
      return {
        amount: formValues.amount,
        originalAmount: formValues.originalAmount,
        originalCurrency: formValues.originalCurrency,
        conversionRate: formValues.conversionRate,
        resolveConversionCalled: true,
      }
    } else {
      // Retain existing conversion data
      return {
        amount: existingExpense.amount,
        originalAmount: existingExpense.originalAmount ?? undefined,
        originalCurrency: existingExpense.originalCurrency,
        conversionRate: existingExpense.conversionRate?.toNumber(),
        resolveConversionCalled: false,
      }
    }
  }

  // Same currency - passthrough (null clears Prisma columns)
  return {
    amount: formValues.amount,
    originalAmount: null,
    originalCurrency: null,
    conversionRate: null,
    resolveConversionCalled: false,
  }
}

describe('Property 5: Non-conversion field updates preserve conversion data', () => {
  // Fixed existing expense with conversion data
  const EXISTING_EXPENSE: ExistingExpense = {
    originalAmount: 15000,
    originalCurrency: 'USD',
    expenseDate: new Date('2024-06-15T00:00:00.000Z'),
    amount: 13800,
    conversionRate: new Prisma.Decimal(0.92),
  }

  const GROUP_CURRENCY = 'EUR'
  const FIXED_EXPENSE_DATE = new Date('2024-06-15T00:00:00.000Z')

  // Generators for non-conversion fields
  const arbTitle = fc
    .string({ minLength: 2, maxLength: 50 })
    .filter((s) => s.trim().length >= 2)

  const arbNotes = fc.oneof(
    fc.constant(undefined),
    fc.string({ minLength: 0, maxLength: 100 }),
  )

  const arbCategory = fc.integer({ min: 0, max: 50 })

  const arbIsReimbursement = fc.boolean()

  const arbPaidBy = fc.uuid()

  const arbSplitMode = fc.constantFrom(
    'EVENLY',
    'BY_SHARES',
    'BY_PERCENTAGE',
    'BY_AMOUNT',
  )

  it('preserves amount and conversionRate when only non-conversion fields change', () => {
    fc.assert(
      fc.property(
        arbTitle,
        arbNotes,
        arbCategory,
        arbIsReimbursement,
        arbPaidBy,
        arbSplitMode,
        (title, notes, category, isReimbursement, paidBy, splitMode) => {
          // Build form values with FIXED conversion-relevant fields and RANDOM non-conversion fields
          const formValues: FormValues = {
            title,
            notes,
            category,
            isReimbursement,
            paidBy,
            splitMode,
            // Conversion-relevant fields stay fixed (matching existing expense):
            // The change detection compares formValues.originalAmount with existingExpense.originalAmount
            amount: 99999, // irrelevant — change detection uses originalAmount
            originalAmount: EXISTING_EXPENSE.originalAmount!, // 15000 — matches existing
            originalCurrency: EXISTING_EXPENSE.originalCurrency, // 'USD' — matches existing
            expenseDate: FIXED_EXPENSE_DATE, // matches existing expenseDate
          }

          const result = applyUpdateConversionLogic(
            EXISTING_EXPENSE,
            GROUP_CURRENCY,
            formValues,
          )

          // resolveConversion should NOT be called (existing data preserved)
          expect(result.resolveConversionCalled).toBe(false)

          // Conversion data is preserved unchanged
          expect(result.amount).toBe(EXISTING_EXPENSE.amount) // 13800
          expect(result.conversionRate).toBe(
            EXISTING_EXPENSE.conversionRate!.toNumber(),
          ) // 0.92
          expect(result.originalAmount).toBe(EXISTING_EXPENSE.originalAmount) // 15000
          expect(result.originalCurrency).toBe(
            EXISTING_EXPENSE.originalCurrency,
          ) // 'USD'
        },
      ),
      { numRuns: 100 },
    )
  })

  it('preserves conversion data across various existing expense configurations', () => {
    // Generate random existing expenses with conversion data
    const arbExistingExpense = fc.record({
      originalAmount: fc.integer({ min: 100, max: 10_000_000 }),
      originalCurrency: fc.constantFrom(
        'USD',
        'GBP',
        'JPY',
        'CAD',
        'AUD',
        'CHF',
      ),
      expenseDate: fc
        .integer({ min: 946684800000, max: 1893456000000 })
        .map((ms) => new Date(ms)),
      amount: fc.integer({ min: 100, max: 10_000_000 }),
      conversionRate: fc
        .double({ min: 0.01, max: 100, noNaN: true })
        .map((r) => new Prisma.Decimal(r)),
    })

    fc.assert(
      fc.property(
        arbExistingExpense,
        arbTitle,
        arbNotes,
        arbCategory,
        arbIsReimbursement,
        arbPaidBy,
        arbSplitMode,
        (
          existingExpense,
          title,
          notes,
          category,
          isReimbursement,
          paidBy,
          splitMode,
        ) => {
          // Group currency must differ from originalCurrency for conversion to apply
          const groupCurrency =
            (existingExpense.originalCurrency as string) === 'EUR'
              ? 'USD'
              : 'EUR'

          const formValues: FormValues = {
            title,
            notes,
            category,
            isReimbursement,
            paidBy,
            splitMode,
            // Keep conversion-relevant fields matching the existing expense
            amount: 99999, // irrelevant — change detection uses originalAmount
            originalAmount: existingExpense.originalAmount!,
            originalCurrency: existingExpense.originalCurrency,
            expenseDate: existingExpense.expenseDate,
          }

          const result = applyUpdateConversionLogic(
            existingExpense,
            groupCurrency,
            formValues,
          )

          // resolveConversion should NOT be called
          expect(result.resolveConversionCalled).toBe(false)

          // Conversion data is preserved
          expect(result.amount).toBe(existingExpense.amount)
          expect(result.conversionRate).toBe(
            existingExpense.conversionRate!.toNumber(),
          )
          expect(result.originalAmount).toBe(existingExpense.originalAmount)
          expect(result.originalCurrency).toBe(existingExpense.originalCurrency)
        },
      ),
      { numRuns: 100 },
    )
  })
})
