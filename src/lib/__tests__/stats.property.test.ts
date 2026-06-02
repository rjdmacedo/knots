/**
 * Property-based tests for the enhanced stats dashboard computation module.
 *
 * Feature: enhanced-stats-dashboard
 * Uses fast-check for property-based testing with minimum 100 iterations.
 */

import fc from 'fast-check'
import type { Expense, MonthlySpendingItem, Participant } from '../stats'
import {
  computeAggregateMetrics,
  computeCategoryBreakdown,
  computeDailyAverage,
  computeExpenseDistribution,
  computeMonthOverMonth,
  computeNetBalances,
  computeParticipantRanking,
  computeSpendingOverTime,
} from '../stats'

// --- Constants ---

const PBT_NUM_RUNS = 100

// --- Generators ---

const arbSplitMode = fc.constantFrom(
  'EVENLY' as const,
  'BY_SHARES' as const,
  'BY_PERCENTAGE' as const,
  'BY_AMOUNT' as const,
)

const arbParticipantId = fc.uuid()

const arbParticipant = fc.record({
  id: arbParticipantId,
  name: fc.string({ minLength: 1, maxLength: 50 }),
})

const arbPaidFor = (participantIds: string[]) =>
  fc.array(
    fc.record({
      user: fc.record({
        id: fc.constantFrom(...participantIds),
        name: fc.string({ minLength: 1, maxLength: 50 }),
      }),
      shares: fc.integer({ min: 1, max: 10000 }),
    }),
    { minLength: 1, maxLength: participantIds.length },
  )

/**
 * Generate a date within a 2-year range.
 */
const arbExpenseDate = fc.date({
  min: new Date('2022-01-01T00:00:00.000Z'),
  max: new Date('2024-01-01T00:00:00.000Z'),
  noInvalidDate: true,
})

/**
 * Generate a single non-reimbursement expense with the given participant IDs.
 */
const arbNonReimbursementExpense = (
  participantIds: string[],
): fc.Arbitrary<Expense> =>
  fc.record({
    id: fc.uuid(),
    amount: fc.integer({ min: 1, max: 10_000_000 }),
    category: fc.option(
      fc.record({
        id: fc.integer({ min: 0, max: 30 }),
        grouping: fc.string({ minLength: 1, maxLength: 20 }),
        name: fc.string({ minLength: 1, maxLength: 30 }),
      }),
      { nil: null },
    ),
    createdAt: fc.date({
      min: new Date('2022-01-01T00:00:00.000Z'),
      max: new Date('2024-01-01T00:00:00.000Z'),
      noInvalidDate: true,
    }),
    expenseDate: arbExpenseDate,
    isReimbursement: fc.constant(false),
    paidBy: fc.record({
      id: fc.constantFrom(...participantIds),
      name: fc.string({ minLength: 1, maxLength: 50 }),
    }),
    paidFor: arbPaidFor(participantIds),
    splitMode: arbSplitMode,
    title: fc.string({ minLength: 1, maxLength: 100 }),
  }) as fc.Arbitrary<Expense>

/**
 * Generate a mixed expense (may or may not be a reimbursement).
 */
const arbExpense = (participantIds: string[]): fc.Arbitrary<Expense> =>
  fc.record({
    id: fc.uuid(),
    amount: fc.integer({ min: 1, max: 10_000_000 }),
    category: fc.option(
      fc.record({
        id: fc.integer({ min: 0, max: 30 }),
        grouping: fc.string({ minLength: 1, maxLength: 20 }),
        name: fc.string({ minLength: 1, maxLength: 30 }),
      }),
      { nil: null },
    ),
    createdAt: fc.date({
      min: new Date('2022-01-01T00:00:00.000Z'),
      max: new Date('2024-01-01T00:00:00.000Z'),
      noInvalidDate: true,
    }),
    expenseDate: arbExpenseDate,
    isReimbursement: fc.boolean(),
    paidBy: fc.record({
      id: fc.constantFrom(...participantIds),
      name: fc.string({ minLength: 1, maxLength: 50 }),
    }),
    paidFor: arbPaidFor(participantIds),
    splitMode: arbSplitMode,
    title: fc.string({ minLength: 1, maxLength: 100 }),
  }) as fc.Arbitrary<Expense>

/**
 * Generate a set of participant IDs (1-20 participants).
 */
const arbParticipantIds = fc
  .array(fc.uuid(), { minLength: 1, maxLength: 20 })
  .map((ids) => Array.from(new Set(ids)))
  .filter((ids) => ids.length >= 1)

// --- Tests ---

