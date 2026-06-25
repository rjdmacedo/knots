import { emailService } from '@/lib/auth/email-service'
import { prisma } from '@/lib/prisma'
import { isBlockedByEmail } from '@/lib/profile/block-check'
import { TRPCError } from '@trpc/server'

function getBaseUrl(): string {
  return (
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'http://localhost:3000'
  )
}

export type FriendConnectionStatus = 'connected' | 'pending'

export type FriendListItem = {
  id: string
  email: string
  name: string
  friendUserId: string | null
  friendUsername: string | null
  hasAccount: boolean
  status: FriendConnectionStatus
}

export type IncomingFriendRequest = {
  id: string
  requesterUserId: string
  requesterName: string
  requesterEmail: string
  createdAt: Date
}

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim()
}

function getFriendDisplayName(friend: {
  name: string | null
  email: string
  friend: { name: string; username: string } | null
}): string {
  return friend.name ?? friend.friend?.name ?? friend.email.split('@')[0]
}

function toFriendListItem(
  friend: {
    id: string
    email: string
    friendUserId: string | null
    name: string | null
    friend: { name: string; username: string } | null
  },
  status: FriendConnectionStatus,
): FriendListItem {
  return {
    id: friend.id,
    email: friend.email,
    name: getFriendDisplayName(friend),
    friendUserId: friend.friendUserId,
    friendUsername: friend.friend?.username ?? null,
    hasAccount: friend.friendUserId !== null,
    status,
  }
}

async function getConnectedInviteeUserIds(
  ownerUserId: string,
  ownerEmail: string,
  inviteeUserIds: string[],
): Promise<Set<string>> {
  if (inviteeUserIds.length === 0) {
    return new Set()
  }

  const reciprocals = await prisma.friend.findMany({
    where: {
      userId: { in: inviteeUserIds },
      OR: [{ email: ownerEmail }, { friendUserId: ownerUserId }],
    },
    select: { userId: true },
  })

  return new Set(reciprocals.map((reciprocal) => reciprocal.userId))
}

async function enrichFriendsWithStatus(
  ownerUserId: string,
  friends: Array<{
    id: string
    email: string
    friendUserId: string | null
    name: string | null
    friend: { name: string; username: string } | null
  }>,
): Promise<FriendListItem[]> {
  const ownerEmail = await getUserEmail(ownerUserId)
  const inviteeUserIds = friends
    .map((friend) => friend.friendUserId)
    .filter((userId): userId is string => userId !== null)
  const connectedInviteeUserIds = await getConnectedInviteeUserIds(
    ownerUserId,
    ownerEmail,
    inviteeUserIds,
  )

  return friends.map((friend) =>
    toFriendListItem(
      friend,
      friend.friendUserId !== null &&
        connectedInviteeUserIds.has(friend.friendUserId)
        ? 'connected'
        : 'pending',
    ),
  )
}

const friendInclude = {
  friend: { select: { name: true, username: true } },
} as const

export async function addFriendByEmail(input: {
  userId: string
  email: string
  name?: string
}): Promise<FriendListItem> {
  const normalizedEmail = normalizeEmail(input.email)

  const owner = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { email: true, name: true },
  })

  if (!owner) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'User not found.',
    })
  }

  if (normalizeEmail(owner.email) === normalizedEmail) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'You cannot add yourself as a friend.',
    })
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true },
  })

  const existingFriend = await prisma.friend.findUnique({
    where: {
      userId_email: { userId: input.userId, email: normalizedEmail },
    },
    select: { id: true },
  })

  const friend = await prisma.friend.upsert({
    where: {
      userId_email: { userId: input.userId, email: normalizedEmail },
    },
    create: {
      userId: input.userId,
      email: normalizedEmail,
      name: input.name?.trim() || null,
      friendUserId: existingUser?.id ?? null,
    },
    update: {
      ...(input.name?.trim() ? { name: input.name.trim() } : {}),
      ...(existingUser ? { friendUserId: existingUser.id } : {}),
    },
    include: friendInclude,
  })

  if (!existingFriend) {
    // If the target user has blocked this user, silently skip the notification
    const blocked = await isBlockedByEmail(input.userId, normalizedEmail)

    if (!blocked) {
      const baseUrl = getBaseUrl()
      const hasAccount = existingUser !== null
      const inviteLink = hasAccount
        ? `${baseUrl}/login?callbackUrl=${encodeURIComponent('/friends')}`
        : `${baseUrl}/register?email=${encodeURIComponent(normalizedEmail)}`

      const emailResult = await emailService.sendFriendInviteEmail(
        normalizedEmail,
        owner.name,
        inviteLink,
        hasAccount,
      )

      if (!emailResult.ok) {
        console.error(
          `[Friends] Failed to send friend invite email to ${normalizedEmail}:`,
          emailResult.error,
        )
      }
    }
  }

  const [result] = await enrichFriendsWithStatus(input.userId, [friend])
  return result!
}

export async function removeFriend(input: {
  userId: string
  friendId: string
}): Promise<void> {
  const friend = await prisma.friend.findUnique({
    where: { id: input.friendId },
    select: { userId: true },
  })

  if (!friend || friend.userId !== input.userId) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Friend not found.',
    })
  }

  await prisma.friend.delete({ where: { id: input.friendId } })
}

