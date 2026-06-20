import {
  Expense,
  Participant,
  computeAggregateMetrics,
  computeCategoryBreakdown,
  computeDailyAverage,
  computeExpenseDistribution,
  computeMonthOverMonth,
  computeNetBalances,
  computePaidVsSharePercentages,
  computeParticipantRanking,
  computeSpendingOverTime,
} from '@/lib/stats'

// --- Test Helpers ---

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'exp-1',
    amount: 10000,
    category: { id: 1, grouping: 'Food and Drink', name: 'Groceries' },
    createdAt: new Date('2024-01-15'),
    expenseDate: new Date('2024-01-15'),
    isReimbursement: false,
    paidBy: { id: 'p1', name: 'Alice' },
    paidFor: [{ user: { id: 'p1', name: 'Alice' }, shares: 1 }],
    splitMode: 'EVENLY',
    title: 'Test Expense',
    recurrenceRule: null,
    notes: null,
    _count: { documents: 0 },
    ...overrides,
  } as Expense
}

const participants: Participant[] = [
  { id: 'p1', name: 'Alice' },
  { id: 'p2', name: 'Bob' },
  { id: 'p3', name: 'Charlie' },
]

// --- computeCategoryBreakdown ---

describe('computeCategoryBreakdown', () => {
  it('returns empty array for empty expenses', () => {
    expect(computeCategoryBreakdown([])).toEqual([])
  })

  it('returns empty array when all expenses are reimbursements', () => {
    const expenses = [
      makeExpense({ isReimbursement: true }),
      makeExpense({ id: 'exp-2', isReimbursement: true }),
    ]
    expect(computeCategoryBreakdown(expenses)).toEqual([])
  })

  it('computes correct breakdown for a single expense', () => {
    const expenses = [makeExpense({ amount: 5000 })]
    const result = computeCategoryBreakdown(expenses)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      categoryId: 1,
      categoryName: 'Groceries',
      categoryGrouping: 'Food and Drink',
      amount: 5000,
      percentage: 100,
    })
  })

  it('maps categoryId=0 to "Uncategorized"', () => {
    const expenses = [makeExpense({ category: null, amount: 3000 })]
    const result = computeCategoryBreakdown(expenses)

    expect(result).toHaveLength(1)
    expect(result[0].categoryId).toBe(0)
    expect(result[0].categoryName).toBe('Uncategorized')
  })

  it('groups expenses by category and computes percentages', () => {
    const expenses = [
      makeExpense({
        id: 'e1',
        amount: 7000,
        category: { id: 1, grouping: 'Food', name: 'Groceries' },
      }),
      makeExpense({
        id: 'e2',
        amount: 3000,
        category: { id: 2, grouping: 'Transport', name: 'Gas' },
      }),
    ]
    const result = computeCategoryBreakdown(expenses)

    expect(result).toHaveLength(2)
    expect(result[0].categoryName).toBe('Groceries')
    expect(result[0].amount).toBe(7000)
    expect(result[0].percentage).toBe(70)
    expect(result[1].categoryName).toBe('Gas')
    expect(result[1].amount).toBe(3000)
    expect(result[1].percentage).toBe(30)
  })

  it('sorts categories by amount in descending order', () => {
    const expenses = [
      makeExpense({
        id: 'e1',
        amount: 1000,
        category: { id: 1, grouping: 'A', name: 'Small' },
      }),
      makeExpense({
        id: 'e2',
        amount: 5000,
        category: { id: 2, grouping: 'B', name: 'Large' },
      }),
      makeExpense({
        id: 'e3',
        amount: 3000,
        category: { id: 3, grouping: 'C', name: 'Medium' },
      }),
    ]
    const result = computeCategoryBreakdown(expenses)

    expect(result[0].categoryName).toBe('Large')
    expect(result[1].categoryName).toBe('Medium')
    expect(result[2].categoryName).toBe('Small')
  })

  it('excludes reimbursements from computation', () => {
    const expenses = [
      makeExpense({
        id: 'e1',
        amount: 8000,
        category: { id: 1, grouping: 'Food', name: 'Groceries' },
      }),
      makeExpense({
        id: 'e2',
        amount: 2000,
        category: { id: 2, grouping: 'Transport', name: 'Gas' },
        isReimbursement: true,
      }),
    ]
    const result = computeCategoryBreakdown(expenses)

    expect(result).toHaveLength(1)
    expect(result[0].amount).toBe(8000)
    expect(result[0].percentage).toBe(100)
  })

  it('rounds percentages to one decimal place', () => {
    const expenses = [
      makeExpense({
        id: 'e1',
        amount: 3333,
        category: { id: 1, grouping: 'A', name: 'Cat1' },
      }),
      makeExpense({
        id: 'e2',
        amount: 3333,
        category: { id: 2, grouping: 'B', name: 'Cat2' },
      }),
      makeExpense({
        id: 'e3',
        amount: 3334,
        category: { id: 3, grouping: 'C', name: 'Cat3' },
      }),
    ]
    const result = computeCategoryBreakdown(expenses)

    // Total = 10000
    // 3333/10000 = 33.33% -> 33.3
    // 3334/10000 = 33.34% -> 33.3
    expect(result[0].percentage).toBe(33.3)
    expect(result[1].percentage).toBe(33.3)
    expect(result[2].percentage).toBe(33.3)
  })
})

