import {
  buildDyadKey,
  findOrCreateDyadGroup,
  resolveDyadCurrencyCode,
  syncDyadGroupCurrency,
} from '@/lib/dyad-groups'
import { prisma } from '@/lib/prisma'
import { GroupType } from '@prisma/client'
import { TRPCError } from '@trpc/server'

jest.mock('nanoid', () => ({
  nanoid: () => 'mock-group-id',
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
    },
    friend: {
      findFirst: jest.fn(),
    },
    group: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    groupMembership: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

const mockUserFindMany = prisma.user.findMany as jest.Mock
const mockFriendFindFirst = prisma.friend.findFirst as jest.Mock
const mockGroupFindUnique = prisma.group.findUnique as jest.Mock
const mockGroupUpdate = prisma.group.update as jest.Mock
const mockGroupMembershipFindUnique = prisma.groupMembership
  .findUnique as jest.Mock
const mockTransaction = prisma.$transaction as jest.Mock

beforeEach(() => {
  jest.clearAllMocks()
})

describe('buildDyadKey', () => {
  it('returns the same key regardless of user order', () => {
    expect(buildDyadKey('user-b', 'user-a')).toBe('user-a:user-b')
    expect(buildDyadKey('user-a', 'user-b')).toBe('user-a:user-b')
  })
})

describe('resolveDyadCurrencyCode', () => {
  it('uses the shared preference when both members prefer the same currency', async () => {
    mockUserFindMany.mockResolvedValue([
      { preferredCurrency: 'EUR' },
      { preferredCurrency: 'EUR' },
    ])

    await expect(resolveDyadCurrencyCode('user-1', 'user-2')).resolves.toBe(
      'EUR',
    )
  })

  it('uses the only configured preference when one member has none', async () => {
    mockUserFindMany.mockResolvedValue([
      { preferredCurrency: 'EUR' },
      { preferredCurrency: null },
    ])

    await expect(resolveDyadCurrencyCode('user-1', 'user-2')).resolves.toBe(
      'EUR',
    )
  })

  it('falls back to the default when preferences conflict', async () => {
    mockUserFindMany.mockResolvedValue([
      { preferredCurrency: 'EUR' },
      { preferredCurrency: 'USD' },
    ])

    await expect(resolveDyadCurrencyCode('user-1', 'user-2')).resolves.toBe(
      process.env.NEXT_PUBLIC_DEFAULT_CURRENCY_CODE || 'USD',
    )
  })
})

describe('syncDyadGroupCurrency', () => {
  it('updates dyad currency when both members agree and there are no expenses', async () => {
    mockGroupFindUnique.mockResolvedValue({
      type: GroupType.DYAD,
      currencyCode: 'USD',
      memberships: [{ userId: 'user-1' }, { userId: 'user-2' }],
      _count: { expenses: 0 },
    })
    mockUserFindMany.mockResolvedValue([
      { preferredCurrency: 'EUR' },
      { preferredCurrency: 'EUR' },
    ])
    mockGroupUpdate.mockResolvedValue({})

    await expect(syncDyadGroupCurrency('group-dyad')).resolves.toBe(true)
    expect(mockGroupUpdate).toHaveBeenCalledWith({
      where: { id: 'group-dyad' },
      data: {
        currency: '€',
        currencyCode: 'EUR',
      },
    })
  })

  it('does not update dyad currency when the group already has expenses', async () => {
    mockGroupFindUnique.mockResolvedValue({
      type: GroupType.DYAD,
      currencyCode: 'USD',
      memberships: [{ userId: 'user-1' }, { userId: 'user-2' }],
      _count: { expenses: 2 },
    })

    await expect(syncDyadGroupCurrency('group-dyad')).resolves.toBe(false)
    expect(mockGroupUpdate).not.toHaveBeenCalled()
  })
})

describe('findOrCreateDyadGroup', () => {
  const currentUserId = 'user-1'
  const friendUserId = 'user-2'
  const friendName = 'Alex'

  function mockFriendOnList() {
    mockFriendFindFirst.mockResolvedValue({ id: 'friend-1' })
  }

  it('returns an existing dyad group without creating a new one', async () => {
    mockFriendOnList()
    mockGroupFindUnique
      .mockResolvedValueOnce({ id: 'group-dyad' })
      .mockResolvedValueOnce({
        type: GroupType.DYAD,
        currencyCode: 'EUR',
        memberships: [{ userId: currentUserId }, { userId: friendUserId }],
        _count: { expenses: 0 },
      })
    mockGroupMembershipFindUnique.mockResolvedValue({ userId: currentUserId })
    mockUserFindMany.mockResolvedValue([
      { preferredCurrency: 'EUR' },
      { preferredCurrency: 'EUR' },
    ])

    const result = await findOrCreateDyadGroup(
      currentUserId,
      friendUserId,
      friendName,
    )

    expect(result).toEqual({ groupId: 'group-dyad', created: false })
    expect(mockTransaction).not.toHaveBeenCalled()
  })

  it('creates a dyad group with both members when none exists', async () => {
    mockFriendFindFirst.mockResolvedValue({ id: 'friend-1' })
    mockUserFindMany.mockResolvedValue([
      { preferredCurrency: 'EUR' },
      { preferredCurrency: 'EUR' },
    ])
    mockGroupFindUnique.mockResolvedValue(null)
    mockTransaction.mockResolvedValue([])

    const result = await findOrCreateDyadGroup(
      currentUserId,
      friendUserId,
      friendName,
    )

    expect(result.created).toBe(true)
    expect(result.groupId).toBe('mock-group-id')
    expect(mockTransaction).toHaveBeenCalledTimes(1)
    expect(mockTransaction.mock.calls[0][0]).toHaveLength(3)
  })

  it('rejects expense groups with yourself', async () => {
    await expect(
      findOrCreateDyadGroup(currentUserId, currentUserId, friendName),
    ).rejects.toThrow(TRPCError)
  })

  it('rejects when friend is not on the user list', async () => {
    mockFriendFindFirst.mockResolvedValue(null)

    await expect(
      findOrCreateDyadGroup(currentUserId, friendUserId, friendName),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })
})