export async function listFriends(userId: string): Promise<FriendListItem[]> {
  const friends = await prisma.friend.findMany({
    where: { userId },
    include: friendInclude,
    orderBy: [{ name: 'asc' }, { email: 'asc' }],
  })

  return enrichFriendsWithStatus(userId, friends)
}

async function getUserEmail(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  })

  if (!user) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'User not found.',
    })
  }

  return normalizeEmail(user.email)
}

async function getIncomingFriendRecord(input: {
  userId: string
  incomingFriendId: string
}) {
  const userEmail = await getUserEmail(input.userId)

  const incoming = await prisma.friend.findUnique({
    where: { id: input.incomingFriendId },
    include: {
      owner: { select: { id: true, name: true, email: true } },
    },
  })

  if (!incoming) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Connection request not found.',
    })
  }

  const isInvitee =
    incoming.friendUserId === input.userId ||
    normalizeEmail(incoming.email) === userEmail

  if (!isInvitee) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Connection request not found.',
    })
  }

  return incoming
}

export async function listIncomingFriendRequests(
  userId: string,
): Promise<IncomingFriendRequest[]> {
  const userEmail = await getUserEmail(userId)

  const [incoming, myFriends, blockedByMe] = await Promise.all([
    prisma.friend.findMany({
      where: {
        OR: [{ friendUserId: userId }, { email: userEmail }],
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.friend.findMany({
      where: { userId },
      select: { email: true },
    }),
    prisma.blockedUser.findMany({
      where: { userId },
      select: { blockedUserId: true },
    }),
  ])

  const myFriendEmails = new Set(
    myFriends.map((friend) => normalizeEmail(friend.email)),
  )

  const blockedUserIds = new Set(blockedByMe.map((b) => b.blockedUserId))

  const seenRequesters = new Set<string>()

  return incoming
    .filter((request) => {
      if (request.owner.id === userId) {
        return false
      }

      // Hide requests from users I've blocked
      if (blockedUserIds.has(request.owner.id)) {
        return false
      }

      const requesterEmail = normalizeEmail(request.owner.email)
      if (myFriendEmails.has(requesterEmail)) {
        return false
      }

      if (seenRequesters.has(request.owner.id)) {
        return false
      }

      seenRequesters.add(request.owner.id)
      return true
    })
    .map((request) => ({
      id: request.id,
      requesterUserId: request.owner.id,
      requesterName: request.owner.name,
      requesterEmail: request.owner.email,
      createdAt: request.createdAt,
    }))
}

export async function acceptFriendRequest(input: {
  userId: string
  incomingFriendId: string
}): Promise<FriendListItem> {
  const incoming = await getIncomingFriendRecord(input)

  await upsertFriendByEmail({
    userId: input.userId,
    email: incoming.owner.email,
    name: incoming.owner.name,
    friendUserId: incoming.owner.id,
  })

  const friend = await prisma.friend.findUnique({
    where: {
      userId_email: {
        userId: input.userId,
        email: normalizeEmail(incoming.owner.email),
      },
    },
    include: friendInclude,
  })

  if (!friend) {
    throw new TRPCError({
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to accept connection request.',
    })
  }

  const [result] = await enrichFriendsWithStatus(input.userId, [friend])
  return result!
}

export async function declineFriendRequest(input: {
  userId: string
  incomingFriendId: string
}): Promise<void> {
  await getIncomingFriendRecord(input)
  await prisma.friend.delete({ where: { id: input.incomingFriendId } })
}

export async function findFriendByEmail(input: {
  userId: string
  email: string
}): Promise<FriendListItem | null> {
  const normalizedEmail = normalizeEmail(input.email)

  const friend = await prisma.friend.findUnique({
    where: {
      userId_email: { userId: input.userId, email: normalizedEmail },
    },
    include: friendInclude,
  })

  return friend
    ? enrichFriendsWithStatus(input.userId, [friend]).then(
        (friends) => friends[0] ?? null,
      )
    : null
}

export async function upsertFriendByEmail(input: {
  userId: string
  email: string
  name?: string
  friendUserId?: string | null
}): Promise<void> {
  const normalizedEmail = normalizeEmail(input.email)

  const owner = await prisma.user.findUnique({
    where: { id: input.userId },
    select: { email: true },
  })

  if (!owner || normalizeEmail(owner.email) === normalizedEmail) {
    return
  }

  const linkedUserId =
    input.friendUserId ??
    (
      await prisma.user.findUnique({
        where: { email: normalizedEmail },
        select: { id: true },
      })
    )?.id ??
    null

  await prisma.friend.upsert({
    where: {
      userId_email: { userId: input.userId, email: normalizedEmail },
    },
    create: {
      userId: input.userId,
      email: normalizedEmail,
      name: input.name?.trim() || null,
      friendUserId: linkedUserId,
    },
    update: {
      ...(input.name?.trim() ? { name: input.name.trim() } : {}),
      ...(linkedUserId ? { friendUserId: linkedUserId } : {}),
    },
  })
}
