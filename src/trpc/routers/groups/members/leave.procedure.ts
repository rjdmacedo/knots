import { prisma } from '@/lib/prisma'
import { groupMemberProcedure } from '@/trpc/init'
import { MembershipRole } from '@prisma/client'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

export const leaveProcedure = groupMemberProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
    }),
  )
  .mutation(async ({ input: { groupId }, ctx: { user, membership } }) => {
    // If the user is the owner, check if there's another owner
    if (membership.role === MembershipRole.OWNER) {
      const otherOwners = await prisma.groupMembership.count({
        where: {
          groupId,
          userId: { not: user.id },
          role: MembershipRole.OWNER,
        },
      })

      if (otherOwners === 0) {
        // Check if there are other members at all
        const otherMembers = await prisma.groupMembership.count({
          where: { groupId, userId: { not: user.id } },
        })

        if (otherMembers > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message:
              'You are the only owner. Promote another member to owner before leaving.',
          })
        }
      }
    }

    // Delete the membership (expenses remain intact)
    await prisma.groupMembership.delete({
      where: { userId_groupId: { userId: user.id, groupId } },
    })

    return {}
  })
