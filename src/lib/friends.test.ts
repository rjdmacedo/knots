import { emailService } from '@/lib/auth/email-service'
import {
  addFriendByEmail,
  findFriendByEmail,
  listFriends,
  removeFriend,
} from '@/lib/friends'
import { prisma } from '@/lib/prisma'
import { TRPCError } from '@trpc/server'

jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: jest.fn() },
    blockedUser: { findUnique: jest.fn() },
    friend: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
  },
}))

jest.mock('@/lib/auth/email-service', () => ({
  emailService: {
    sendFriendInviteEmail: jest.fn().mockResolvedValue({ ok: true }),
  },
}))

const mockUserFindUnique = prisma.user.findUnique as jest.Mock
const mockBlockedUserFindUnique = prisma.blockedUser.findUnique as jest.Mock
const mockFriendFindUnique = prisma.friend.findUnique as jest.Mock
const mockFriendFindMany = prisma.friend.findMany as jest.Mock
const mockFriendUpsert = prisma.friend.upsert as jest.Mock
const mockFriendDelete = prisma.friend.delete as jest.Mock
const mockSendFriendInviteEmail =
  emailService.sendFriendInviteEmail as jest.Mock

const ownerId = 'owner-1'
const ownerEmail = 'owner@example.com'

function mockOwner() {
  mockUserFindUnique.mockImplementation(
    ({ where }: { where: { id?: string; email?: string } }) => {
      if (where.id === ownerId) {
        return Promise.resolve({ email: ownerEmail, name: 'Owner' })
      }
      if (where.email === 'friend@example.com') {
        return Promise.resolve({ id: 'friend-user-1' })
      }
      return Promise.resolve(null)
    },
  )
}

function mockFriendRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: 'friend-1',
    email: 'friend@example.com',
    friendUserId: 'friend-user-1',
    name: null,
    friend: { name: 'Friend User' },
    ...overrides,
  }
}

describe('friends', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFriendFindMany.mockResolvedValue([])
    mockBlockedUserFindUnique.mockResolvedValue(null)
  })

  describe('addFriendByEmail', () => {
    it('links friendUserId when a Knots account exists', async () => {
      mockOwner()
      mockFriendFindUnique.mockResolvedValue(null)
      mockFriendUpsert.mockResolvedValue(mockFriendRecord())

      const result = await addFriendByEmail({
        userId: ownerId,
        email: 'Friend@Example.com',
      })

      expect(mockFriendUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            email: 'friend@example.com',
            friendUserId: 'friend-user-1',
          }),
        }),
      )
      expect(result.email).toBe('friend@example.com')
      expect(result.friendUserId).toBe('friend-user-1')
      expect(result.hasAccount).toBe(true)
      expect(result.name).toBe('Friend User')
      expect(mockSendFriendInviteEmail).toHaveBeenCalled()
    })

    it('keeps friendUserId null for email-only contacts', async () => {
      mockUserFindUnique.mockImplementation(
        ({ where }: { where: { id?: string; email?: string } }) => {
          if (where.id === ownerId) {
            return Promise.resolve({ email: ownerEmail, name: 'Owner' })
          }
          return Promise.resolve(null)
        },
      )
      mockFriendFindUnique.mockResolvedValue(null)
      mockFriendUpsert.mockResolvedValue(
        mockFriendRecord({
          friendUserId: null,
          friend: null,
          email: 'new@example.com',
        }),
      )

      const result = await addFriendByEmail({
        userId: ownerId,
        email: 'new@example.com',
      })

      expect(result.hasAccount).toBe(false)
      expect(result.friendUserId).toBeNull()
      expect(result.name).toBe('new')
    })

    it('rejects adding your own email', async () => {
      mockUserFindUnique.mockResolvedValue({
        email: ownerEmail,
        name: 'Owner',
      })

      await expect(
        addFriendByEmail({ userId: ownerId, email: ownerEmail }),
      ).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'You cannot add yourself as a friend.',
      } satisfies Partial<TRPCError>)
    })

    it('does not send invite email when the friend already exists', async () => {
      mockOwner()
      mockFriendFindUnique.mockResolvedValue({ id: 'friend-1' })
      mockFriendUpsert.mockResolvedValue(mockFriendRecord())

      await addFriendByEmail({
        userId: ownerId,
        email: 'friend@example.com',
      })

      expect(mockSendFriendInviteEmail).not.toHaveBeenCalled()
    })
  })

  describe('listFriends', () => {
    it('returns friends with display name and account status', async () => {
      mockUserFindUnique.mockResolvedValue({ email: ownerEmail })
      mockFriendFindMany
        .mockResolvedValueOnce([
          mockFriendRecord({ name: 'Custom Label', friend: null }),
        ])
        .mockResolvedValueOnce([])

      const friends = await listFriends(ownerId)

      expect(friends).toHaveLength(1)
      expect(friends[0].name).toBe('Custom Label')
      expect(friends[0].hasAccount).toBe(true)
      expect(friends[0].status).toBe('pending')
    })

    it('marks reciprocal friends as connected', async () => {
      mockUserFindUnique.mockResolvedValue({ email: ownerEmail })
      mockFriendFindMany
        .mockResolvedValueOnce([mockFriendRecord()])
        .mockResolvedValueOnce([{ userId: 'friend-user-1' }])

      const friends = await listFriends(ownerId)

      expect(friends[0].status).toBe('connected')
    })
  })

  describe('removeFriend', () => {
    it('deletes a friend owned by the user', async () => {
      mockFriendFindUnique.mockResolvedValue({ userId: ownerId })
      mockFriendDelete.mockResolvedValue({})

      await removeFriend({ userId: ownerId, friendId: 'friend-1' })

      expect(mockFriendDelete).toHaveBeenCalledWith({
        where: { id: 'friend-1' },
      })
    })

    it('throws when the friend does not belong to the user', async () => {
      mockFriendFindUnique.mockResolvedValue({ userId: 'other-user' })

      await expect(
        removeFriend({ userId: ownerId, friendId: 'friend-1' }),
      ).rejects.toMatchObject({
        code: 'NOT_FOUND',
      } satisfies Partial<TRPCError>)
    })
  })

  describe('findFriendByEmail', () => {
    it('returns null when no friend matches', async () => {
      mockFriendFindUnique.mockResolvedValue(null)

      const result = await findFriendByEmail({
        userId: ownerId,
        email: 'missing@example.com',
      })

      expect(result).toBeNull()
    })

    it('normalizes email when looking up a friend', async () => {
      mockUserFindUnique.mockResolvedValue({ email: ownerEmail })
      mockFriendFindUnique.mockResolvedValue(mockFriendRecord())
      mockFriendFindMany.mockResolvedValue([])

      await findFriendByEmail({
        userId: ownerId,
        email: '  Friend@Example.COM ',
      })

      expect(mockFriendFindUnique).toHaveBeenCalledWith({
        where: {
          userId_email: { userId: ownerId, email: 'friend@example.com' },
        },
        include: { friend: { select: { name: true } } },
      })
    })
  })
})
