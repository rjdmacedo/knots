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

// --- Multi-payer unit tests ---

function makeMultiPayerExpense(
  payers: Array<{ id: string; amount: number }>,
  participantIds: string[],
  opts: { splitMode?: TestExpense['splitMode']; amount?: number } = {},
): TestExpense {
  const amount = opts.amount ?? payers.reduce((sum, p) => sum + p.amount, 0)
  const splitMode = opts.splitMode ?? 'EVENLY'

  return {
    amount,
    isReimbursement: false,
    splitMode,
    paidBy: { id: payers[0].id, name: payers[0].id },
    paidFor: participantIds.map((id) => ({
      user: { id, name: id },
      shares: 1,
    })),
    payers: payers.map((p) => ({
      userId: p.id,
      amount: p.amount,
      user: { id: p.id, name: p.id },
    })),
  } as TestExpense
}

describe('getBalances multi-payer', () => {
  it('single payer backward compatibility: same result as legacy', () => {
    // Single payer via payers array
    const multiPayerExpense = makeMultiPayerExpense(
      [{ id: 'alice', amount: 6000 }],
      ['alice', 'bob', 'carol'],
    )

    // Single payer via legacy paidBy (no payers array)
    const legacyExpense = makeEvenExpense(
      'alice',
      ['alice', 'bob', 'carol'],
      6000,
    )

    const multiResult = getBalances([multiPayerExpense])
    const legacyResult = getBalances([legacyExpense])

    expect(multiResult).toEqual(legacyResult)
  })

  it('two payers splitting payment evenly', () => {
    // Alice pays 5000, Bob pays 5000, total = 10000
    // Split evenly among alice, bob, carol (each owes ~3333)
    const expense = makeMultiPayerExpense(
      [
        { id: 'alice', amount: 5000 },
        { id: 'bob', amount: 5000 },
      ],
      ['alice', 'bob', 'carol'],
    )

    const balances = getBalances([expense])

    // Alice paid 5000
    expect(balances['alice'].paid).toBe(5000)
    // Bob paid 5000
    expect(balances['bob'].paid).toBe(5000)
    // Carol paid 0
    expect(balances['carol'].paid).toBe(0)

    // Total paid must equal expense amount
    expect(
      balances['alice'].paid + balances['bob'].paid + balances['carol'].paid,
    ).toBe(10000)

    // Each person's paidFor is rounded: 10000/3 ≈ 3333 for first two, last gets remainder ~3333
    // After Math.round: all get 3333 (rounding remainder is fractional, rounds to same)
    expect(balances['alice'].paidFor).toBe(3333)
    expect(balances['bob'].paidFor).toBe(3333)
    expect(balances['carol'].paidFor).toBe(3333)

    // Each total = paid - paidFor
    expect(balances['alice'].total).toBe(5000 - 3333)
    expect(balances['bob'].total).toBe(5000 - 3333)
    expect(balances['carol'].total).toBe(0 - 3333)
  })

  it('three payers with uneven amounts', () => {
    // Alice: 5000, Bob: 3000, Carol: 2000 → total = 10000
    // Split evenly among alice, bob, carol, dave (4 people)
    const expense = makeMultiPayerExpense(
      [
        { id: 'alice', amount: 5000 },
        { id: 'bob', amount: 3000 },
        { id: 'carol', amount: 2000 },
      ],
      ['alice', 'bob', 'carol', 'dave'],
    )

    const balances = getBalances([expense])

    expect(balances['alice'].paid).toBe(5000)
    expect(balances['bob'].paid).toBe(3000)
    expect(balances['carol'].paid).toBe(2000)
    expect(balances['dave'].paid).toBe(0)

    // Total paid = 10000
    const totalPaid = Object.values(balances).reduce((s, b) => s + b.paid, 0)
    expect(totalPaid).toBe(10000)

    // Total paidFor = 10000
    const totalPaidFor = Object.values(balances).reduce(
      (s, b) => s + b.paidFor,
      0,
    )
    expect(totalPaidFor).toBe(10000)

    // Each person's total = paid - paidFor
    for (const userId of Object.keys(balances)) {
      expect(balances[userId].total).toBe(
        balances[userId].paid - balances[userId].paidFor,
      )
    }

    // Sum of all totals should be zero (zero-sum game)
    const totalNet = Object.values(balances).reduce((s, b) => s + b.total, 0)
    expect(totalNet).toBe(0)
  })

  it('payer who is also a beneficiary (net position)', () => {
    // Alice pays 8000, Bob pays 2000, total = 10000
    // Split evenly between alice and bob (each owes 5000)
    const expense = makeMultiPayerExpense(
      [
        { id: 'alice', amount: 8000 },
        { id: 'bob', amount: 2000 },
      ],
      ['alice', 'bob'],
    )

    const balances = getBalances([expense])

    // Alice: paid 8000, paidFor 5000, net +3000
    expect(balances['alice'].paid).toBe(8000)
    expect(balances['alice'].paidFor).toBe(5000)
    expect(balances['alice'].total).toBe(3000)

    // Bob: paid 2000, paidFor 5000, net -3000
    expect(balances['bob'].paid).toBe(2000)
    expect(balances['bob'].paidFor).toBe(5000)
    expect(balances['bob'].total).toBe(-3000)
  })

  it('rounding remainder with multiple payers', () => {
    // Use an amount where the last-gets-remainder approach produces
    // a visible difference: 10000 split among 3, total = 10000
    // payer split: Alice 7000, Bob 3000
    const expense = makeMultiPayerExpense(
      [
        { id: 'alice', amount: 7000 },
        { id: 'bob', amount: 3000 },
      ],
      ['alice', 'bob', 'carol'],
      { amount: 10000 },
    )

    const balances = getBalances([expense])

    // Paid credits come from payers array
    expect(balances['alice'].paid).toBe(7000)
    expect(balances['bob'].paid).toBe(3000)
    expect(balances['carol'].paid).toBe(0)

    // paidFor with EVENLY split for 10000/3:
    // First: 10000/3 = 3333.33 → remaining = 10000 - 3333.33 = 6666.67
    // Second: 10000/3 = 3333.33 → remaining = 6666.67 - 3333.33 = 3333.33
    // Third (last): remaining = 3333.33
    // After Math.round: 3333, 3333, 3333
    expect(balances['alice'].paidFor).toBe(3333)
    expect(balances['bob'].paidFor).toBe(3333)
    expect(balances['carol'].paidFor).toBe(3333)

    // Net positions
    expect(balances['alice'].total).toBe(7000 - 3333)
    expect(balances['bob'].total).toBe(3000 - 3333)
    expect(balances['carol'].total).toBe(0 - 3333)

    // All payers are credited independently; rounding does not affect paid side
    const totalPaid = Object.values(balances).reduce((s, b) => s + b.paid, 0)
    expect(totalPaid).toBe(10000)
  })
})
