import { getCurrency } from '@/lib/currency'
import { prisma } from '@/lib/prisma'
import { GroupType, MembershipRole } from '@prisma/client'
import { TRPCError } from '@trpc/server'
import { nanoid } from 'nanoid'

const MAX_GROUP_NAME_LENGTH = 100

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

    return { groupId: existing.id, created: false }
  }

  const currentUser = await prisma.user.findUnique({
    where: { id: currentUserId },
    select: { preferredCurrency: true },
  })

  const currencyCode =
    currentUser?.preferredCurrency ||
    process.env.NEXT_PUBLIC_DEFAULT_CURRENCY_CODE ||
    'USD'
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
        return { groupId: raced.id, created: false }
      }
    }

    throw error
  }

  return { groupId, created: true }
}
