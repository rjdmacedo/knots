import { activitiesRouter } from '@/trpc/routers/activities'
import { authRouter } from '@/trpc/routers/auth'
import { categoriesRouter } from '@/trpc/routers/categories'
import { friendsRouter } from '@/trpc/routers/friends'
import { groupMembershipRouter } from '@/trpc/routers/group-membership'
import { groupsRouter } from '@/trpc/routers/groups'
import { profileRouter } from '@/trpc/routers/profile'
import { pushSubscriptionsRouter } from '@/trpc/routers/push-subscriptions'
import { inferRouterOutputs } from '@trpc/server'
import { createTRPCRouter } from '../init'

export const appRouter = createTRPCRouter({
  auth: authRouter,
  activities: activitiesRouter,
  groups: groupsRouter,
  groupMembership: groupMembershipRouter,
  categories: categoriesRouter,
  profile: profileRouter,
  friends: friendsRouter,
  pushSubscriptions: pushSubscriptionsRouter,
})

export type AppRouter = typeof appRouter
export type AppRouterOutput = inferRouterOutputs<AppRouter>