// --- computeParticipantRanking ---

describe('computeParticipantRanking', () => {
  it('returns all participants with zero totals for empty expenses', () => {
    const result = computeParticipantRanking([], participants)
    expect(result).toHaveLength(3)
    result.forEach((item) => {
      expect(item.totalPaid).toBe(0)
      expect(item.percentage).toBe(0)
    })
  })

  it('computes correct ranking for a single expense', () => {
    const expenses = [
      makeExpense({ amount: 5000, paidBy: { id: 'p1', name: 'Alice' } }),
    ]
    const result = computeParticipantRanking(expenses, participants)

    expect(result[0].participantName).toBe('Alice')
    expect(result[0].totalPaid).toBe(5000)
    expect(result[0].percentage).toBe(100)
    expect(result[1].totalPaid).toBe(0)
    expect(result[2].totalPaid).toBe(0)
  })

  it('computes correct ranking for multiple expenses', () => {
    const expenses = [
      makeExpense({
        id: 'e1',
        amount: 3000,
        paidBy: { id: 'p1', name: 'Alice' },
      }),
      makeExpense({
        id: 'e2',
        amount: 5000,
        paidBy: { id: 'p2', name: 'Bob' },
      }),
      makeExpense({
        id: 'e3',
        amount: 2000,
        paidBy: { id: 'p3', name: 'Charlie' },
      }),
    ]
    const result = computeParticipantRanking(expenses, participants)

    // Total = 10000
    expect(result[0].participantName).toBe('Bob')
    expect(result[0].totalPaid).toBe(5000)
    expect(result[0].percentage).toBe(50)
    expect(result[1].participantName).toBe('Alice')
    expect(result[1].totalPaid).toBe(3000)
    expect(result[1].percentage).toBe(30)
    expect(result[2].participantName).toBe('Charlie')
    expect(result[2].totalPaid).toBe(2000)
    expect(result[2].percentage).toBe(20)
  })

  it('excludes reimbursements from computation', () => {
    const expenses = [
      makeExpense({
        id: 'e1',
        amount: 5000,
        paidBy: { id: 'p1', name: 'Alice' },
      }),
      makeExpense({
        id: 'e2',
        amount: 3000,
        paidBy: { id: 'p2', name: 'Bob' },
        isReimbursement: true,
      }),
    ]
    const result = computeParticipantRanking(expenses, participants)

    expect(result[0].participantName).toBe('Alice')
    expect(result[0].totalPaid).toBe(5000)
    expect(result[0].percentage).toBe(100)
    expect(result[1].totalPaid).toBe(0)
  })

  it('uses alphabetical tiebreaker when totalPaid is equal', () => {
    const expenses = [
      makeExpense({
        id: 'e1',
        amount: 5000,
        paidBy: { id: 'p1', name: 'Alice' },
      }),
      makeExpense({
        id: 'e2',
        amount: 5000,
        paidBy: { id: 'p2', name: 'Bob' },
      }),
      makeExpense({
        id: 'e3',
        amount: 5000,
        paidBy: { id: 'p3', name: 'Charlie' },
      }),
    ]
    const result = computeParticipantRanking(expenses, participants)

    // All tied at 5000, should be alphabetical
    expect(result[0].participantName).toBe('Alice')
    expect(result[1].participantName).toBe('Bob')
    expect(result[2].participantName).toBe('Charlie')
  })
})

