import { prisma } from '@/lib/prisma'
import { MembershipRole } from '@prisma/client'
import { TRPCError } from '@trpc/server'

async function getMembership(userId: string, groupId: string) {
  return prisma.groupMembership.findUnique({
    where: { userId_groupId: { userId, groupId } },
  })
}

export async function archiveGroupForUser(userId: string, groupId: string) {
  const membership = await getMembership(userId, groupId)
  if (!membership) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'You are not a member of this group.',
    })
  }

  if (membership.archivedAt) {
    return membership
  }

  return prisma.groupMembership.update({
    where: { userId_groupId: { userId, groupId } },
    data: { archivedAt: new Date() },
  })
}

export async function unarchiveGroupForUser(userId: string, groupId: string) {
  const membership = await getMembership(userId, groupId)
  if (!membership) {
    throw new TRPCError({
      code: 'NOT_FOUND',
      message: 'You are not a member of this group.',
    })
  }

  if (!membership.archivedAt) {
    return membership
  }

  return prisma.groupMembership.update({
    where: { userId_groupId: { userId, groupId } },
    data: { archivedAt: null },
  })
}

export async function deleteGroupAsOwner(userId: string, groupId: string) {
  const membership = await getMembership(userId, groupId)
  if (!membership || membership.role !== MembershipRole.OWNER) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Only the group owner can delete the group.',
    })
  }

  // Activity used to reference Group with ON DELETE RESTRICT — remove explicitly
  // so delete works even before the cascade migration is applied.
  await prisma.$transaction([
    prisma.activity.deleteMany({ where: { groupId } }),
    prisma.group.delete({ where: { id: groupId } }),
  ])

  return { groupId }
}
