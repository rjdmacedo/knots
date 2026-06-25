import { GroupType } from '@prisma/client'
import {
  computeFriendBalance,
  computeFriendSettlements,
  FriendBalanceSummary,
  getPairwiseBalance,
  sortFriendBalances,
} from './friend-balances'

jest.mock('@/lib/balances', () => ({
  getBalances: jest.fn(),
  getReimbursements: jest.fn(),
}))

import { getBalances, getReimbursements } from '@/lib/balances'

const mockedGetBalances = getBalances as jest.MockedFunction<typeof getBalances>
const mockedGetReimbursements = getReimbursements as jest.MockedFunction<
  typeof getReimbursements
>

describe('getPairwiseBalance', () => {
  const currentUserId = 'user-1'
  const friendUserId = 'user-2'

  it('returns 0 when reimbursements array is empty', () => {
    expect(getPairwiseBalance([], currentUserId, friendUserId)).toBe(0)
  })

  it('returns 0 when no reimbursements match the two users', () => {
    const reimbursements = [
      { from: 'user-3', to: 'user-4', amount: 500 },
      { from: 'user-5', to: 'user-6', amount: 300 },
    ]
    expect(
      getPairwiseBalance(reimbursements, currentUserId, friendUserId),
    ).toBe(0)
  })

  it('returns positive when friend owes current user (from=friend, to=currentUser)', () => {
    const reimbursements = [
      { from: friendUserId, to: currentUserId, amount: 1500 },
    ]
    expect(
      getPairwiseBalance(reimbursements, currentUserId, friendUserId),
    ).toBe(1500)
  })

  it('returns negative when current user owes friend (from=currentUser, to=friend)', () => {
    const reimbursements = [
      { from: currentUserId, to: friendUserId, amount: 800 },
    ]
    expect(
      getPairwiseBalance(reimbursements, currentUserId, friendUserId),
    ).toBe(-800)
  })

  it('nets multiple reimbursements between the same pair', () => {
    const reimbursements = [
      { from: friendUserId, to: currentUserId, amount: 2000 },
      { from: currentUserId, to: friendUserId, amount: 500 },
      { from: friendUserId, to: currentUserId, amount: 300 },
    ]
    // 2000 - 500 + 300 = 1800
    expect(
      getPairwiseBalance(reimbursements, currentUserId, friendUserId),
    ).toBe(1800)
  })

  it('ignores reimbursements between unrelated users', () => {
    const reimbursements = [
      { from: friendUserId, to: currentUserId, amount: 1000 },
      { from: 'user-3', to: 'user-4', amount: 9999 },
      { from: currentUserId, to: 'user-5', amount: 7777 },
      { from: 'user-6', to: friendUserId, amount: 5555 },
    ]
    expect(
      getPairwiseBalance(reimbursements, currentUserId, friendUserId),
    ).toBe(1000)
  })
})