// --- computeExpenseDistribution ---

describe('computeExpenseDistribution', () => {
  it('returns all participants with zero values for empty expenses', () => {
    const result = computeExpenseDistribution([], participants)
    expect(result).toHaveLength(3)
    result.forEach((item) => {
      expect(item.totalPaid).toBe(0)
      expect(item.totalShare).toBe(0)
      expect(item.difference).toBe(0)
    })
  })

  it('computes correct distribution for a single expense split evenly', () => {
    const expenses = [
      makeExpense({
        amount: 9000,
        paidBy: { id: 'p1', name: 'Alice' },
        paidFor: [
          { user: { id: 'p1', name: 'Alice' }, shares: 1 },
          { user: { id: 'p2', name: 'Bob' }, shares: 1 },
          { user: { id: 'p3', name: 'Charlie' }, shares: 1 },
        ],
        splitMode: 'EVENLY',
      }),
    ]
    const result = computeExpenseDistribution(expenses, participants)

    // Alice paid 9000, share = 3000, difference = +6000
    const alice = result.find((r) => r.participantName === 'Alice')!
    expect(alice.totalPaid).toBe(9000)
    expect(alice.totalShare).toBe(3000)
    expect(alice.difference).toBe(6000)

    // Bob paid 0, share = 3000, difference = -3000
    const bob = result.find((r) => r.participantName === 'Bob')!
    expect(bob.totalPaid).toBe(0)
    expect(bob.totalShare).toBe(3000)
    expect(bob.difference).toBe(-3000)

    // Charlie paid 0, share = 3000, difference = -3000
    const charlie = result.find((r) => r.participantName === 'Charlie')!
    expect(charlie.totalPaid).toBe(0)
    expect(charlie.totalShare).toBe(3000)
    expect(charlie.difference).toBe(-3000)
  })

  it('excludes reimbursements from computation', () => {
    const expenses = [
      makeExpense({
        id: 'e1',
        amount: 6000,
        paidBy: { id: 'p1', name: 'Alice' },
        paidFor: [
          { user: { id: 'p1', name: 'Alice' }, shares: 1 },
          { user: { id: 'p2', name: 'Bob' }, shares: 1 },
        ],
        splitMode: 'EVENLY',
      }),
      makeExpense({
        id: 'e2',
        amount: 3000,
        paidBy: { id: 'p2', name: 'Bob' },
        isReimbursement: true,
        paidFor: [{ user: { id: 'p1', name: 'Alice' }, shares: 1 }],
        splitMode: 'EVENLY',
      }),
    ]
    const result = computeExpenseDistribution(expenses, participants)

    // Only the first expense counts
    const alice = result.find((r) => r.participantName === 'Alice')!
    expect(alice.totalPaid).toBe(6000)
    expect(alice.totalShare).toBe(3000)
  })

  it('sorts by absolute difference descending', () => {
    const expenses = [
      makeExpense({
        id: 'e1',
        amount: 9000,
        paidBy: { id: 'p1', name: 'Alice' },
        paidFor: [
          { user: { id: 'p1', name: 'Alice' }, shares: 1 },
          { user: { id: 'p2', name: 'Bob' }, shares: 1 },
          { user: { id: 'p3', name: 'Charlie' }, shares: 1 },
        ],
        splitMode: 'EVENLY',
      }),
    ]
    const result = computeExpenseDistribution(expenses, participants)

    // Alice: |6000| = 6000, Bob: |-3000| = 3000, Charlie: |-3000| = 3000
    expect(result[0].participantName).toBe('Alice')
    expect(Math.abs(result[0].difference)).toBeGreaterThanOrEqual(
      Math.abs(result[1].difference),
    )
    expect(Math.abs(result[1].difference)).toBeGreaterThanOrEqual(
      Math.abs(result[2].difference),
    )
  })
})

// --- computeSpendingOverTime ---

