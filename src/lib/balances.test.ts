import { getBalances } from './balances'
import { calculateShare } from './totals'

type TestExpense = Parameters<typeof getBalances>[0][number]

function makePercentageExpense(
  paidForShares: Array<{ id: string; shares: number }>,
  amount = 100_000,
): TestExpense {
  return {
    amount,
    isReimbursement: false,
    splitMode: 'BY_PERCENTAGE',
    paidBy: { id: 'rafael', name: 'Rafael' },
    paidFor: paidForShares.map(({ id, shares }) => ({
      user: { id, name: id },
      shares,
    })),
  } as TestExpense
}

function netBalanceFromShares(expense: TestExpense, userId: string): number {
  const balances = getBalances([expense])
  return balances[userId]?.total ?? 0
}

function netBalanceFromCalculateShare(
  expense: TestExpense,
  userId: string,
): number {
  const paid = expense.paidBy.id === userId ? expense.amount : 0
  const share = calculateShare(userId, expense)
  return paid - share
}

describe('getBalances BY_PERCENTAGE', () => {
  it('matches calculateShare when shares use basis points (4930/5070)', () => {
    const expense = makePercentageExpense([
      { id: 'rafael', shares: 4930 },
      { id: 'ana', shares: 5070 },
    ])

    expect(netBalanceFromShares(expense, 'rafael')).toBe(
      netBalanceFromCalculateShare(expense, 'rafael'),
    )
    expect(netBalanceFromShares(expense, 'ana')).toBe(
      netBalanceFromCalculateShare(expense, 'ana'),
    )
  })

  it('matches calculateShare when shares do not sum to 10000', () => {
    const expense = makePercentageExpense([
      { id: 'rafael', shares: 493 },
      { id: 'ana', shares: 507 },
    ])

    expect(netBalanceFromShares(expense, 'rafael')).toBe(
      netBalanceFromCalculateShare(expense, 'rafael'),
    )
    expect(netBalanceFromShares(expense, 'ana')).toBe(
      netBalanceFromCalculateShare(expense, 'ana'),
    )
  })

  it('matches calculateShare for legacy percent-out-of-100 storage (49/51)', () => {
    const expense = makePercentageExpense([
      { id: 'rafael', shares: 49 },
      { id: 'ana', shares: 51 },
    ])

    expect(netBalanceFromShares(expense, 'rafael')).toBe(
      netBalanceFromCalculateShare(expense, 'rafael'),
    )
    expect(netBalanceFromShares(expense, 'ana')).toBe(
      netBalanceFromCalculateShare(expense, 'ana'),
    )
  })
})

function makeEvenExpense(
  payerId: string,
  participantIds: string[],
  amount: number,
): TestExpense {
  return {
    amount,
    isReimbursement: false,
    splitMode: 'EVENLY',
    paidBy: { id: payerId, name: payerId },
    paidFor: participantIds.map((id) => ({
      user: { id, name: id },
      shares: 1,
    })),
  } as TestExpense
}

describe('getReimbursements', () => {
  it('simplified mode reduces payments through intermediaries', () => {
    const { getReimbursements } = jest.requireActual(
      './balances',
    ) as typeof import('./balances')
    const expenses = [
      makeEvenExpense('alice', ['bob', 'carol'], 200),
      makeEvenExpense('bob', ['carol'], 100),
    ]

    const simplified = getReimbursements(expenses, { simplifyDebts: true })
    const direct = getReimbursements(expenses, { simplifyDebts: false })

    expect(simplified).toEqual([{ from: 'carol', to: 'alice', amount: 200 }])
    expect(direct).toEqual(
      expect.arrayContaining([
        { from: 'bob', to: 'alice', amount: 100 },
        { from: 'carol', to: 'alice', amount: 100 },
        { from: 'carol', to: 'bob', amount: 100 },
      ]),
    )
    expect(direct).toHaveLength(3)
  })

  it('defaults to simplified mode', () => {
    const { getReimbursements } = jest.requireActual(
      './balances',
    ) as typeof import('./balances')
    const expenses = [makeEvenExpense('alice', ['alice', 'bob'], 200)]

    expect(getReimbursements(expenses)).toEqual([
      { from: 'bob', to: 'alice', amount: 100 },
    ])
  })
})
