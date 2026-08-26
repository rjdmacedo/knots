import { prisma } from '@/lib/prisma'
import { friendsRouter } from '../index'

jest.mock('nanoid', () => ({
  nanoid: () => 'mocked-nanoid',
}))

jest.mock('@/lib/api', () => {
  const actual = jest.requireActual('@/lib/api')
  return {
    ...actual,
    randomId: () => 'mocked-random-id',
    logActivity: jest.fn(),
  }
})

jest.mock('@/lib/push/notify-on-activity', () => ({
  notifyOnActivity: jest.fn(),
}))

jest.mock('@/lib/friends', () => {
  const actual = jest.requireActual('@/lib/friends')
  return {
    ...actual,
    upsertFriendByEmail: jest.fn().mockResolvedValue(undefined),
  }
})

jest.mock('@/lib/prisma', () => ({
  prisma: {
    friend: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    group: {
      findUnique: jest.fn(),
    },
    groupMembership: {
      findMany: jest.fn(),
    },
    expense: {
      create: jest.fn(),
    },
    expenseCategoryMapping: {
      upsert: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

jest.mock('@/trpc/init', () => {
  const { initTRPC } = require('@trpc/server')
  const t = initTRPC.context().create()
  return {
    createTRPCRouter: t.router,
    baseProcedure: t.procedure,
    protectedProcedure: t.procedure.use(async ({ ctx, next }: any) => {
      return next({
        ctx: {
          ...ctx,
          user: { id: 'current-user-id', email: 'me@example.com', name: 'Me' },
        },
      })
    }),
  }
})

// Mock superjson
jest.mock('superjson', () => ({
  __esModule: true,
  default: {
    serialize: (v: unknown) => ({ json: v, meta: undefined }),
    deserialize: (v: { json: unknown }) => v.json,
    registerCustom: jest.fn(),
  },
}))

const mockFriendFindUnique = prisma.friend.findUnique as jest.Mock
const mockFriendUpdate = prisma.friend.update as jest.Mock
const mockUserFindUnique = prisma.user.findUnique as jest.Mock
const mockUserCreate = prisma.user.create as jest.Mock
const mockGroupFindUnique = prisma.group.findUnique as jest.Mock
const mockGroupMembershipFindMany = prisma.groupMembership.findMany as jest.Mock
const mockExpenseCreate = prisma.expense.create as jest.Mock
const mockTransaction = prisma.$transaction as jest.Mock
const mockTxExpenseCreate = jest.fn()
const mockTxActivityCreate = jest.fn()

describe('createGlobalExpense procedure', () => {
  beforeEach(() => {
    jest.clearAllMocks()

    mockTxExpenseCreate.mockImplementation(
      async (args: { data: { id: string; groupId: string | null } }) => ({
        ...args.data,
      }),
    )
    mockTxActivityCreate.mockResolvedValue({})
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
      cb({
        expense: { create: mockTxExpenseCreate },
        activity: { create: mockTxActivityCreate },
      }),
    )
  })

  it('decomposes hybrid expenses into Group_Half + Direct_Half (Model A)', async () => {
    // Current user id: 'current-user-id'
    // Friend Alice: friendId = 'friend-id-alice', friendUserId = 'friend-user-alice'
    // Friend Bob (direct): friendId = 'friend-id-bob', friendUserId = 'friend-user-bob'
    // Group members: 'current-user-id', 'friend-user-alice'

    mockFriendFindUnique.mockImplementation(
      ({ where }: { where: { id: string } }) => {
        if (where.id === 'friend-id-alice') {
          return Promise.resolve({
            id: 'friend-id-alice',
            friendUserId: 'friend-user-alice',
            email: 'alice@example.com',
          })
        }
        if (where.id === 'friend-id-bob') {
          return Promise.resolve({
            id: 'friend-id-bob',
            friendUserId: 'friend-user-bob',
            email: 'bob@example.com',
          })
        }
        return Promise.resolve(null)
      },
    )

    mockGroupFindUnique.mockResolvedValue({
      id: 'group-1',
      currency: '€',
      currencyCode: 'EUR',
    })

    mockGroupMembershipFindMany.mockResolvedValue([
      { userId: 'current-user-id' },
      { userId: 'friend-user-alice' },
    ])

    mockUserFindUnique.mockResolvedValue({
      email: 'bob@example.com',
      name: 'Bob',
    })

    const caller = friendsRouter.createCaller({} as any)

    const result = await caller.createGlobalExpense({
      title: 'Pizza Dinner',
      amount: 30, // 30.00 EUR -> 3000 cents
      currency: 'EUR',
      paidById: 'current-user-id',
      groupId: 'group-1',
      friendIds: ['friend-id-alice', 'friend-id-bob'],
      splitMode: 'EVENLY',
      documents: [],
    })

    // Decomposition envelope — not the legacy { success, expenseIds } shape
    expect(result).toEqual(
      expect.objectContaining({
        groupHalf: expect.objectContaining({ groupId: 'group-1' }),
        directHalves: [
          expect.objectContaining({
            nonMemberId: 'friend-user-bob',
            amount: 1000,
          }),
        ],
      }),
    )
    expect(result).not.toHaveProperty('success')

    // Total participants: current-user, Alice, Bob → 3000 / 3 = 1000 each.
    // Group_Half: members only (2000). Direct_Half: Bob's share (1000), Model A.
    expect(mockTxExpenseCreate).toHaveBeenCalledTimes(2)

    expect(mockTxExpenseCreate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          groupId: 'group-1',
          amount: 2000,
          splitMode: 'BY_AMOUNT',
          creationMethod: 'NON_MEMBER_SPLIT',
          linkedExpenseId: null,
          originalTotalAtDecomposition: 3000,
          paidFor: {
            createMany: {
              data: expect.arrayContaining([
                { userId: 'current-user-id', shares: 1000 },
                { userId: 'friend-user-alice', shares: 1000 },
              ]),
            },
          },
        }),
      }),
    )

    expect(mockTxExpenseCreate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          groupId: null,
          amount: 1000,
          splitMode: 'BY_AMOUNT',
          creationMethod: 'NON_MEMBER_SPLIT',
          linkedExpenseId: 'mocked-nanoid',
          expenseCurrencyCode: 'EUR',
          paidFor: {
            createMany: {
              data: [{ userId: 'friend-user-bob', shares: 1000 }],
            },
          },
        }),
      }),
    )

    // Legacy prisma.expense.create path must not run after a successful decompose
    expect(mockExpenseCreate).not.toHaveBeenCalled()
  })

  it('creates a soft user account if a selected friend does not have one', async () => {
    // Friend Carol is email-only and does not have an account.
    // We expect a user account to be fetched (not found), then created, friend updated, and expense created.
    mockFriendFindUnique.mockResolvedValue({
      id: 'friend-id-carol',
      name: 'Carol Contact',
      email: 'carol@example.com',
      friendUserId: null,
    })

    mockUserFindUnique.mockResolvedValue(null)
    mockUserCreate.mockResolvedValue({
      id: 'new-user-carol',
      email: 'carol@example.com',
    })

    const caller = friendsRouter.createCaller({} as any)

    await caller.createGlobalExpense({
      title: 'Coffee',
      amount: 10, // 1000 cents
      currency: 'EUR',
      paidById: 'current-user-id',
      groupId: null,
      friendIds: ['friend-id-carol'],
      splitMode: 'EVENLY',
    })

    // Assert user created
    expect(mockUserCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'carol@example.com',
          name: 'Carol Contact',
        }),
      }),
    )

    // Assert friend link updated
    expect(mockFriendUpdate).toHaveBeenCalledWith({
      where: { id: 'friend-id-carol' },
      data: { friendUserId: 'new-user-carol' },
    })

    // Assert direct expense created withCarol's new user id
    expect(mockExpenseCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          groupId: null,
          amount: 1000,
          paidFor: {
            createMany: {
              data: expect.arrayContaining([
                { userId: 'current-user-id', shares: 1 },
                { userId: 'new-user-carol', shares: 1 },
              ]),
            },
          },
        }),
      }),
    )
  })

  it('handles remainder penny distribution in odd divisions', async () => {
    mockFriendFindUnique.mockImplementation(
      ({ where }: { where: { id: string } }) => {
        if (where.id === 'friend-id-alice') {
          return Promise.resolve({
            id: 'friend-id-alice',
            friendUserId: 'friend-user-alice',
            email: 'alice@example.com',
          })
        }
        if (where.id === 'friend-id-bob') {
          return Promise.resolve({
            id: 'friend-id-bob',
            friendUserId: 'friend-user-bob',
            email: 'bob@example.com',
          })
        }
        return Promise.resolve(null)
      },
    )

    const caller = friendsRouter.createCaller({} as any)

    // 1000 cents (10.00 EUR) split 3 ways
    // 1000 % 3 = 1 penny remainder.
    // Expected splits: 334, 333, 333
    await caller.createGlobalExpense({
      title: 'Tapas',
      amount: 10,
      currency: 'EUR',
      paidById: 'current-user-id',
      groupId: null,
      friendIds: ['friend-id-alice', 'friend-id-bob'],
      splitMode: 'EVENLY',
    })

    // Should create direct expenses for Alice and Bob
    // Let's check how the amount is split. The sharesMap inside should have:
    // User 1: 334
    // User 2: 333
    // User 3: 333
    // Sum = 1000
    // Direct expense for Alice: sharesMap.get('friend-user-alice') * 2
    // Direct expense for Bob: sharesMap.get('friend-user-bob') * 2

    // Let's verify the call arguments for the created expenses.
    // The first direct expense (Alice or Bob depending on iteration order)
    const calls = mockExpenseCreate.mock.calls
    expect(calls).toHaveLength(2)

    const amounts = calls.map((c) => c[0].data.amount)
    // The payer (current user) got the 1 remainder penny (334 cents share).
    // Alice and Bob both get 333 cents shares, resulting in 333 * 2 = 666 cents direct expenses.
    expect(amounts).toEqual([666, 666])
  })
})