describe('computeSpendingOverTime', () => {
  it('returns empty array for empty expenses', () => {
    expect(computeSpendingOverTime([])).toEqual([])
  })

  it('returns empty array when all expenses are reimbursements', () => {
    const expenses = [makeExpense({ isReimbursement: true })]
    expect(computeSpendingOverTime(expenses)).toEqual([])
  })

  it('computes correct monthly aggregation for a single expense', () => {
    const expenses = [
      makeExpense({ amount: 5000, expenseDate: new Date('2024-03-15') }),
    ]
    const result = computeSpendingOverTime(expenses)

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ year: 2024, month: 2, amount: 5000 }) // March = month 2 (0-indexed)
  })

  it('aggregates multiple expenses in the same month', () => {
    const expenses = [
      makeExpense({
        id: 'e1',
        amount: 3000,
        expenseDate: new Date('2024-01-05'),
      }),
      makeExpense({
        id: 'e2',
        amount: 2000,
        expenseDate: new Date('2024-01-20'),
      }),
    ]
    const result = computeSpendingOverTime(expenses)

    expect(result).toHaveLength(1)
    expect(result[0].amount).toBe(5000)
  })

  it('fills month gaps with zero spending', () => {
    const expenses = [
      makeExpense({
        id: 'e1',
        amount: 3000,
        expenseDate: new Date('2024-01-15'),
      }),
      makeExpense({
        id: 'e2',
        amount: 4000,
        expenseDate: new Date('2024-04-15'),
      }),
    ]
    const result = computeSpendingOverTime(expenses)

    // Jan, Feb, Mar, Apr = 4 months
    expect(result).toHaveLength(4)
    expect(result[0]).toEqual({ year: 2024, month: 0, amount: 3000 }) // Jan
    expect(result[1]).toEqual({ year: 2024, month: 1, amount: 0 }) // Feb (gap)
    expect(result[2]).toEqual({ year: 2024, month: 2, amount: 0 }) // Mar (gap)
    expect(result[3]).toEqual({ year: 2024, month: 3, amount: 4000 }) // Apr
  })

  it('excludes reimbursements from computation', () => {
    const expenses = [
      makeExpense({
        id: 'e1',
        amount: 5000,
        expenseDate: new Date('2024-01-15'),
      }),
      makeExpense({
        id: 'e2',
        amount: 3000,
        expenseDate: new Date('2024-02-15'),
        isReimbursement: true,
      }),
    ]
    const result = computeSpendingOverTime(expenses)

    // Only January should appear since Feb expense is a reimbursement
    expect(result).toHaveLength(1)
    expect(result[0].amount).toBe(5000)
  })

  it('handles year boundary correctly', () => {
    const expenses = [
      makeExpense({
        id: 'e1',
        amount: 2000,
        expenseDate: new Date('2023-11-15'),
      }),
      makeExpense({
        id: 'e2',
        amount: 3000,
        expenseDate: new Date('2024-02-15'),
      }),
    ]
    const result = computeSpendingOverTime(expenses)

    // Nov 2023, Dec 2023, Jan 2024, Feb 2024 = 4 months
    expect(result).toHaveLength(4)
    expect(result[0]).toEqual({ year: 2023, month: 10, amount: 2000 }) // Nov
    expect(result[1]).toEqual({ year: 2023, month: 11, amount: 0 }) // Dec (gap)
    expect(result[2]).toEqual({ year: 2024, month: 0, amount: 0 }) // Jan (gap)
    expect(result[3]).toEqual({ year: 2024, month: 1, amount: 3000 }) // Feb
  })

  it('returns results in chronological order', () => {
    const expenses = [
      makeExpense({
        id: 'e1',
        amount: 1000,
        expenseDate: new Date('2024-06-15'),
      }),
      makeExpense({
        id: 'e2',
        amount: 2000,
        expenseDate: new Date('2024-01-15'),
      }),
    ]
    const result = computeSpendingOverTime(expenses)

    for (let i = 1; i < result.length; i++) {
      const prev = result[i - 1].year * 12 + result[i - 1].month
      const curr = result[i].year * 12 + result[i].month
      expect(curr).toBeGreaterThan(prev)
    }
  })
})

// --- computeMonthOverMonth ---