// Feature: enhanced-stats-dashboard, Property 1: Category aggregation correctness
describe('Enhanced Stats Dashboard — Property-Based Tests', () => {
  describe('Property 1: Category aggregation correctness', () => {
    /**
     * Validates: Requirements 1.1, 1.5
     *
     * For any set of expenses (with varying categories, amounts, and reimbursement flags),
     * the computeCategoryBreakdown function SHALL produce category items where:
     * (a) the sum of all category amounts equals the total non-reimbursement spending, and
     * (b) each category's percentage equals its amount divided by the total, rounded to one decimal place.
     */
    it('sum of category amounts equals total non-reimbursement spending', () => {
      fc.assert(
        fc.property(
          arbParticipantIds.chain((ids) =>
            fc.array(arbExpense(ids), { minLength: 0, maxLength: 30 }),
          ),
          (expenses) => {
            const result = computeCategoryBreakdown(expenses)

            // Compute expected total non-reimbursement spending
            const totalNonReimbursement = expenses
              .filter((e) => !e.isReimbursement)
              .reduce((sum, e) => sum + e.amount, 0)

            // Sum of all category amounts in the result
            const sumOfCategoryAmounts = result.reduce(
              (sum, item) => sum + item.amount,
              0,
            )

            expect(sumOfCategoryAmounts).toBe(totalNonReimbursement)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('each category percentage equals amount/total rounded to one decimal', () => {
      fc.assert(
        fc.property(
          arbParticipantIds.chain((ids) =>
            fc.array(arbNonReimbursementExpense(ids), {
              minLength: 1,
              maxLength: 30,
            }),
          ),
          (expenses) => {
            const result = computeCategoryBreakdown(expenses)

            // Compute expected total
            const totalSpending = expenses.reduce((sum, e) => sum + e.amount, 0)

            // Each category's percentage should equal amount/total * 100 rounded to one decimal
            for (const item of result) {
              const expectedPercentage =
                Math.round((item.amount / totalSpending) * 1000) / 10
              expect(item.percentage).toBe(expectedPercentage)
            }
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })

  // Feature: enhanced-stats-dashboard, Property 2: Category descending sort
  describe('Property 2: Category descending sort', () => {
    /**
     * Validates: Requirements 1.4
     *
     * For any set of expenses producing two or more categories,
     * the computeCategoryBreakdown function SHALL return categories sorted
     * by amount in strictly non-increasing order.
     */
    it('output is sorted by amount in non-increasing order', () => {
      fc.assert(
        fc.property(
          arbParticipantIds.chain((ids) =>
            fc.array(arbNonReimbursementExpense(ids), {
              minLength: 2,
              maxLength: 30,
            }),
          ),
          (expenses) => {
            const result = computeCategoryBreakdown(expenses)

            // Only check ordering if we have multiple categories
            if (result.length < 2) return

            for (let i = 0; i < result.length - 1; i++) {
              expect(result[i].amount).toBeGreaterThanOrEqual(
                result[i + 1].amount,
              )
            }
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })

  // Feature: enhanced-stats-dashboard, Property 9: Daily average computation correctness
  describe('Property 9: Daily average computation correctness', () => {
    /**
     * Validates: Requirements 6.1, 6.3
     *
     * For any set of non-reimbursement expenses spanning one or more days,
     * the computeDailyAverage function SHALL return a value equal to the total
     * non-reimbursement spending divided by the number of days between the
     * earliest and latest expense dates (inclusive).
     */
    it('daily average equals total spending / days (inclusive) for non-reimbursement expenses', () => {
      fc.assert(
        fc.property(
          arbParticipantIds.chain((ids) =>
            fc.tuple(
              fc.constant(ids),
              fc.array(arbExpense(ids), { minLength: 1, maxLength: 30 }),
            ),
          ),
          ([_ids, expenses]) => {
            const result = computeDailyAverage(expenses)

            // Filter non-reimbursement expenses (same logic as the function)
            const nonReimbursements = expenses.filter((e) => !e.isReimbursement)

            if (nonReimbursements.length === 0) {
              // If all expenses are reimbursements, result should be null
              expect(result).toBeNull()
              return
            }

            // Compute expected values independently
            const totalSpending = nonReimbursements.reduce(
              (sum, e) => sum + e.amount,
              0,
            )

            // Find earliest and latest expense dates
            const dates = nonReimbursements.map((e) =>
              new Date(e.expenseDate).getTime(),
            )
            const earliest = Math.min(...dates)
            const latest = Math.max(...dates)

            // Compute days between earliest and latest (inclusive)
            const msPerDay = 24 * 60 * 60 * 1000
            const days = Math.round((latest - earliest) / msPerDay) + 1

            const expectedAverage = totalSpending / days

            expect(result).not.toBeNull()
            // Use a relative tolerance for floating-point comparison
            expect(result).toBeCloseTo(expectedAverage, 5)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('daily average for expenses on a single day equals total spending for that day', () => {
      fc.assert(
        fc.property(
          arbParticipantIds.chain((ids) => {
            // Generate a fixed date and multiple expenses on that same date
            return fc.tuple(
              fc.constant(ids),
              arbExpenseDate,
              fc.array(fc.integer({ min: 1, max: 10_000_000 }), {
                minLength: 1,
                maxLength: 10,
              }),
            )
          }),
          ([ids, fixedDate, amounts]) => {
            // Create expenses all on the same day
            const expenses: Expense[] = amounts.map((amount) => ({
              id: 'test-id',
              amount,
              category: null,
              createdAt: fixedDate,
              expenseDate: fixedDate,
              isReimbursement: false,
              paidBy: { id: ids[0], name: 'Test' },
              paidFor: [{ user: { id: ids[0], name: 'Test' }, shares: 1 }],
              splitMode: 'EVENLY' as const,
              title: 'Test expense',
              recurrenceRule: null,
              _count: { documents: 0 },
            }))

            const result = computeDailyAverage(expenses)
            const totalSpending = amounts.reduce((sum, a) => sum + a, 0)

            // Single day means days = 1, so average = total
            expect(result).toBeCloseTo(totalSpending, 5)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })

  // Feature: enhanced-stats-dashboard, Property 10: Aggregate metrics correctness
  describe('Property 10: Aggregate metrics correctness', () => {
    /**
     * Validates: Requirements 7.1, 7.2
     *
     * For any non-empty set of non-reimbursement expenses, the computeAggregateMetrics
     * function SHALL return a totalCount equal to the number of non-reimbursement expenses
     * and an averageAmount equal to total spending divided by that count.
     */
    it('totalCount equals number of non-reimbursement expenses and averageAmount equals total / count', () => {
      fc.assert(
        fc.property(
          arbParticipantIds.chain((ids) =>
            fc.tuple(
              fc.constant(ids),
              // Ensure at least one non-reimbursement expense
              fc
                .array(arbExpense(ids), { minLength: 1, maxLength: 30 })
                .filter((exps) => exps.some((e) => !e.isReimbursement)),
            ),
          ),
          ([_ids, expenses]) => {
            const result = computeAggregateMetrics(expenses)

            const nonReimbursements = expenses.filter((e) => !e.isReimbursement)
            const expectedCount = nonReimbursements.length
            const expectedTotal = nonReimbursements.reduce(
              (sum, e) => sum + e.amount,
              0,
            )
            const expectedAverage = expectedTotal / expectedCount

            expect(result.totalCount).toBe(expectedCount)
            expect(result.averageAmount).not.toBeNull()
            expect(result.averageAmount).toBeCloseTo(expectedAverage, 5)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('totalCount is zero and averageAmount is null when all expenses are reimbursements', () => {
      fc.assert(
        fc.property(
          arbParticipantIds.chain((ids) =>
            fc.array(
              arbNonReimbursementExpense(ids).map((e) => ({
                ...e,
                isReimbursement: true,
              })),
              { minLength: 1, maxLength: 10 },
            ),
          ),
          (expenses) => {
            const result = computeAggregateMetrics(expenses as Expense[])

            expect(result.totalCount).toBe(0)
            expect(result.averageAmount).toBeNull()
            expect(result.largestExpense).toBeNull()
            expect(result.mostRecentExpense).toBeNull()
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })

  // Feature: enhanced-stats-dashboard, Property 7: Monthly chronological ordering
  describe('Property 7: Monthly chronological ordering', () => {
    /**
     * Validates: Requirements 4.3
     *
     * For any set of expenses spanning multiple months, the computeSpendingOverTime
     * function SHALL return items in strictly chronological order (earlier months
     * before later months).
     */
    it('computeSpendingOverTime returns months in strictly chronological order', () => {
      fc.assert(
        fc.property(
          arbParticipantIds.chain((ids) =>
            fc.tuple(
              // At least one expense in an earlier month (first half of 2022)
              fc.record({
                id: fc.uuid(),
                amount: fc.integer({ min: 1, max: 10_000_000 }),
                category: fc.option(
                  fc.record({
                    id: fc.integer({ min: 0, max: 30 }),
                    grouping: fc.string({ minLength: 1, maxLength: 20 }),
                    name: fc.string({ minLength: 1, maxLength: 30 }),
                  }),
                  { nil: null },
                ),
                createdAt: fc.date({
                  min: new Date('2022-01-01T00:00:00.000Z'),
                  max: new Date('2022-06-30T23:59:59.999Z'),
                  noInvalidDate: true,
                }),
                expenseDate: fc.date({
                  min: new Date('2022-01-01T00:00:00.000Z'),
                  max: new Date('2022-06-30T23:59:59.999Z'),
                  noInvalidDate: true,
                }),
                isReimbursement: fc.constant(false as const),
                paidBy: fc.record({
                  id: fc.constantFrom(...ids),
                  name: fc.string({ minLength: 1, maxLength: 50 }),
                }),
                paidFor: fc.array(
                  fc.record({
                    user: fc.record({
                      id: fc.constantFrom(...ids),
                      name: fc.string({ minLength: 1, maxLength: 50 }),
                    }),
                    shares: fc.integer({ min: 1, max: 10000 }),
                  }),
                  { minLength: 1, maxLength: ids.length },
                ),
                splitMode: arbSplitMode,
                title: fc.string({ minLength: 1, maxLength: 100 }),
              }),
              // At least one expense in a later month (second half of 2023)
              fc.record({
                id: fc.uuid(),
                amount: fc.integer({ min: 1, max: 10_000_000 }),
                category: fc.option(
                  fc.record({
                    id: fc.integer({ min: 0, max: 30 }),
                    grouping: fc.string({ minLength: 1, maxLength: 20 }),
                    name: fc.string({ minLength: 1, maxLength: 30 }),
                  }),
                  { nil: null },
                ),
                createdAt: fc.date({
                  min: new Date('2023-07-01T00:00:00.000Z'),
                  max: new Date('2023-12-31T23:59:59.999Z'),
                  noInvalidDate: true,
                }),
                expenseDate: fc.date({
                  min: new Date('2023-07-01T00:00:00.000Z'),
                  max: new Date('2023-12-31T23:59:59.999Z'),
                  noInvalidDate: true,
                }),
                isReimbursement: fc.constant(false as const),
                paidBy: fc.record({
                  id: fc.constantFrom(...ids),
                  name: fc.string({ minLength: 1, maxLength: 50 }),
                }),
                paidFor: fc.array(
                  fc.record({
                    user: fc.record({
                      id: fc.constantFrom(...ids),
                      name: fc.string({ minLength: 1, maxLength: 50 }),
                    }),
                    shares: fc.integer({ min: 1, max: 10000 }),
                  }),
                  { minLength: 1, maxLength: ids.length },
                ),
                splitMode: arbSplitMode,
                title: fc.string({ minLength: 1, maxLength: 100 }),
              }),
              // Additional random non-reimbursement expenses
              fc.array(arbNonReimbursementExpense(ids), {
                minLength: 0,
                maxLength: 20,
              }),
            ),
          ),
          ([earlyExpense, lateExpense, additionalExpenses]) => {
            const expenses = [
              earlyExpense as Expense,
              lateExpense as Expense,
              ...additionalExpenses,
            ]

            const result = computeSpendingOverTime(expenses)

            // Must have at least 2 items since we guarantee multiple months
            expect(result.length).toBeGreaterThanOrEqual(2)

            // Verify strictly chronological ordering
            for (let i = 1; i < result.length; i++) {
              const prev = result[i - 1]
              const curr = result[i]

              // Current must be strictly after previous (year*12 + month comparison)
              const prevOrdinal = prev.year * 12 + prev.month
              const currOrdinal = curr.year * 12 + curr.month

              expect(currOrdinal).toBeGreaterThan(prevOrdinal)
            }
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })

  // Feature: enhanced-stats-dashboard, Property 8: Month-over-month computation correctness
  describe('Property 8: Month-over-month computation correctness', () => {
    /**
     * Validates: Requirements 5.1
     *
     * For any two consecutive months with known spending totals, the
     * computeMonthOverMonth function SHALL return an absoluteDifference equal to
     * (current - previous) and a percentageChange equal to
     * ((current - previous) / previous) * 100.
     */
    it('computeMonthOverMonth returns correct absoluteDifference and percentageChange', () => {
      // Generate two consecutive months with known totals
      const arbMonthlyPair = fc
        .tuple(
          fc.integer({ min: 2022, max: 2024 }), // year
          fc.integer({ min: 0, max: 10 }), // month (0-10 to allow next month in same year)
          fc.integer({ min: 1, max: 10_000_000 }), // previous month amount (> 0 to avoid division by zero)
          fc.integer({ min: 0, max: 10_000_000 }), // current month amount
        )
        .map(([year, month, prevAmount, currAmount]) => {
          const prevMonth = month
          const currMonth = month + 1
          const currYear = currMonth > 11 ? year + 1 : year
          const normalizedCurrMonth = currMonth > 11 ? 0 : currMonth

          const monthlyData: MonthlySpendingItem[] = [
            { year, month: prevMonth, amount: prevAmount },
            {
              year: currYear,
              month: normalizedCurrMonth,
              amount: currAmount,
            },
          ]

          return { monthlyData, prevAmount, currAmount }
        })

      fc.assert(
        fc.property(
          arbMonthlyPair,
          ({ monthlyData, prevAmount, currAmount }) => {
            const result = computeMonthOverMonth(monthlyData)

            // Should never be null since we have exactly 2 months
            expect(result).not.toBeNull()

            if (result === null) return // TypeScript guard

            // Verify absoluteDifference = current - previous
            const expectedDifference = currAmount - prevAmount
            expect(result.absoluteDifference).toBe(expectedDifference)

            // Verify percentageChange = ((current - previous) / previous) * 100
            // Previous amount is always > 0 due to our generator constraint
            const expectedPercentageChange =
              ((currAmount - prevAmount) / prevAmount) * 100
            expect(result.percentageChange).toBeCloseTo(
              expectedPercentageChange,
              10,
            )

            // Verify the month data is correctly assigned
            expect(result.currentMonth.amount).toBe(currAmount)
            expect(result.previousMonth.amount).toBe(prevAmount)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })

    it('computeMonthOverMonth returns null when fewer than 2 months', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 10_000_000 }),
          fc.integer({ min: 2022, max: 2024 }),
          fc.integer({ min: 0, max: 11 }),
          (amount, year, month) => {
            // Single month
            const singleMonth: MonthlySpendingItem[] = [{ year, month, amount }]
            expect(computeMonthOverMonth(singleMonth)).toBeNull()

            // Empty array
            expect(computeMonthOverMonth([])).toBeNull()
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })

  // Feature: enhanced-stats-dashboard, Property 5: Expense distribution imbalance sort
  describe('Property 5: Expense distribution imbalance sort', () => {
    /**
     * Validates: Requirements 3.4
     *
     * For any set of expenses and participants, the computeExpenseDistribution
     * function SHALL return participants sorted by the absolute value of
     * difference (paid - share) in non-increasing order.
     */
    it('should return participants sorted by absolute difference descending', () => {
      fc.assert(
        fc.property(
          arbParticipantIds.chain((ids) =>
            fc.tuple(
              fc.constant(
                ids.map((id, i) => ({
                  id,
                  name: `Participant${i}`,
                })) as Participant[],
              ),
              fc.array(arbExpense(ids), { minLength: 1, maxLength: 30 }),
            ),
          ),
          ([participants, expenses]) => {
            const result = computeExpenseDistribution(expenses, participants)

            // Verify sorted by absolute difference in non-increasing order
            for (let i = 0; i < result.length - 1; i++) {
              const currentAbsDiff = Math.abs(result[i].difference)
              const nextAbsDiff = Math.abs(result[i + 1].difference)
              expect(currentAbsDiff).toBeGreaterThanOrEqual(nextAbsDiff)
            }
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })

  // Feature: enhanced-stats-dashboard, Property 6: Monthly aggregation conservation
  describe('Property 6: Monthly aggregation conservation', () => {
    /**
     * Validates: Requirements 4.1
     *
     * For any set of non-reimbursement expenses, the sum of all amount values
     * in the computeSpendingOverTime result SHALL equal the total
     * non-reimbursement spending.
     */
    it('sum of monthly amounts equals total non-reimbursement spending', () => {
      fc.assert(
        fc.property(
          arbParticipantIds.chain((ids) =>
            fc.array(arbExpense(ids), { minLength: 1, maxLength: 30 }),
          ),
          (expenses) => {
            const monthlyData = computeSpendingOverTime(expenses)

            // Compute expected total non-reimbursement spending
            const totalNonReimbursement = expenses
              .filter((e) => !e.isReimbursement)
              .reduce((sum, e) => sum + e.amount, 0)

            // Sum of all monthly amounts
            const monthlySum = monthlyData.reduce((sum, m) => sum + m.amount, 0)

            expect(monthlySum).toBe(totalNonReimbursement)
          },
        ),
        { numRuns: PBT_NUM_RUNS },
      )
    })
  })
})

// Feature: enhanced-stats-dashboard, Property 3: Conservation of money
describe('Property 3: Conservation of money (net balances sum to zero)', () => {
  /**
   * **Validates: Requirements 3.1, 8.1**
   *
   * For any set of non-reimbursement expenses and participants, the sum of all
   * netBalance values returned by computeNetBalances SHALL equal zero
   * (within floating-point tolerance).
   */
  it('sum of all netBalance values equals zero within floating-point tolerance', () => {
    // Generate participants with unique IDs and then expenses referencing those participants
    const arbParticipantsWithExpenses = fc
      .array(fc.uuid(), { minLength: 2, maxLength: 10 })
      .map((ids) => Array.from(new Set(ids)))
      .filter((ids) => ids.length >= 2)
      .chain((ids) => {
        const participants: Participant[] = ids.map((id, i) => ({
          id,
          name: `Participant${i}`,
        }))

        // Generate expenses where paidFor includes ALL participants
        // This ensures shares sum correctly for the conservation property
        const arbExpenseForConservation: fc.Arbitrary<Expense> = fc
          .tuple(
            fc.uuid(),
            fc.integer({ min: 1, max: 10_000_000 }),
            fc.constantFrom(...ids),
            fc.constantFrom(
              'EVENLY' as const,
              'BY_SHARES' as const,
              'BY_PERCENTAGE' as const,
              'BY_AMOUNT' as const,
            ),
            fc.date({
              min: new Date('2022-01-01T00:00:00.000Z'),
              max: new Date('2024-01-01T00:00:00.000Z'),
              noInvalidDate: true,
            }),
            fc.date({
              min: new Date('2022-01-01T00:00:00.000Z'),
              max: new Date('2024-01-01T00:00:00.000Z'),
              noInvalidDate: true,
            }),
            fc.string({ minLength: 1, maxLength: 20 }),
            fc.integer({ min: 0, max: 30 }),
            // Generate shares for each participant
            fc.array(fc.integer({ min: 1, max: 100 }), {
              minLength: ids.length,
              maxLength: ids.length,
            }),
          )
          .map(
            ([
              id,
              amount,
              payerId,
              splitMode,
              createdAt,
              expenseDate,
              title,
              categoryId,
              sharesArr,
            ]) => {
              let paidFor: Array<{
                user: { id: string; name: string }
                shares: number
              }>

              switch (splitMode) {
                case 'EVENLY':
                  paidFor = participants.map((p) => ({
                    user: { id: p.id, name: p.name },
                    shares: 1,
                  }))
                  break
                case 'BY_SHARES':
                  paidFor = participants.map((p, i) => ({
                    user: { id: p.id, name: p.name },
                    shares: sharesArr[i],
                  }))
                  break
                case 'BY_PERCENTAGE': {
                  // Distribute 10000 (100%) among participants
                  const equalShare = Math.floor(10000 / participants.length)
                  const remainder = 10000 - equalShare * participants.length
                  paidFor = participants.map((p, i) => ({
                    user: { id: p.id, name: p.name },
                    shares: equalShare + (i === 0 ? remainder : 0),
                  }))
                  break
                }
                case 'BY_AMOUNT': {
                  // Distribute amount among participants
                  const equalAmount = Math.floor(amount / participants.length)
                  const remainder = amount - equalAmount * participants.length
                  paidFor = participants.map((p, i) => ({
                    user: { id: p.id, name: p.name },
                    shares: equalAmount + (i === 0 ? remainder : 0),
                  }))
                  break
                }
              }

              return {
                id,
                amount,
                category:
                  categoryId === 0
                    ? null
                    : {
                        id: categoryId,
                        grouping: 'TestGroup',
                        name: `Category${categoryId}`,
                      },
                createdAt,
                expenseDate,
                isReimbursement: false,
                paidBy: {
                  id: payerId,
                  name:
                    participants.find((p) => p.id === payerId)?.name ??
                    'Unknown',
                },
                paidFor,
                splitMode,
                title,
              } as Expense
            },
          )

        return fc.tuple(
          fc.constant(participants),
          fc.array(arbExpenseForConservation, { minLength: 1, maxLength: 20 }),
        )
      })

    fc.assert(
      fc.property(arbParticipantsWithExpenses, ([participants, expenses]) => {
        const netBalances = computeNetBalances(expenses, participants)

        const totalNetBalance = netBalances.reduce(
          (sum, item) => sum + item.netBalance,
          0,
        )

        // The sum of all net balances should be zero within floating-point tolerance.
        // Net balance = paid - share. Sum of all paid = total spending.
        // Sum of all shares should also = total spending (money is conserved).
        const totalSpending = expenses.reduce((s, e) => s + e.amount, 0)
        const tolerance = Math.max(1e-6, totalSpending * 1e-9)

        expect(Math.abs(totalNetBalance)).toBeLessThanOrEqual(tolerance)
      }),
      { numRuns: PBT_NUM_RUNS },
    )
  })
})

// Feature: enhanced-stats-dashboard, Property 4: Participant ranking sort with tiebreaker
describe('Property 4: Participant ranking sort with tiebreaker', () => {
  /**
   * **Validates: Requirements 2.2, 2.3**
   *
   * For any set of expenses and participants, the computeParticipantRanking
   * function SHALL return participants sorted by totalPaid in non-increasing
   * order, and for participants with equal totalPaid, sorted alphabetically
   * by name.
   */
  it('ranking is sorted by totalPaid descending with alphabetical tiebreaker', () => {
    const arbParticipantsWithExpenses = fc
      .array(fc.uuid(), { minLength: 2, maxLength: 10 })
      .map((ids) => Array.from(new Set(ids)))
      .filter((ids) => ids.length >= 2)
      .chain((ids) => {
        const participants: Participant[] = ids.map((id, i) => ({
          id,
          name: `User${String.fromCharCode(65 + (i % 26))}${i}`,
        }))

        return fc.tuple(
          fc.constant(participants),
          fc.array(arbNonReimbursementExpense(ids), {
            minLength: 1,
            maxLength: 20,
          }),
        )
      })

    fc.assert(
      fc.property(arbParticipantsWithExpenses, ([participants, expenses]) => {
        const ranking = computeParticipantRanking(expenses, participants)

        // Verify the ranking is non-empty (we have participants)
        expect(ranking.length).toBeGreaterThanOrEqual(participants.length)

        // Verify sort order: descending by totalPaid, alphabetical tiebreaker
        for (let i = 0; i < ranking.length - 1; i++) {
          const current = ranking[i]
          const next = ranking[i + 1]

          if (current.totalPaid === next.totalPaid) {
            // Alphabetical tiebreaker: current name <= next name
            expect(
              current.participantName.localeCompare(next.participantName),
            ).toBeLessThanOrEqual(0)
          } else {
            // Descending by totalPaid
            expect(current.totalPaid).toBeGreaterThan(next.totalPaid)
          }
        }
      }),
      { numRuns: PBT_NUM_RUNS },
    )
  })
})

// Feature: enhanced-stats-dashboard, Property 11: Extreme expense identification
describe('Property 11: Extreme expense identification', () => {
  /**
   * **Validates: Requirements 7.3, 7.4**
   *
   * For any non-empty set of non-reimbursement expenses, computeAggregateMetrics SHALL return:
   * - largestExpense whose amount >= all other expense amounts (most recent createdAt tiebreaker)
   * - mostRecentExpense whose createdAt >= all other expenses' createdAt
   */

  const arbParticipantIds = fc
    .array(fc.uuid(), { minLength: 1, maxLength: 20 })
    .map((ids) => Array.from(new Set(ids)))
    .filter((ids) => ids.length >= 1)

  const arbSplitMode = fc.constantFrom(
    'EVENLY' as const,
    'BY_SHARES' as const,
    'BY_PERCENTAGE' as const,
    'BY_AMOUNT' as const,
  )

  const arbNonReimbursementExpense = (
    participantIds: string[],
  ): fc.Arbitrary<Expense> =>
    fc.record({
      id: fc.uuid(),
      amount: fc.integer({ min: 1, max: 10_000_000 }),
      category: fc.option(
        fc.record({
          id: fc.integer({ min: 0, max: 30 }),
          grouping: fc.string({ minLength: 1, maxLength: 20 }),
          name: fc.string({ minLength: 1, maxLength: 30 }),
        }),
        { nil: null },
      ),
      createdAt: fc.date({
        min: new Date('2022-01-01T00:00:00.000Z'),
        max: new Date('2024-01-01T00:00:00.000Z'),
        noInvalidDate: true,
      }),
      expenseDate: fc.date({
        min: new Date('2022-01-01T00:00:00.000Z'),
        max: new Date('2024-01-01T00:00:00.000Z'),
        noInvalidDate: true,
      }),
      isReimbursement: fc.constant(false),
      paidBy: fc.record({
        id: fc.constantFrom(...participantIds),
        name: fc.string({ minLength: 1, maxLength: 50 }),
      }),
      paidFor: fc.array(
        fc.record({
          user: fc.record({
            id: fc.constantFrom(...participantIds),
            name: fc.string({ minLength: 1, maxLength: 50 }),
          }),
          shares: fc.integer({ min: 1, max: 10000 }),
        }),
        { minLength: 1, maxLength: participantIds.length },
      ),
      splitMode: arbSplitMode,
      title: fc.string({ minLength: 1, maxLength: 100 }),
    }) as fc.Arbitrary<Expense>

  it('largestExpense has the maximum amount with most recent createdAt as tiebreaker', () => {
    fc.assert(
      fc.property(
        arbParticipantIds.chain((ids) =>
          fc.array(arbNonReimbursementExpense(ids), {
            minLength: 1,
            maxLength: 20,
          }),
        ),
        (expenses) => {
          const result = computeAggregateMetrics(expenses)

          expect(result.largestExpense).not.toBeNull()

          // The largest expense amount must equal the maximum amount in the set
          const maxAmount = Math.max(...expenses.map((e) => e.amount))
          expect(result.largestExpense!.amount).toBe(maxAmount)

          // Among expenses with the max amount, the one with the most recent createdAt should be chosen
          const maxAmountExpenses = expenses.filter(
            (e) => e.amount === maxAmount,
          )
          const mostRecentCreatedAt = maxAmountExpenses.reduce(
            (latest, e) => (e.createdAt > latest ? e.createdAt : latest),
            maxAmountExpenses[0].createdAt,
          )

          expect(result.largestExpense!.date.getTime()).toBe(
            mostRecentCreatedAt.getTime(),
          )
        },
      ),
      { numRuns: PBT_NUM_RUNS },
    )
  })

  it('mostRecentExpense has the latest createdAt timestamp', () => {
    fc.assert(
      fc.property(
        arbParticipantIds.chain((ids) =>
          fc.array(arbNonReimbursementExpense(ids), {
            minLength: 1,
            maxLength: 20,
          }),
        ),
        (expenses) => {
          const result = computeAggregateMetrics(expenses)

          expect(result.mostRecentExpense).not.toBeNull()

          // The most recent expense should have the latest createdAt
          const latestCreatedAt = expenses.reduce(
            (latest, e) => (e.createdAt > latest ? e.createdAt : latest),
            expenses[0].createdAt,
          )

          expect(result.mostRecentExpense!.date.getTime()).toBe(
            latestCreatedAt.getTime(),
          )
        },
      ),
      { numRuns: PBT_NUM_RUNS },
    )
  })
})

// Feature: enhanced-stats-dashboard, Property 12: Net balance descending sort
describe('Property 12: Net balance descending sort', () => {
  /**
   * **Validates: Requirements 8.4**
   *
   * For any set of expenses and participants, computeNetBalances SHALL return
   * participants sorted by netBalance in non-increasing order (most owed first).
   */

  const arbSplitMode = fc.constantFrom(
    'EVENLY' as const,
    'BY_SHARES' as const,
    'BY_PERCENTAGE' as const,
    'BY_AMOUNT' as const,
  )

  const arbParticipants: fc.Arbitrary<Participant[]> = fc
    .array(
      fc.record({
        id: fc.uuid(),
        name: fc.string({ minLength: 1, maxLength: 20 }),
      }),
      { minLength: 2, maxLength: 10 },
    )
    .filter((participants) => {
      const ids = new Set(participants.map((p) => p.id))
      return ids.size === participants.length
    })

  const arbNonReimbursementExpense = (
    participants: Participant[],
  ): fc.Arbitrary<Expense> => {
    const participantIds = participants.map((p) => p.id)
    return fc.record({
      id: fc.uuid(),
      amount: fc.integer({ min: 1, max: 10_000_000 }),
      category: fc.option(
        fc.record({
          id: fc.integer({ min: 0, max: 30 }),
          grouping: fc.string({ minLength: 1, maxLength: 20 }),
          name: fc.string({ minLength: 1, maxLength: 30 }),
        }),
        { nil: null },
      ),
      createdAt: fc.date({
        min: new Date('2022-01-01T00:00:00.000Z'),
        max: new Date('2024-01-01T00:00:00.000Z'),
        noInvalidDate: true,
      }),
      expenseDate: fc.date({
        min: new Date('2022-01-01T00:00:00.000Z'),
        max: new Date('2024-01-01T00:00:00.000Z'),
        noInvalidDate: true,
      }),
      isReimbursement: fc.constant(false),
      paidBy: fc.constantFrom(...participants).map((p) => ({
        id: p.id,
        name: p.name,
      })),
      paidFor: fc.subarray(participants, { minLength: 1 }).chain((subset) =>
        fc
          .tuple(...subset.map(() => fc.integer({ min: 1, max: 100 })))
          .map((shares) =>
            subset.map((p, i) => ({
              user: { id: p.id, name: p.name },
              shares: shares[i],
            })),
          ),
      ),
      splitMode: arbSplitMode,
      title: fc.string({ minLength: 1, maxLength: 100 }),
    }) as fc.Arbitrary<Expense>
  }

  it('netBalances are sorted by netBalance in descending order', () => {
    fc.assert(
      fc.property(
        arbParticipants.chain((participants) =>
          fc.tuple(
            fc.constant(participants),
            fc.array(arbNonReimbursementExpense(participants), {
              minLength: 1,
              maxLength: 20,
            }),
          ),
        ),
        ([participants, expenses]) => {
          const result = computeNetBalances(expenses, participants)

          // Verify we have results for all participants
          expect(result.length).toBe(participants.length)

          // Verify descending sort by netBalance
          for (let i = 0; i < result.length - 1; i++) {
            expect(result[i].netBalance).toBeGreaterThanOrEqual(
              result[i + 1].netBalance,
            )
          }
        },
      ),
      { numRuns: PBT_NUM_RUNS },
    )
  })
})
