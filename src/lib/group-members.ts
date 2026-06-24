import { assertStandardGroup } from '@/lib/dyad-groups'
import { upsertFriendByEmail } from '@/lib/friends'
import { prisma } from '@/lib/prisma'
import { isBlockedBy } from '@/lib/profile/block-check'
import { MembershipRole } from '@prisma/client'
import { TRPCError } from '@trpc/server'

export type AddGroupMemberResult = {
  userId: string
  name: string
  createdUser: boolean
  createdMembership: boolean
}

type AddGroupMemberInput = {
  groupId: string
  requesterUserId: string
  userId?: string
  email?: string
  name?: string
  /** When true, adding someone who is already a member succeeds silently. */
  idempotent?: boolean
  /** When adding by email, upsert into the caller's friends list. Defaults to true. */
  upsertFriend?: boolean
}

export async function addGroupMember(
  input: AddGroupMemberInput,
): Promise<AddGroupMemberResult> {
  const {
    groupId,
    requesterUserId,
    name,
    idempotent = false,
    upsertFriend = true,
  } = input

  const hasUserId = !!input.userId
  const hasEmail = !!input.email

  if (hasUserId === hasEmail) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Exactly one of userId or email must be provided.',
    })
  }

  const callerMembership = await prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId: requesterUserId, groupId } },
  })

  if (!callerMembership || callerMembership.role !== MembershipRole.OWNER) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only the group owner can add members.',
    })
  }

  await assertStandardGroup(
    groupId,
    'Members cannot be added to a direct expense group.',
  )

  let targetUser
  let createdUser = false

  if (input.userId) {
    targetUser = await prisma.user.findUnique({
      where: { id: input.userId },
    })

    if (!targetUser) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User not found.',
      })
    }
  } else {
    const normalizedEmail = input.email!.toLowerCase().trim()

    targetUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    })

    if (!targetUser) {
      targetUser = await prisma.user.create({
        data: {
          name: name?.trim() || normalizedEmail.split('@')[0],
          email: normalizedEmail,
          passwordHash: '',
        },
      })
      createdUser = true
    }

    if (upsertFriend) {
      await upsertFriendByEmail({
        userId: requesterUserId,
        email: normalizedEmail,
        name: name?.trim() || targetUser.name,
        friendUserId: targetUser.id,
      })
    }
  }

  const existingMembership = await prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId: targetUser.id, groupId } },
  })

  if (existingMembership) {
    if (idempotent) {
      return {
        userId: targetUser.id,
        name: targetUser.name,
        createdUser,
        createdMembership: false,
      }
    }

    throw new TRPCError({
      code: 'CONFLICT',
      message: 'User is already a member of this group.',
    })
  }

  // Check if the target user has blocked the requester — fail with generic error
  const blocked = await isBlockedBy(requesterUserId, targetUser.id)
  if (blocked) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Something went wrong. Please try again.',
    })
  }

  await prisma.groupMembership.create({
    data: {
      userId: targetUser.id,
      groupId,
      role: MembershipRole.MEMBER,
    },
  })

  return {
    userId: targetUser.id,
    name: targetUser.name,
    createdUser,
    createdMembership: true,
  }
}