describe('computeMonthOverMonth', () => {
  it('returns null for empty monthly data', () => {
    expect(computeMonthOverMonth([])).toBeNull()
  })

  it('returns null for single month data', () => {
    const monthlyData = [{ year: 2024, month: 0, amount: 5000 }]
    expect(computeMonthOverMonth(monthlyData)).toBeNull()
  })

  it('computes correct month-over-month for two months', () => {
    const monthlyData = [
      { year: 2024, month: 0, amount: 4000 },
      { year: 2024, month: 1, amount: 6000 },
    ]
    const result = computeMonthOverMonth(monthlyData)

    expect(result).not.toBeNull()
    expect(result!.previousMonth).toEqual({
      year: 2024,
      month: 0,
      amount: 4000,
    })
    expect(result!.currentMonth).toEqual({
      year: 2024,
      month: 1,
      amount: 6000,
    })
    expect(result!.absoluteDifference).toBe(2000)
    expect(result!.percentageChange).toBe(50) // (6000-4000)/4000 * 100 = 50%
  })

  it('handles spending decrease correctly', () => {
    const monthlyData = [
      { year: 2024, month: 0, amount: 8000 },
      { year: 2024, month: 1, amount: 4000 },
    ]
    const result = computeMonthOverMonth(monthlyData)

    expect(result!.absoluteDifference).toBe(-4000)
    expect(result!.percentageChange).toBe(-50) // (4000-8000)/8000 * 100 = -50%
  })

  it('handles zero previous month (division by zero)', () => {
    const monthlyData = [
      { year: 2024, month: 0, amount: 0 },
      { year: 2024, month: 1, amount: 5000 },
    ]
    const result = computeMonthOverMonth(monthlyData)

    expect(result!.absoluteDifference).toBe(5000)
    expect(result!.percentageChange).toBe(Infinity)
  })

  it('handles both months zero', () => {
    const monthlyData = [
      { year: 2024, month: 0, amount: 0 },
      { year: 2024, month: 1, amount: 0 },
    ]
    const result = computeMonthOverMonth(monthlyData)

    expect(result!.absoluteDifference).toBe(0)
    expect(result!.percentageChange).toBe(0)
  })

  it('uses last two months from longer array', () => {
    const monthlyData = [
      { year: 2024, month: 0, amount: 1000 },
      { year: 2024, month: 1, amount: 2000 },
      { year: 2024, month: 2, amount: 3000 },
    ]
    const result = computeMonthOverMonth(monthlyData)

    expect(result!.previousMonth.amount).toBe(2000)
    expect(result!.currentMonth.amount).toBe(3000)
    expect(result!.absoluteDifference).toBe(1000)
    expect(result!.percentageChange).toBe(50)
  })
})

// --- computeDailyAverage ---

describe('computeDailyAverage', () => {
  it('returns null for empty expenses', () => {
    expect(computeDailyAverage([])).toBeNull()
  })

  it('returns null when all expenses are reimbursements', () => {
    const expenses = [makeExpense({ isReimbursement: true })]
    expect(computeDailyAverage(expenses)).toBeNull()
  })

  it('returns total as daily average for single-day expenses', () => {
    const expenses = [
      makeExpense({
        id: 'e1',
        amount: 3000,
        expenseDate: new Date('2024-01-15'),
      }),
      makeExpense({
        id: 'e2',
        amount: 2000,
        expenseDate: new Date('2024-01-15'),
      }),
    ]
    const result = computeDailyAverage(expenses)

    // All on same day, so days = 1, average = 5000/1 = 5000
    expect(result).toBe(5000)
  })

  it('computes correct daily average across multiple days', () => {
    const expenses = [
      makeExpense({
        id: 'e1',
        amount: 1000,
        expenseDate: new Date('2024-01-01'),
      }),
      makeExpense({
        id: 'e2',
        amount: 2000,
        expenseDate: new Date('2024-01-10'),
      }),
    ]
    const result = computeDailyAverage(expenses)

    // Total = 3000, days = 10 (Jan 1 to Jan 10 inclusive)
    expect(result).toBe(300) // 3000 / 10
  })

  it('excludes reimbursements from computation', () => {
    const expenses = [
      makeExpense({
        id: 'e1',
        amount: 3000,
        expenseDate: new Date('2024-01-01'),
      }),
      makeExpense({
        id: 'e2',
        amount: 2000,
        expenseDate: new Date('2024-01-10'),
        isReimbursement: true,
      }),
    ]
    const result = computeDailyAverage(expenses)

    // Only first expense counts: total = 3000, days = 1 (only one non-reimbursement date)
    expect(result).toBe(3000)
  })

  it('handles expenses spanning multiple months', () => {
    const expenses = [
      makeExpense({
        id: 'e1',
        amount: 10000,
        expenseDate: new Date('2024-01-01'),
      }),
      makeExpense({
        id: 'e2',
        amount: 20000,
        expenseDate: new Date('2024-01-31'),
      }),
    ]
    const result = computeDailyAverage(expenses)

    // Total = 30000, days = 31 (Jan 1 to Jan 31 inclusive)
    expect(result).toBeCloseTo(30000 / 31)
  })
})

