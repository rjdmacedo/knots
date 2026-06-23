import { buildDyadKey, findOrCreateDyadGroup } from '@/lib/dyad-groups'
import { prisma } from '@/lib/prisma'
import { TRPCError } from '@trpc/server'

jest.mock('nanoid', () => ({
  nanoid: () => 'mock-group-id',
}))

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    friend: {
      findFirst: jest.fn(),
    },
    group: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    groupMembership: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}))

const mockUserFindUnique = prisma.user.findUnique as jest.Mock
const mockFriendFindFirst = prisma.friend.findFirst as jest.Mock
const mockGroupFindUnique = prisma.group.findUnique as jest.Mock
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

describe('findOrCreateDyadGroup', () => {
  const currentUserId = 'user-1'
  const friendUserId = 'user-2'
  const friendName = 'Alex'

  function mockFriendOnList() {
    mockFriendFindFirst.mockResolvedValue({ id: 'friend-1' })
  }

  it('returns an existing dyad group without creating a new one', async () => {
    mockFriendOnList()
    mockGroupFindUnique.mockResolvedValue({ id: 'group-dyad' })
    mockGroupMembershipFindUnique.mockResolvedValue({ userId: currentUserId })

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
    mockUserFindUnique.mockResolvedValue({ preferredCurrency: 'EUR' })
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