describe('computeFriendBalance', () => {
  const currentUserId = 'user-1'
  const friendUserId = 'user-2'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns empty array when sharedGroups is empty', () => {
    const result = computeFriendBalance(currentUserId, friendUserId, [])
    expect(result).toEqual([])
  })

  it('correctly computes balance for a single group', () => {
    const mockExpenses = [
      {
        id: 'expense-1',
        amount: 3000,
        title: 'Dinner',
        expenseDate: new Date(),
        createdAt: new Date(),
        isReimbursement: false,
        splitMode: 'EVENLY' as const,
        recurrenceRule: null,
        notes: null,
        category: null,
        _count: { documents: 0 },
        paidBy: { id: currentUserId, name: 'Current User' },
        paidFor: [
          { user: { id: currentUserId, name: 'Current User' }, shares: 1 },
          { user: { id: friendUserId, name: 'Friend' }, shares: 1 },
        ],
      },
    ]

    mockedGetBalances.mockReturnValue({
      [currentUserId]: { paid: 3000, paidFor: 1500, total: 1500 },
      [friendUserId]: { paid: 0, paidFor: 1500, total: -1500 },
    })
    mockedGetReimbursements.mockReturnValue([
      { from: friendUserId, to: currentUserId, amount: 1500 },
    ])

    const sharedGroups = [
      {
        id: 'group-1',
        name: 'Trip',
        slug: 'trip',
        type: GroupType.STANDARD,
        currency: '€',
        currencyCode: 'EUR',
        simplifyDebts: true,
        expenses: mockExpenses,
      },
    ]

    const result = computeFriendBalance(
      currentUserId,
      friendUserId,
      sharedGroups,
    )

    expect(result).toHaveLength(1)
    expect(result[0].totalAmount).toBe(1500)
    expect(result[0].currency.code).toBe('EUR')
    expect(result[0].groups).toHaveLength(1)
    expect(result[0].groups[0].groupId).toBe('group-1')
    expect(result[0].groups[0].amount).toBe(1500)
  })

  it('separates amounts by currency (EUR and USD stay separate)', () => {
    const mockExpenses = [
      {
        id: 'expense-1',
        amount: 2000,
        title: 'Lunch',
        expenseDate: new Date(),
        createdAt: new Date(),
        isReimbursement: false,
        splitMode: 'EVENLY' as const,
        recurrenceRule: null,
        notes: null,
        category: null,
        _count: { documents: 0 },
        paidBy: { id: currentUserId, name: 'Current User' },
        paidFor: [
          { user: { id: currentUserId, name: 'Current User' }, shares: 1 },
          { user: { id: friendUserId, name: 'Friend' }, shares: 1 },
        ],
      },
    ]

    // First group (EUR): friend owes 1000
    mockedGetBalances
      .mockReturnValueOnce({
        [currentUserId]: { paid: 2000, paidFor: 1000, total: 1000 },
        [friendUserId]: { paid: 0, paidFor: 1000, total: -1000 },
      })
      // Second group (USD): friend owes 500
      .mockReturnValueOnce({
        [currentUserId]: { paid: 1000, paidFor: 500, total: 500 },
        [friendUserId]: { paid: 0, paidFor: 500, total: -500 },
      })

    mockedGetReimbursements
      .mockReturnValueOnce([
        { from: friendUserId, to: currentUserId, amount: 1000 },
      ])
      .mockReturnValueOnce([
        { from: friendUserId, to: currentUserId, amount: 500 },
      ])

    const sharedGroups = [
      {
        id: 'group-eur',
        name: 'Europe Trip',
        slug: 'europe-trip',
        type: GroupType.STANDARD,
        currency: '€',
        currencyCode: 'EUR',
        simplifyDebts: true,
        expenses: mockExpenses,
      },
      {
        id: 'group-usd',
        name: 'US Trip',
        slug: 'us-trip',
        type: GroupType.STANDARD,
        currency: '$',
        currencyCode: 'USD',
        simplifyDebts: true,
        expenses: mockExpenses,
      },
    ]

    const result = computeFriendBalance(
      currentUserId,
      friendUserId,
      sharedGroups,
    )

    expect(result).toHaveLength(2)

    const eurBalance = result.find((b) => b.currency.code === 'EUR')
    const usdBalance = result.find((b) => b.currency.code === 'USD')

    expect(eurBalance).toBeDefined()
    expect(eurBalance!.totalAmount).toBe(1000)
    expect(usdBalance).toBeDefined()
    expect(usdBalance!.totalAmount).toBe(500)
  })

  it('returns CurrencyBalance with totalAmount 0 if expenses exist but users are settled', () => {
    const mockExpenses = [
      {
        id: 'expense-1',
        amount: 1000,
        title: 'Coffee',
        expenseDate: new Date(),
        createdAt: new Date(),
        isReimbursement: false,
        splitMode: 'EVENLY' as const,
        recurrenceRule: null,
        notes: null,
        category: null,
        _count: { documents: 0 },
        paidBy: { id: currentUserId, name: 'Current User' },
        paidFor: [
          { user: { id: currentUserId, name: 'Current User' }, shares: 1 },
          { user: { id: friendUserId, name: 'Friend' }, shares: 1 },
        ],
      },
    ]

    mockedGetBalances.mockReturnValue({
      [currentUserId]: { paid: 1000, paidFor: 1000, total: 0 },
      [friendUserId]: { paid: 1000, paidFor: 1000, total: 0 },
    })
    mockedGetReimbursements.mockReturnValue([])

    const sharedGroups = [
      {
        id: 'group-1',
        name: 'Settled Group',
        slug: 'settled-group',
        type: GroupType.STANDARD,
        currency: '$',
        currencyCode: 'USD',
        simplifyDebts: true,
        expenses: mockExpenses,
      },
    ]

    const result = computeFriendBalance(
      currentUserId,
      friendUserId,
      sharedGroups,
    )

    expect(result).toHaveLength(1)
    expect(result[0].totalAmount).toBe(0)
  })
})

