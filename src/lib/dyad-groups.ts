import { getCurrency } from '@/lib/currency'
import { prisma } from '@/lib/prisma'
import { GroupType, MembershipRole } from '@prisma/client'
import { TRPCError } from '@trpc/server'
import { nanoid } from 'nanoid'

const MAX_GROUP_NAME_LENGTH = 100

function defaultCurrencyCode(): string {
  return process.env.NEXT_PUBLIC_DEFAULT_CURRENCY_CODE || 'USD'
}

export async function resolveDyadCurrencyCode(
  userIdA: string,
  userIdB: string,
): Promise<string> {
  const users = await prisma.user.findMany({
    where: { id: { in: [userIdA, userIdB] } },
    select: { preferredCurrency: true },
  })

  const preferences = users
    .map((user) => user.preferredCurrency)
    .filter((currency): currency is string => !!currency)

  if (preferences.length === 0) {
    return defaultCurrencyCode()
  }

  const uniquePreferences = Array.from(new Set(preferences))
  if (uniquePreferences.length === 1) {
    return uniquePreferences[0]
  }

  return defaultCurrencyCode()
}

export async function syncDyadGroupCurrency(groupId: string): Promise<boolean> {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: {
      type: true,
      currencyCode: true,
      memberships: { select: { userId: true } },
      _count: { select: { expenses: true } },
    },
  })

  if (
    !group ||
    group.type !== GroupType.DYAD ||
    group.memberships.length !== 2 ||
    group._count.expenses > 0
  ) {
    return false
  }

  const [memberA, memberB] = group.memberships
  const currencyCode = await resolveDyadCurrencyCode(
    memberA.userId,
    memberB.userId,
  )

  if (!currencyCode || currencyCode === group.currencyCode) {
    return false
  }

  const currency = getCurrency(currencyCode)
  await prisma.group.update({
    where: { id: groupId },
    data: {
      currency: currency.symbol || '$',
      currencyCode: currency.code || currencyCode,
    },
  })

  return true
}

export function buildDyadKey(userIdA: string, userIdB: string): string {
  return [userIdA, userIdB].sort().join(':')
}

async function assertFriendOnList(
  userId: string,
  friendUserId: string,
): Promise<void> {
  const friendEntry = await prisma.friend.findFirst({
    where: { userId, friendUserId },
    select: { id: true },
  })

  if (!friendEntry) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Friend not found.',
    })
  }
}

function truncateGroupName(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length === 0) {
    return 'Friend'
  }
  return trimmed.length > MAX_GROUP_NAME_LENGTH
    ? trimmed.slice(0, MAX_GROUP_NAME_LENGTH)
    : trimmed
}

export async function findDyadGroup(
  currentUserId: string,
  friendUserId: string,
): Promise<{ groupId: string } | null> {
  const dyadKey = buildDyadKey(currentUserId, friendUserId)

  const group = await prisma.group.findUnique({
    where: { dyadKey },
    select: { id: true },
  })

  if (!group) {
    return null
  }

  const membership = await prisma.groupMembership.findUnique({
    where: {
      userId_groupId: { userId: currentUserId, groupId: group.id },
    },
  })

  if (!membership) {
    return null
  }

  return { groupId: group.id }
}

export type FindOrCreateDyadGroupResult = {
  groupId: string
  created: boolean
}

export async function findOrCreateDyadGroup(
  currentUserId: string,
  friendUserId: string,
  friendDisplayName: string,
): Promise<FindOrCreateDyadGroupResult> {
  if (currentUserId === friendUserId) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'You cannot create an expense group with yourself.',
    })
  }

  await assertFriendOnList(currentUserId, friendUserId)

  const dyadKey = buildDyadKey(currentUserId, friendUserId)

  const existing = await prisma.group.findUnique({
    where: { dyadKey },
    select: { id: true },
  })

  if (existing) {
    const membership = await prisma.groupMembership.findUnique({
      where: {
        userId_groupId: { userId: currentUserId, groupId: existing.id },
      },
    })

    if (!membership) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'You are not a member of this expense group.',
      })
    }

    await syncDyadGroupCurrency(existing.id)

    return { groupId: existing.id, created: false }
  }

  const currencyCode = await resolveDyadCurrencyCode(
    currentUserId,
    friendUserId,
  )
  const currency = getCurrency(currencyCode)
  const groupName = truncateGroupName(friendDisplayName)
  const groupId = nanoid()

  try {
    await prisma.$transaction([
      prisma.group.create({
        data: {
          id: groupId,
          name: groupName,
          type: GroupType.DYAD,
          dyadKey,
          currency: currency.symbol || '$',
          currencyCode: currency.code || currencyCode,
        },
      }),
      prisma.groupMembership.create({
        data: {
          userId: currentUserId,
          groupId,
          role: MembershipRole.OWNER,
        },
      }),
      prisma.groupMembership.create({
        data: {
          userId: friendUserId,
          groupId,
          role: MembershipRole.MEMBER,
        },
      }),
    ])
  } catch (error) {
    const isUniqueViolation =
      error instanceof Error &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'

    if (isUniqueViolation) {
      const raced = await prisma.group.findUnique({
        where: { dyadKey },
        select: { id: true },
      })

      if (raced) {
        await syncDyadGroupCurrency(raced.id)
        return { groupId: raced.id, created: false }
      }
    }

    throw error
  }

  return { groupId, created: true }
}

export function getDyadFriendUserId(
  participants: Array<{ id: string }>,
  currentUserId: string,
): string | undefined {
  return participants.find((participant) => participant.id !== currentUserId)
    ?.id
}

export async function assertStandardGroup(
  groupId: string,
  message = 'This action is not available for direct expense groups.',
) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { type: true },
  })

  if (!group) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'Group not found.',
    })
  }

  if (group.type === GroupType.DYAD) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message,
    })
  }
}
