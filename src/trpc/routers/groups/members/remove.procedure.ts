import { assertStandardGroup } from '@/lib/dyad-groups'
import { prisma } from '@/lib/prisma'
import { groupMemberProcedure } from '@/trpc/init'
import { MembershipRole } from '@prisma/client'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

export const removeMemberProcedure = groupMemberProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      userId: z.string().min(1),
    }),
  )
  .mutation(
    async ({
      input: { groupId, userId: targetUserId },
      ctx: { user, membership },
    }) => {
      await assertStandardGroup(
        groupId,
        'Members cannot be removed from a direct expense group.',
      )

      // Verify the caller is the group owner
      const callerMembership = membership

      if (callerMembership.role !== MembershipRole.OWNER) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Only the group owner can remove members.',
        })
      }

      // Cannot remove yourself (owner) — use "leave" or transfer ownership first
      if (targetUserId === user.id) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'The owner cannot remove themselves. Transfer ownership or delete the group instead.',
        })
      }

      // Verify the target is actually a member
      const targetMembership = await prisma.groupMembership.findUnique({
        where: { userId_groupId: { userId: targetUserId, groupId } },
      })

      if (!targetMembership) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'User is not a member of this group.',
        })
      }

      // Delete the membership (expenses remain intact)
      await prisma.groupMembership.delete({
        where: { userId_groupId: { userId: targetUserId, groupId } },
      })

      return {}
    },
  )
