import { prisma } from '@/lib/prisma'
import { MembershipRole } from '@prisma/client'
import { TRPCError } from '@trpc/server'

export type AddGroupMemberResult = {
  userId: string
  name: string
  createdUser: boolean
  createdMembership: boolean
}

export async function addGroupMember(input: {
  groupId: string
  email: string
  name?: string
  requesterUserId: string
  /** When true, adding someone who is already a member succeeds silently. */
  idempotent?: boolean
}): Promise<AddGroupMemberResult> {
  const { groupId, email, name, requesterUserId, idempotent = false } = input

  const callerMembership = await prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId: requesterUserId, groupId } },
  })

  if (!callerMembership || callerMembership.role !== MembershipRole.OWNER) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only the group owner can add members.',
    })
  }

  const normalizedEmail = email.toLowerCase().trim()

  let targetUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  })

  let createdUser = false
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