describe('computeFriendSettlements', () => {
  const currentUserId = 'user-1'
  const friendUserId = 'user-2'

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns pairwise debts between the two friends per group', () => {
    mockedGetBalances.mockReturnValue({})
    mockedGetReimbursements
      .mockReturnValueOnce([
        { from: friendUserId, to: currentUserId, amount: 5000 },
      ])
      .mockReturnValueOnce([
        { from: currentUserId, to: friendUserId, amount: 8000 },
      ])

    const sharedGroups = [
      {
        id: 'group-dyad',
        name: 'Alice',
        slug: 'alice',
        type: GroupType.DYAD,
        currency: '€',
        currencyCode: 'EUR',
        simplifyDebts: true,
        expenses: [],
      },
      {
        id: 'group-demo',
        name: 'Demo group',
        slug: 'demo-group',
        type: GroupType.STANDARD,
        currency: '€',
        currencyCode: 'EUR',
        simplifyDebts: true,
        expenses: [],
      },
    ]

    const result = computeFriendSettlements(
      currentUserId,
      friendUserId,
      sharedGroups,
    )

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({
      groupId: 'group-dyad',
      from: friendUserId,
      to: currentUserId,
      amount: 5000,
    })
    expect(result[1]).toMatchObject({
      groupId: 'group-demo',
      from: currentUserId,
      to: friendUserId,
      amount: 8000,
    })
  })

  it('skips groups without debt between the two friends', () => {
    mockedGetBalances.mockReturnValue({})
    mockedGetReimbursements.mockReturnValue([])

    const result = computeFriendSettlements(currentUserId, friendUserId, [
      {
        id: 'group-1',
        name: 'Settled',
        slug: 'settled',
        type: GroupType.STANDARD,
        currency: '€',
        currencyCode: 'EUR',
        simplifyDebts: true,
        expenses: [],
      },
    ])

    expect(result).toEqual([])
  })
})

describe('sortFriendBalances', () => {
  const makeSummary = (
    name: string,
    totalAmount: number,
  ): FriendBalanceSummary => ({
    friendId: `friend-${name}`,
    friendUserId: `user-${name}`,
    name,
    dyadGroupId: null,
    balances:
      totalAmount === 0
        ? []
        : [
            {
              currency: {
                name: 'Euro',
                symbol_native: '€',
                symbol: '€',
                code: 'EUR',
                name_plural: 'euros',
                rounding: 0,
                decimal_digits: 2,
              },
              totalAmount,
              groups: [],
            },
          ],
  })

  it('friends with non-zero balances come before friends with zero', () => {
    const items = [
      makeSummary('Alice', 0),
      makeSummary('Bob', 1500),
      makeSummary('Charlie', 0),
    ]

    const sorted = sortFriendBalances(items)
    expect(sorted[0].name).toBe('Bob')
    expect(sorted[1].name).toBe('Alice')
    expect(sorted[2].name).toBe('Charlie')
  })

  it('within non-zero, sorted by largest absolute amount', () => {
    const items = [
      makeSummary('Alice', 500),
      makeSummary('Bob', -2000),
      makeSummary('Charlie', 1000),
    ]

    const sorted = sortFriendBalances(items)
    expect(sorted[0].name).toBe('Bob') // abs 2000
    expect(sorted[1].name).toBe('Charlie') // abs 1000
    expect(sorted[2].name).toBe('Alice') // abs 500
  })

  it('within zero, sorted alphabetically by name', () => {
    const items = [
      makeSummary('Charlie', 0),
      makeSummary('Alice', 0),
      makeSummary('Bob', 0),
    ]

    const sorted = sortFriendBalances(items)
    expect(sorted[0].name).toBe('Alice')
    expect(sorted[1].name).toBe('Bob')
    expect(sorted[2].name).toBe('Charlie')
  })
})