// --- computeAggregateMetrics ---

describe('computeAggregateMetrics', () => {
  it('returns zeros and nulls for empty expenses', () => {
    const result = computeAggregateMetrics([])
    expect(result).toEqual({
      totalCount: 0,
      averageAmount: null,
      largestExpense: null,
      mostRecentExpense: null,
    })
  })

  it('returns zeros and nulls when all expenses are reimbursements', () => {
    const expenses = [
      makeExpense({ isReimbursement: true }),
      makeExpense({ id: 'e2', isReimbursement: true }),
    ]
    const result = computeAggregateMetrics(expenses)
    expect(result.totalCount).toBe(0)
    expect(result.averageAmount).toBeNull()
    expect(result.largestExpense).toBeNull()
    expect(result.mostRecentExpense).toBeNull()
  })

  it('computes correct metrics for a single expense', () => {
    const expenses = [
      makeExpense({
        amount: 5000,
        title: 'Dinner',
        createdAt: new Date('2024-01-15'),
      }),
    ]
    const result = computeAggregateMetrics(expenses)

    expect(result.totalCount).toBe(1)
    expect(result.averageAmount).toBe(5000)
    expect(result.largestExpense).toEqual({
      title: 'Dinner',
      amount: 5000,
      date: new Date('2024-01-15'),
    })
    expect(result.mostRecentExpense).toEqual({
      title: 'Dinner',
      amount: 5000,
      date: new Date('2024-01-15'),
    })
  })

  it('computes correct metrics for multiple expenses', () => {
    const expenses = [
      makeExpense({
        id: 'e1',
        amount: 2000,
        title: 'Coffee',
        createdAt: new Date('2024-01-10'),
      }),
      makeExpense({
        id: 'e2',
        amount: 8000,
        title: 'Dinner',
        createdAt: new Date('2024-01-15'),
      }),
      makeExpense({
        id: 'e3',
        amount: 5000,
        title: 'Lunch',
        createdAt: new Date('2024-01-20'),
      }),
    ]
    const result = computeAggregateMetrics(expenses)

    expect(result.totalCount).toBe(3)
    expect(result.averageAmount).toBe(5000) // 15000 / 3
    expect(result.largestExpense!.title).toBe('Dinner')
    expect(result.largestExpense!.amount).toBe(8000)
    expect(result.mostRecentExpense!.title).toBe('Lunch')
    expect(result.mostRecentExpense!.date).toEqual(new Date('2024-01-20'))
  })

  it('uses most recent createdAt as tiebreaker for largest expense', () => {
    const expenses = [
      makeExpense({
        id: 'e1',
        amount: 5000,
        title: 'First',
        createdAt: new Date('2024-01-10'),
      }),
      makeExpense({
        id: 'e2',
        amount: 5000,
        title: 'Second',
        createdAt: new Date('2024-01-20'),
      }),
    ]
    const result = computeAggregateMetrics(expenses)

    // Both have same amount, tiebreaker is most recent createdAt
    expect(result.largestExpense!.title).toBe('Second')
    expect(result.largestExpense!.date).toEqual(new Date('2024-01-20'))
  })

  it('excludes reimbursements from all metrics', () => {
    const expenses = [
      makeExpense({
        id: 'e1',
        amount: 5000,
        title: 'Dinner',
        createdAt: new Date('2024-01-15'),
      }),
      makeExpense({
        id: 'e2',
        amount: 10000,
        title: 'Reimbursement',
        createdAt: new Date('2024-01-20'),
        isReimbursement: true,
      }),
    ]
    const result = computeAggregateMetrics(expenses)

    expect(result.totalCount).toBe(1)
    expect(result.averageAmount).toBe(5000)
    expect(result.largestExpense!.title).toBe('Dinner')
    expect(result.mostRecentExpense!.title).toBe('Dinner')
  })
})

// --- computeNetBalances ---

