import { authRouter } from '@/trpc/routers/auth'
import { categoriesRouter } from '@/trpc/routers/categories'
import { groupMembershipRouter } from '@/trpc/routers/group-membership'
import { groupsRouter } from '@/trpc/routers/groups'
import { pushSubscriptionsRouter } from '@/trpc/routers/push-subscriptions'
import { inferRouterOutputs } from '@trpc/server'
import { createTRPCRouter } from '../init'

export const appRouter = createTRPCRouter({
  auth: authRouter,
  groups: groupsRouter,
  groupMembership: groupMembershipRouter,
  categories: categoriesRouter,
  pushSubscriptions: pushSubscriptionsRouter,
})

export type AppRouter = typeof appRouter
export type AppRouterOutput = inferRouterOutputs<AppRouter>
