/**
 * Property-based tests for DuplicateExpenseDialog payload completeness.
 *
 * Feature: duplicate-expense-detection
 * - Property 5: Dialog Payload Completeness
 *
 * Validates: Requirements 3.2
 */

import fc from 'fast-check'
import {
  findDuplicateMatches,
  type ExistingExpense,
} from '../../lib/duplicate-expense-detection'

// --- Constants ---

const PBT_NUM_RUNS = 100

// --- Generators ---

/** Arbitrary for a valid Date within a reasonable range (year 2000–2030) */
const arbDate = fc
  .integer({ min: 946684800000, max: 1893456000000 })
  .map((ms) => new Date(ms))

/** Arbitrary for a non-empty expense title */
const arbTitle = fc.string({ minLength: 1, maxLength: 100 })

/** Arbitrary for a positive amount in minor units */
const arbAmount = fc.integer({ min: 1, max: 10_000_000 })

/** Arbitrary for an expense ID */
const arbId = fc.uuid()

/** Arbitrary for a group ID */
const arbGroupId = fc.uuid()

/**
 * Generates an ExistingExpense with a specific title and amount
 * to guarantee it matches the input expense.
 */
function arbMatchingExpense(
  title: string,
  amount: number,
  groupId: string,
): fc.Arbitrary<ExistingExpense> {
  return fc.record({
    id: arbId,
    title: fc.constantFrom(
      title,
      title.toUpperCase(),
      `  ${title}  `,
      title.toLowerCase(),
    ),
    amount: fc.constant(amount),
    expenseDate: arbDate,
    categoryId: fc.integer({ min: 0, max: 50 }),
    groupId: fc.constant(groupId),
  })
}

// --- Tests ---

describe('DuplicateExpenseDialog - Property-Based Tests', () => {
  /**
   * Feature: duplicate-expense-detection, Property 5: Dialog Payload Completeness
   *
   * For any matched expense returned by the Duplicate Detector,
   * the dialog payload SHALL include the expense's title, amount, and
   * expenseDate fields, all with non-null values.
   *
   * Validates: Requirements 3.2
   */
  describe('Property 5: Dialog Payload Completeness', () => {
    it('every match object has non-null title, amount, and expenseDate', () => {
      fc.assert(
        fc.property(
          arbTitle,
          arbAmount,
          arbGroupId,
          arbDate,
          (title, amount, groupId, expenseDate) => {
            // Pre-condition: title must have non-whitespace content
            fc.pre(title.trim().length > 0)

            // Create existing expenses that will match the input
            const existingExpenses: ExistingExpense[] = [
              {
                id: '00000000-0000-4000-8000-000000000001',
                title: title,
                amount: amount,
                expenseDate: new Date(
                  expenseDate.getTime() + 2 * 24 * 60 * 60 * 1000,
                ),
                categoryId: 1,
                groupId: groupId,
              },
              {
                id: '00000000-0000-4000-8000-000000000002',
                title: `  ${title.toUpperCase()}  `,
                amount: amount,
                expenseDate: new Date(
                  expenseDate.getTime() - 3 * 24 * 60 * 60 * 1000,
                ),
                categoryId: 1,
                groupId: groupId,
              },
            ]

            const result = findDuplicateMatches(existingExpenses, {
              title,
              amount,
              expenseDate,
              groupId,
            })

            // All matches must have non-null title, amount, and expenseDate
            expect(result.matches.length).toBeGreaterThan(0)
            for (const match of result.matches) {
              expect(match.title).not.toBeNull()
              expect(match.title).toBeDefined()
              expect(typeof match.title).toBe('string')
              expect(match.title.length).toBeGreaterThan(0)

              expect(match.amount).not.toBeNull()
              expect(match.amount).toBeDefined()
              expect(typeof match.amount).toBe('number')

              expect(match.expenseDate).not.toBeNull()
              expect(match.expenseDate).toBeDefined()
              expect(match.expenseDate).toBeInstanceOf(Date)
            }
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('matches generated from arbitrary existing expenses always have complete payload fields', () => {
      fc.assert(
        fc.property(
          arbTitle,
          arbAmount,
          arbGroupId,
          arbDate,
          fc.array(arbDate, { minLength: 1, maxLength: 5 }),
          (title, amount, groupId, inputDate, matchDates) => {
            fc.pre(title.trim().length > 0)

            // Build a pool of matching expenses with various dates
            const existingExpenses: ExistingExpense[] = matchDates.map(
              (date, index) => ({
                id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
                title: title,
                amount: amount,
                expenseDate: date,
                categoryId: 1,
                groupId: groupId,
              }),
            )

            const result = findDuplicateMatches(existingExpenses, {
              title,
              amount,
              expenseDate: inputDate,
              groupId,
            })

            // Every match in the payload must be complete
            expect(result.matches.length).toBe(matchDates.length)
            for (const match of result.matches) {
              expect(match.title).not.toBeNull()
              expect(match.amount).not.toBeNull()
              expect(match.expenseDate).not.toBeNull()
              expect(match.expenseDate).toBeInstanceOf(Date)
            }
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })
})
