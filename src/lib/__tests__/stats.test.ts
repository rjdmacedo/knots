import { computeCategoryBreakdown, Expense } from '@/lib/stats'

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
    paidFor: [{ participant: { id: 'p1', name: 'Alice' }, shares: 1 }],
    splitMode: 'EVENLY',
    title: 'Test Expense',
    recurrenceRule: null,
    _count: { documents: 0 },
    ...overrides,
  } as Expense
}

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
    // Sorted descending by amount
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