describe('computeNetBalances', () => {
  it('returns all participants with zero balances for empty expenses', () => {
    const result = computeNetBalances([], participants)
    expect(result).toHaveLength(3)
    result.forEach((item) => {
      expect(item.totalPaid).toBe(0)
      expect(item.totalShare).toBe(0)
      expect(item.netBalance).toBe(0)
    })
  })

  it('computes correct net balances for a single expense split evenly', () => {
    const expenses = [
      makeExpense({
        amount: 9000,
        paidBy: { id: 'p1', name: 'Alice' },
        paidFor: [
          { user: { id: 'p1', name: 'Alice' }, shares: 1 },
          { user: { id: 'p2', name: 'Bob' }, shares: 1 },
          { user: { id: 'p3', name: 'Charlie' }, shares: 1 },
        ],
        splitMode: 'EVENLY',
      }),
    ]
    const result = computeNetBalances(expenses, participants)

    // Alice: paid 9000, share 3000, net +6000
    // Bob: paid 0, share 3000, net -3000
    // Charlie: paid 0, share 3000, net -3000
    const alice = result.find((r) => r.participantName === 'Alice')!
    expect(alice.totalPaid).toBe(9000)
    expect(alice.totalShare).toBe(3000)
    expect(alice.netBalance).toBe(6000)

    const bob = result.find((r) => r.participantName === 'Bob')!
    expect(bob.netBalance).toBe(-3000)
  })

  it('net balances sum to zero (conservation of money)', () => {
    const expenses = [
      makeExpense({
        id: 'e1',
        amount: 9000,
        paidBy: { id: 'p1', name: 'Alice' },
        paidFor: [
          { user: { id: 'p1', name: 'Alice' }, shares: 1 },
          { user: { id: 'p2', name: 'Bob' }, shares: 1 },
          { user: { id: 'p3', name: 'Charlie' }, shares: 1 },
        ],
        splitMode: 'EVENLY',
      }),
      makeExpense({
        id: 'e2',
        amount: 6000,
        paidBy: { id: 'p2', name: 'Bob' },
        paidFor: [
          { user: { id: 'p1', name: 'Alice' }, shares: 1 },
          { user: { id: 'p2', name: 'Bob' }, shares: 1 },
        ],
        splitMode: 'EVENLY',
      }),
    ]
    const result = computeNetBalances(expenses, participants)

    const totalNetBalance = result.reduce(
      (sum, item) => sum + item.netBalance,
      0,
    )
    expect(totalNetBalance).toBeCloseTo(0)
  })

  it('sorts by netBalance descending (most owed first)', () => {
    const expenses = [
      makeExpense({
        amount: 9000,
        paidBy: { id: 'p1', name: 'Alice' },
        paidFor: [
          { user: { id: 'p1', name: 'Alice' }, shares: 1 },
          { user: { id: 'p2', name: 'Bob' }, shares: 1 },
          { user: { id: 'p3', name: 'Charlie' }, shares: 1 },
        ],
        splitMode: 'EVENLY',
      }),
    ]
    const result = computeNetBalances(expenses, participants)

    // Alice has highest net balance (+6000), then Bob and Charlie (-3000 each)
    expect(result[0].participantName).toBe('Alice')
    expect(result[0].netBalance).toBe(6000)
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].netBalance).toBeGreaterThanOrEqual(
        result[i].netBalance,
      )
    }
  })

  it('excludes reimbursements from computation', () => {
    const expenses = [
      makeExpense({
        id: 'e1',
        amount: 6000,
        paidBy: { id: 'p1', name: 'Alice' },
        paidFor: [
          { user: { id: 'p1', name: 'Alice' }, shares: 1 },
          { user: { id: 'p2', name: 'Bob' }, shares: 1 },
        ],
        splitMode: 'EVENLY',
      }),
      makeExpense({
        id: 'e2',
        amount: 3000,
        paidBy: { id: 'p2', name: 'Bob' },
        isReimbursement: true,
        paidFor: [{ user: { id: 'p1', name: 'Alice' }, shares: 1 }],
        splitMode: 'EVENLY',
      }),
    ]
    const result = computeNetBalances(expenses, participants)

    // Only first expense counts
    const alice = result.find((r) => r.participantName === 'Alice')!
    expect(alice.totalPaid).toBe(6000)
    expect(alice.totalShare).toBe(3000)
    expect(alice.netBalance).toBe(3000)
  })
})

// --- computePaidVsSharePercentages ---

