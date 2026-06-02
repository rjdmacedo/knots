import { prisma } from '@/lib/prisma'
import { protectedProcedure } from '@/trpc/init'
import { MembershipRole } from '@prisma/client'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

export const promoteMemberProcedure = protectedProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      userId: z.string().min(1),
    }),
  )
  .mutation(async ({ input: { groupId, userId: targetUserId }, ctx: { user } }) => {
    // Verify the caller is the group owner
    const callerMembership = await prisma.groupMembership.findUnique({
      where: { userId_groupId: { userId: user.id, groupId } },
    })

    if (!callerMembership || callerMembership.role !== MembershipRole.OWNER) {
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: 'Only the group owner can promote members.',
      })
    }

    // Cannot promote yourself
    if (targetUserId === user.id) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'You are already an owner.',
      })
    }

    // Verify the target is a member
    const targetMembership = await prisma.groupMembership.findUnique({
      where: { userId_groupId: { userId: targetUserId, groupId } },
    })

    if (!targetMembership) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'User is not a member of this group.',
      })
    }

    if (targetMembership.role === MembershipRole.OWNER) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: 'User is already an owner.',
      })
    }

    // Promote to owner
    await prisma.groupMembership.update({
      where: { userId_groupId: { userId: targetUserId, groupId } },
      data: { role: MembershipRole.OWNER },
    })

    return {}
  })
