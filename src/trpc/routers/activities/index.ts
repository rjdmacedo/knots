import { createTRPCRouter } from '@/trpc/init'
import { listActivitiesProcedure } from '@/trpc/routers/activities/list.procedure'

export const activitiesRouter = createTRPCRouter({
  list: listActivitiesProcedure,
})
