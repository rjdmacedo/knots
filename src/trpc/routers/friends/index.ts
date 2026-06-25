import { getGroupExpenses } from '@/lib/api'
import { findDyadGroup, findOrCreateDyadGroup } from '@/lib/dyad-groups'
import { getFriendActivities } from '@/lib/friend-activities'
import {
  computeFriendBalance,
  computeFriendSettlements,
  FriendBalanceSummary,
  sortFriendBalances,
} from '@/lib/friend-balances'
import { getSharedGroupsForUsers } from '@/lib/friend-balances-db'
import { getFriendExpenses } from '@/lib/friend-expenses'
import { getFriendStats } from '@/lib/friend-stats'
import {
  acceptFriendRequest,
  addFriendByEmail,
  declineFriendRequest,
  listFriends,
  listIncomingFriendRequests,
  removeFriend,
} from '@/lib/friends'
import { prisma } from '@/lib/prisma'
import { createTRPCRouter, protectedProcedure } from '@/trpc/init'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

export const friendsRouter = createTRPCRouter({
  list: protectedProcedure.query(async ({ ctx }) => {
    return listFriends(ctx.user.id)
  }),

  listIncoming: protectedProcedure.query(async ({ ctx }) => {
    return listIncomingFriendRequests(ctx.user.id)
  }),

  listWithBalances: protectedProcedure.query(async ({ ctx }) => {
    const friends = await listFriends(ctx.user.id)

    const friendsWithAccount = friends.filter((f) => f.friendUserId !== null)

    // Cache expenses by groupId to avoid duplicate fetches when multiple friends share a group
    const expenseCache = new Map<
      string,
      Awaited<ReturnType<typeof getGroupExpenses>>
    >()

    const summaries: FriendBalanceSummary[] = await Promise.all(
      friendsWithAccount.map(async (friend) => {
        const sharedGroups = await getSharedGroupsForUsers(
          ctx.user.id,
          friend.friendUserId!,
        )

        const sharedGroupsWithExpenses = await Promise.all(
          sharedGroups.map(async (group) => {
            let expenses = expenseCache.get(group.id)
            if (!expenses) {
              expenses = await getGroupExpenses(group.id)
              expenseCache.set(group.id, expenses)
            }
            return { ...group, expenses }
          }),
        )

        const balances = computeFriendBalance(
          ctx.user.id,
          friend.friendUserId!,
          sharedGroupsWithExpenses,
        )

        const dyadGroup = await findDyadGroup(ctx.user.id, friend.friendUserId!)

        return {
          friendId: friend.id,
          friendUserId: friend.friendUserId!,
          name: friend.name,
          dyadGroupId: dyadGroup?.groupId ?? null,
          balances,
        }
      }),
    )

    return sortFriendBalances(summaries)
  }),

  add: protectedProcedure
    .input(
      z.object({
        email: z.string().email(),
        name: z.string().min(1).max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return addFriendByEmail({
        userId: ctx.user.id,
        email: input.email,
        name: input.name,
      })
    }),

  accept: protectedProcedure
    .input(z.object({ incomingFriendId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return acceptFriendRequest({
        userId: ctx.user.id,
        incomingFriendId: input.incomingFriendId,
      })
    }),

  decline: protectedProcedure
    .input(z.object({ incomingFriendId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await declineFriendRequest({
        userId: ctx.user.id,
        incomingFriendId: input.incomingFriendId,
      })

      return { success: true }
    }),

  remove: protectedProcedure
    .input(z.object({ friendId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      await removeFriend({
        userId: ctx.user.id,
        friendId: input.friendId,
      })

      return { success: true }
    }),

  getFriend: protectedProcedure
    .input(z.object({ friendId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const friend = await prisma.friend.findUnique({
        where: { id: input.friendId },
        select: {
          id: true,
          userId: true,
          name: true,
          email: true,
          friendUserId: true,
          friend: { select: { name: true } },
        },
      })

      if (!friend || friend.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Friend not found.',
        })
      }

      return {
        id: friend.id,
        name: friend.name ?? friend.friend?.name ?? friend.email.split('@')[0],
        email: friend.email,
        friendUserId: friend.friendUserId,
        isConnected: friend.friendUserId !== null,
      }
    }),

  getFriendByUsername: protectedProcedure
    .input(z.object({ username: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      // Look up the user by username, then find the Friend record linking them
      const targetUser = await prisma.user.findUnique({
        where: { username: input.username },
        select: { id: true, name: true, email: true },
      })

      if (!targetUser) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Friend not found.',
        })
      }

      const friend = await prisma.friend.findFirst({
        where: {
          userId: ctx.user.id,
          friendUserId: targetUser.id,
        },
        select: {
          id: true,
          name: true,
          email: true,
          friendUserId: true,
        },
      })

      if (!friend) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Friend not found.',
        })
      }

      return {
        id: friend.id,
        name: friend.name ?? targetUser.name ?? friend.email.split('@')[0],
        email: friend.email,
        friendUserId: friend.friendUserId,
        isConnected: friend.friendUserId !== null,
      }
    }),

  getBalanceDetail: protectedProcedure
    .input(z.object({ friendId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const friend = await prisma.friend.findUnique({
        where: { id: input.friendId },
        select: {
          id: true,
          userId: true,
          name: true,
          email: true,
          friendUserId: true,
          friend: { select: { name: true } },
        },
      })

      if (!friend || friend.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Friend not found.',
        })
      }

      if (!friend.friendUserId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Friend is not connected.',
        })
      }

      const sharedGroups = await getSharedGroupsForUsers(
        ctx.user.id,
        friend.friendUserId,
      )

      const sharedGroupsWithExpenses = await Promise.all(
        sharedGroups.map(async (group) => ({
          ...group,
          expenses: await getGroupExpenses(group.id),
        })),
      )

      const balances = computeFriendBalance(
        ctx.user.id,
        friend.friendUserId,
        sharedGroupsWithExpenses,
      )

      const settlements = computeFriendSettlements(
        ctx.user.id,
        friend.friendUserId,
        sharedGroupsWithExpenses,
      )

      const dyadGroup = await findDyadGroup(ctx.user.id, friend.friendUserId)

      return {
        friend: {
          id: friend.id,
          name:
            friend.name ?? friend.friend?.name ?? friend.email.split('@')[0],
          email: friend.email,
          friendUserId: friend.friendUserId,
        },
        dyadGroupId: dyadGroup?.groupId ?? null,
        balances,
        settlements,
        currentUserId: ctx.user.id,
        sharedGroupCount: sharedGroups.length,
      }
    }),

  getExpenses: protectedProcedure
    .input(z.object({ friendId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const friend = await prisma.friend.findUnique({
        where: { id: input.friendId },
        select: {
          id: true,
          userId: true,
          name: true,
          email: true,
          friendUserId: true,
          friend: { select: { name: true } },
        },
      })

      if (!friend || friend.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Friend not found.',
        })
      }

      if (!friend.friendUserId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This friend does not have a Knots account yet.',
        })
      }

      const expenses = await getFriendExpenses(ctx.user.id, friend.friendUserId)
      const dyadGroup = await findDyadGroup(ctx.user.id, friend.friendUserId)

      const sharedGroups = await getSharedGroupsForUsers(
        ctx.user.id,
        friend.friendUserId,
      )

      const sharedGroupsWithExpenses = await Promise.all(
        sharedGroups.map(async (group) => ({
          ...group,
          expenses: await getGroupExpenses(group.id),
        })),
      )

      const balances = computeFriendBalance(
        ctx.user.id,
        friend.friendUserId,
        sharedGroupsWithExpenses,
      )

      return {
        friend: {
          id: friend.id,
          name:
            friend.name ?? friend.friend?.name ?? friend.email.split('@')[0],
          email: friend.email,
          friendUserId: friend.friendUserId,
        },
        expenses,
        dyadGroupId: dyadGroup?.groupId ?? null,
        balances,
      }
    }),

  findOrCreateDyadGroup: protectedProcedure
    .input(z.object({ friendId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const friend = await prisma.friend.findUnique({
        where: { id: input.friendId },
        select: {
          id: true,
          userId: true,
          name: true,
          email: true,
          friendUserId: true,
          friend: { select: { name: true } },
        },
      })

      if (!friend || friend.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Friend not found.',
        })
      }

      if (!friend.friendUserId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'This friend does not have a Knots account yet.',
        })
      }

      const displayName =
        friend.name ?? friend.friend?.name ?? friend.email.split('@')[0]

      const result = await findOrCreateDyadGroup(
        ctx.user.id,
        friend.friendUserId,
        displayName,
      )

      // Fetch the slug for the group so the client can navigate by slug
      const group = await prisma.group.findUnique({
        where: { id: result.groupId },
        select: { slug: true },
      })

      return { ...result, slug: group!.slug }
    }),

  getStats: protectedProcedure
    .input(z.object({ friendId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const friend = await prisma.friend.findUnique({
        where: { id: input.friendId },
        select: { userId: true, friendUserId: true },
      })

      if (!friend || friend.userId !== ctx.user.id || !friend.friendUserId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Friend not found.',
        })
      }

      return getFriendStats(ctx.user.id, friend.friendUserId)
    }),

  listActivities: protectedProcedure
    .input(
      z.object({
        friendId: z.string().min(1),
        cursor: z.number().optional().default(0),
        limit: z.number().optional().default(20),
      }),
    )
    .query(async ({ ctx, input: { friendId, cursor, limit } }) => {
      const friend = await prisma.friend.findUnique({
        where: { id: friendId },
        select: { userId: true, friendUserId: true },
      })

      if (!friend || friend.userId !== ctx.user.id || !friend.friendUserId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Friend not found.',
        })
      }

      const activities = await getFriendActivities(
        ctx.user.id,
        friend.friendUserId,
        { offset: cursor, length: limit + 1 },
      )

      return {
        activities: activities.slice(0, limit),
        hasMore: activities.length > limit,
        nextCursor: cursor + limit,
      }
    }),
})
