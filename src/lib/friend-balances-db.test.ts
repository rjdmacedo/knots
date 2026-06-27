import { getSharedGroupsForUsers } from '@/lib/friend-balances-db'
import { prisma } from '@/lib/prisma'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    groupMembership: {
      findMany: jest.fn(),
    },
  },
}))

const mockFindMany = prisma.groupMembership.findMany as jest.Mock

const userId = 'user-1'
const friendUserId = 'user-2'

const standardGroup = {
  id: 'group-1',
  name: 'Trip',
  currency: '€',
  currencyCode: 'EUR',
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('getSharedGroupsForUsers', () => {
  it('returns groups where both users are active members', async () => {
    mockFindMany.mockResolvedValue([
      {
        groupId: 'group-1',
        userId: 'user-1',
        group: standardGroup,
      },
      {
        groupId: 'group-1',
        userId: 'user-2',
        group: standardGroup,
      },
    ])

    const result = await getSharedGroupsForUsers(userId, friendUserId)

    expect(result).toEqual([standardGroup])
    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        userId: { in: [userId, friendUserId] },
        archivedAt: null,
      },
      select: {
        groupId: true,
        userId: true,
        group: {
          select: {
            id: true,
            name: true,
            currency: true,
            currencyCode: true,
            simplifyDebts: true,
          },
        },
      },
    })
  })

  it('excludes groups where only one user is a member', async () => {
    mockFindMany.mockResolvedValue([
      {
        groupId: 'group-1',
        userId: 'user-1',
        group: {
          id: 'group-1',
          name: 'Solo group',
          currency: '$',
          currencyCode: 'USD',
        },
      },
    ])

    const result = await getSharedGroupsForUsers(userId, friendUserId)

    expect(result).toEqual([])
  })

  it('returns empty array when no memberships exist', async () => {
    mockFindMany.mockResolvedValue([])

    const result = await getSharedGroupsForUsers(userId, friendUserId)

    expect(result).toEqual([])
  })

  it('handles multiple shared groups', async () => {
    mockFindMany.mockResolvedValue([
      {
        groupId: 'group-1',
        userId: 'user-1',
        group: standardGroup,
      },
      {
        groupId: 'group-1',
        userId: 'user-2',
        group: standardGroup,
      },
      {
        groupId: 'group-2',
        userId: 'user-1',
        group: {
          id: 'group-2',
          name: 'Flat',
          currency: '$',
          currencyCode: 'USD',
        },
      },
      {
        groupId: 'group-2',
        userId: 'user-2',
        group: {
          id: 'group-2',
          name: 'Flat',
          currency: '$',
          currencyCode: 'USD',
        },
      },
      {
        groupId: 'group-3',
        userId: 'user-1',
        group: {
          id: 'group-3',
          name: 'Private',
          currency: '£',
          currencyCode: 'GBP',
        },
      },
    ])

    const result = await getSharedGroupsForUsers(userId, friendUserId)

    expect(result).toHaveLength(2)
    expect(result).toContainEqual(standardGroup)
    expect(result).toContainEqual({
      id: 'group-2',
      name: 'Flat',
      currency: '$',
      currencyCode: 'USD',
    })
  })

  it('handles groups with null currencyCode', async () => {
    mockFindMany.mockResolvedValue([
      {
        groupId: 'group-1',
        userId: 'user-1',
        group: {
          id: 'group-1',
          name: 'Old Group',
          currency: '$',
          currencyCode: null,
        },
      },
      {
        groupId: 'group-1',
        userId: 'user-2',
        group: {
          id: 'group-1',
          name: 'Old Group',
          currency: '$',
          currencyCode: null,
        },
      },
    ])

    const result = await getSharedGroupsForUsers(userId, friendUserId)

    expect(result).toEqual([
      {
        id: 'group-1',
        name: 'Old Group',
        currency: '$',
        currencyCode: null,
      },
    ])
  })
})
