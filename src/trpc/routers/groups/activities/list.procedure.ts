import { getActivities } from '@/lib/api'
import { groupMemberProcedure } from '@/trpc/init'
import { z } from 'zod'

export const listGroupActivitiesProcedure = groupMemberProcedure
  .input(
    z.object({
      groupId: z.string(),
      expenseId: z.string().min(1).optional(),
      cursor: z.number().optional().default(0),
      limit: z.number().optional().default(5),
    }),
  )
  .query(async ({ input: { groupId, expenseId, cursor, limit } }) => {
    const activities = await getActivities(groupId, {
      offset: cursor,
      length: limit + 1,
      expenseId,
    })
    return {
      activities: activities.slice(0, limit),
      hasMore: !!activities[limit],
      nextCursor: cursor + limit,
    }
  })