describe('computePaidVsSharePercentages', () => {
  it('returns empty array for empty expenses', () => {
    expect(computePaidVsSharePercentages([], participants)).toEqual([])
  })

  it('returns empty array when all expenses are reimbursements', () => {
    const expenses = [makeExpense({ isReimbursement: true })]
    expect(computePaidVsSharePercentages(expenses, participants)).toEqual([])
  })

  it('computes correct percentages for a single expense split evenly', () => {
    const expenses = [
      makeExpense({
        amount: 9000,
        paidBy: { id: 'p1', name: 'Alice' },
        paidFor: [
          { user: { id: 'p1', name: 'Alice' }, shares: 1 },
          { user: { id: 'p2', name: 'Bob' }, shares: 1 },
          { user: { id: 'p3', name: 'Charlie' }, shares: 1 },
        ],
        splitMode: 'EVENLY',
      }),
    ]
    const result = computePaidVsSharePercentages(expenses, participants)

    expect(result).toHaveLength(3)

    const alice = result.find((r) => r.participantName === 'Alice')!
    expect(alice.paidPercentage).toBe(100) // 9000/9000 * 100
    expect(alice.sharePercentage).toBe(33.3) // 3000/9000 * 100

    const bob = result.find((r) => r.participantName === 'Bob')!
    expect(bob.paidPercentage).toBe(0)
    expect(bob.sharePercentage).toBe(33.3)
  })

  it('computes correct percentages for multiple expenses', () => {
    const expenses = [
      makeExpense({
        id: 'e1',
        amount: 6000,
        paidBy: { id: 'p1', name: 'Alice' },
        paidFor: [
          { user: { id: 'p1', name: 'Alice' }, shares: 1 },
          { user: { id: 'p2', name: 'Bob' }, shares: 1 },
        ],
        splitMode: 'EVENLY',
      }),
      makeExpense({
        id: 'e2',
        amount: 4000,
        paidBy: { id: 'p2', name: 'Bob' },
        paidFor: [
          { user: { id: 'p2', name: 'Bob' }, shares: 1 },
          { user: { id: 'p3', name: 'Charlie' }, shares: 1 },
        ],
        splitMode: 'EVENLY',
      }),
    ]
    const result = computePaidVsSharePercentages(expenses, participants)

    // Total spending = 10000
    // Alice: paid 6000 (60%), share = 3000 (30%)
    // Bob: paid 4000 (40%), share = 3000 + 2000 = 5000 (50%)
    // Charlie: paid 0 (0%), share = 2000 (20%)
    const alice = result.find((r) => r.participantName === 'Alice')!
    expect(alice.paidPercentage).toBe(60)
    expect(alice.sharePercentage).toBe(30)

    const bob = result.find((r) => r.participantName === 'Bob')!
    expect(bob.paidPercentage).toBe(40)
    expect(bob.sharePercentage).toBe(50)

    const charlie = result.find((r) => r.participantName === 'Charlie')!
    expect(charlie.paidPercentage).toBe(0)
    expect(charlie.sharePercentage).toBe(20)
  })

  it('excludes reimbursements from computation', () => {
    const expenses = [
      makeExpense({
        id: 'e1',
        amount: 6000,
        paidBy: { id: 'p1', name: 'Alice' },
        paidFor: [
          { user: { id: 'p1', name: 'Alice' }, shares: 1 },
          { user: { id: 'p2', name: 'Bob' }, shares: 1 },
        ],
        splitMode: 'EVENLY',
      }),
      makeExpense({
        id: 'e2',
        amount: 4000,
        paidBy: { id: 'p2', name: 'Bob' },
        isReimbursement: true,
        paidFor: [{ user: { id: 'p1', name: 'Alice' }, shares: 1 }],
        splitMode: 'EVENLY',
      }),
    ]
    const result = computePaidVsSharePercentages(expenses, participants)

    // Only first expense counts, total = 6000
    const alice = result.find((r) => r.participantName === 'Alice')!
    expect(alice.paidPercentage).toBe(100)
    expect(alice.sharePercentage).toBe(50)
  })

  it('handles division-by-zero when total spending is zero (all reimbursements)', () => {
    const expenses = [makeExpense({ isReimbursement: true, amount: 5000 })]
    const result = computePaidVsSharePercentages(expenses, participants)
    expect(result).toEqual([])
  })
})
