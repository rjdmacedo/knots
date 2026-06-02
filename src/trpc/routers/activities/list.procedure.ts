import { getGlobalActivities } from '@/lib/api'
import { protectedProcedure } from '@/trpc/init'
import { z } from 'zod'

export const listActivitiesProcedure = protectedProcedure
  .input(
    z.object({
      cursor: z.number().optional().default(0),
      limit: z.number().optional().default(5),
    }),
  )
  .query(async ({ ctx, input: { cursor, limit } }) => {
    const activities = await getGlobalActivities(ctx.user.id, {
      offset: cursor,
      length: limit + 1,
    })
    return {
      activities: activities.slice(0, limit),
      hasMore: !!activities[limit],
      nextCursor: cursor + limit,
    }
  })
