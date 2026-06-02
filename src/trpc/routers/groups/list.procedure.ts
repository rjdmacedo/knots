import { getGroups } from '@/lib/api'
import { prisma } from '@/lib/prisma'
import { protectedProcedure } from '@/trpc/init'
import { z } from 'zod'

export const listGroupsProcedure = protectedProcedure
  .input(
    z.object({
      groupIds: z.array(z.string().min(1)),
    }),
  )
  .query(async ({ input: { groupIds }, ctx: { user } }) => {
    const memberships = await prisma.groupMembership.findMany({
      where: {
        userId: user.id,
        groupId: { in: groupIds },
      },
      select: { groupId: true },
    })
    const allowedGroupIds = memberships.map((m) => m.groupId)

    const groups = await getGroups(allowedGroupIds)
    return { groups }
  })
