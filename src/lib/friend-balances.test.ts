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

  const eurCurrency = {
    name: 'Euro',
    symbol_native: '€',
    symbol: '€',
    code: 'EUR',
    name_plural: 'euros',
    rounding: 0,
    decimal_digits: 2,
  }

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
        currency: '€',
        currencyCode: 'EUR',
        simplifyDebts: true,
        expenses: mockExpenses,
      },
      {
        id: 'group-usd',
        name: 'US Trip',
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

  describe('direct expenses (groupId = null)', () => {
    it('a direct expense shows up in the "direct" bucket', () => {
      const directMockExpenses = [
        {
          id: 'direct-expense-1',
          amount: 2000,
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

      // Direct expenses use getReimbursements with simplifyDebts: false
      mockedGetReimbursements.mockReturnValue([
        { from: friendUserId, to: currentUserId, amount: 1000 },
      ])

      const result = computeFriendBalance(
        currentUserId,
        friendUserId,
        [], // no shared groups
        [{ currency: eurCurrency, expenses: directMockExpenses }],
      )

      expect(result).toHaveLength(1)
      expect(result[0].currency.code).toBe('EUR')
      expect(result[0].totalAmount).toBe(1000)
      expect(result[0].groups).toHaveLength(1)
      expect(result[0].groups[0].groupId).toBeNull()
      expect(result[0].groups[0].groupName).toBeNull()
      expect(result[0].groups[0].amount).toBe(1000)
    })

    it('a direct payment (isReimbursement = true) reduces the direct bucket balance', () => {
      const directMockExpenses = [
        {
          id: 'direct-expense-1',
          amount: 2000,
          title: 'Lunch',
          expenseDate: new Date('2024-01-01'),
          createdAt: new Date('2024-01-01'),
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
        {
          id: 'direct-payment-1',
          amount: 500,
          title: 'Payment',
          expenseDate: new Date('2024-01-02'),
          createdAt: new Date('2024-01-02'),
          isReimbursement: true,
          splitMode: 'EVENLY' as const,
          recurrenceRule: null,
          notes: null,
          category: null,
          _count: { documents: 0 },
          paidBy: { id: friendUserId, name: 'Friend' },
          paidFor: [
            { user: { id: currentUserId, name: 'Current User' }, shares: 1 },
          ],
        },
      ]

      // After the expense (1000 owed) minus payment (500 paid back), net = 500
      mockedGetReimbursements.mockReturnValue([
        { from: friendUserId, to: currentUserId, amount: 500 },
      ])

      const result = computeFriendBalance(
        currentUserId,
        friendUserId,
        [],
        [{ currency: eurCurrency, expenses: directMockExpenses }],
      )

      expect(result).toHaveLength(1)
      expect(result[0].totalAmount).toBe(500)
      expect(result[0].groups[0].groupId).toBeNull()
      expect(result[0].groups[0].amount).toBe(500)
    })

    it('multiple direct expenses accumulate correctly in the direct bucket', () => {
      const directMockExpenses = [
        {
          id: 'direct-expense-1',
          amount: 2000,
          title: 'Lunch',
          expenseDate: new Date('2024-01-01'),
          createdAt: new Date('2024-01-01'),
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
        {
          id: 'direct-expense-2',
          amount: 1000,
          title: 'Coffee',
          expenseDate: new Date('2024-01-02'),
          createdAt: new Date('2024-01-02'),
          isReimbursement: false,
          splitMode: 'EVENLY' as const,
          recurrenceRule: null,
          notes: null,
          category: null,
          _count: { documents: 0 },
          paidBy: { id: friendUserId, name: 'Friend' },
          paidFor: [
            { user: { id: currentUserId, name: 'Current User' }, shares: 1 },
            { user: { id: friendUserId, name: 'Friend' }, shares: 1 },
          ],
        },
      ]

      // Expense 1: friend owes 1000 to current user
      // Expense 2: current user owes 500 to friend
      // Net: friend owes 500
      mockedGetReimbursements.mockReturnValue([
        { from: friendUserId, to: currentUserId, amount: 500 },
      ])

      const result = computeFriendBalance(
        currentUserId,
        friendUserId,
        [],
        [{ currency: eurCurrency, expenses: directMockExpenses }],
      )

      expect(result).toHaveLength(1)
      expect(result[0].totalAmount).toBe(500)
      expect(result[0].groups).toHaveLength(1)
      expect(result[0].groups[0].groupId).toBeNull()
      expect(result[0].groups[0].amount).toBe(500)
    })

    it('direct balance is independent of group balances', () => {
      const groupMockExpenses = [
        {
          id: 'group-expense-1',
          amount: 4000,
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

      const directMockExpenses = [
        {
          id: 'direct-expense-1',
          amount: 1000,
          title: 'Taxi',
          expenseDate: new Date(),
          createdAt: new Date(),
          isReimbursement: false,
          splitMode: 'EVENLY' as const,
          recurrenceRule: null,
          notes: null,
          category: null,
          _count: { documents: 0 },
          paidBy: { id: friendUserId, name: 'Friend' },
          paidFor: [
            { user: { id: currentUserId, name: 'Current User' }, shares: 1 },
            { user: { id: friendUserId, name: 'Friend' }, shares: 1 },
          ],
        },
      ]

      // Group: friend owes current user 2000
      mockedGetReimbursements
        .mockReturnValueOnce([
          { from: friendUserId, to: currentUserId, amount: 2000 },
        ])
        // Direct: current user owes friend 500
        .mockReturnValueOnce([
          { from: currentUserId, to: friendUserId, amount: 500 },
        ])

      mockedGetBalances.mockReturnValue({})

      const sharedGroups = [
        {
          id: 'group-1',
          name: 'House',
          currency: '€',
          currencyCode: 'EUR',
          simplifyDebts: true,
          expenses: groupMockExpenses,
        },
      ]

      const result = computeFriendBalance(
        currentUserId,
        friendUserId,
        sharedGroups,
        [{ currency: eurCurrency, expenses: directMockExpenses }],
      )

      expect(result).toHaveLength(1)
      // Total: 2000 (group) + (-500) (direct) = 1500
      expect(result[0].totalAmount).toBe(1500)
      expect(result[0].groups).toHaveLength(2)

      // Group bucket
      const groupBucket = result[0].groups.find((g) => g.groupId === 'group-1')
      expect(groupBucket).toBeDefined()
      expect(groupBucket!.amount).toBe(2000)
      expect(groupBucket!.groupName).toBe('House')

      // Direct bucket
      const directBucket = result[0].groups.find((g) => g.groupId === null)
      expect(directBucket).toBeDefined()
      expect(directBucket!.amount).toBe(-500)
      expect(directBucket!.groupName).toBeNull()
    })

    it('total friend balance includes both group and direct buckets', () => {
      const groupMockExpenses = [
        {
          id: 'group-expense-1',
          amount: 6000,
          title: 'Hotel',
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

      const directMockExpenses = [
        {
          id: 'direct-expense-1',
          amount: 2000,
          title: 'Gift',
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

      // Group: friend owes 3000
      mockedGetReimbursements
        .mockReturnValueOnce([
          { from: friendUserId, to: currentUserId, amount: 3000 },
        ])
        // Direct: friend owes 1000
        .mockReturnValueOnce([
          { from: friendUserId, to: currentUserId, amount: 1000 },
        ])

      mockedGetBalances.mockReturnValue({})

      const sharedGroups = [
        {
          id: 'group-1',
          name: 'Trip',
          currency: '€',
          currencyCode: 'EUR',
          simplifyDebts: true,
          expenses: groupMockExpenses,
        },
      ]

      const result = computeFriendBalance(
        currentUserId,
        friendUserId,
        sharedGroups,
        [{ currency: eurCurrency, expenses: directMockExpenses }],
      )

      expect(result).toHaveLength(1)
      // Total = group (3000) + direct (1000) = 4000
      expect(result[0].totalAmount).toBe(4000)
      expect(result[0].groups).toHaveLength(2)

      const groupBucket = result[0].groups.find((g) => g.groupId === 'group-1')
      expect(groupBucket!.amount).toBe(3000)

      const directBucket = result[0].groups.find((g) => g.groupId === null)
      expect(directBucket!.amount).toBe(1000)
    })

    it('does not add a direct bucket when directExpenses is undefined', () => {
      mockedGetBalances.mockReturnValue({})
      mockedGetReimbursements.mockReturnValue([
        { from: friendUserId, to: currentUserId, amount: 1000 },
      ])

      const sharedGroups = [
        {
          id: 'group-1',
          name: 'House',
          currency: '€',
          currencyCode: 'EUR',
          simplifyDebts: true,
          expenses: [],
        },
      ]

      const result = computeFriendBalance(
        currentUserId,
        friendUserId,
        sharedGroups,
        undefined,
      )

      expect(result).toHaveLength(1)
      expect(result[0].groups).toHaveLength(1)
      expect(result[0].groups[0].groupId).toBe('group-1')
    })

    it('does not add a direct bucket when directExpenses array is empty', () => {
      const result = computeFriendBalance(
        currentUserId,
        friendUserId,
        [],
        [{ currency: eurCurrency, expenses: [] }],
      )

      expect(result).toEqual([])
    })
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
        id: 'group-direct',
        name: 'Alice',
        currency: '€',
        currencyCode: 'EUR',
        simplifyDebts: true,
        expenses: [],
      },
      {
        id: 'group-demo',
        name: 'Demo group',
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
      groupId: 'group-direct',
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
