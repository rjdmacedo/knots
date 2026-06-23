import { getGroupExpenses } from '@/lib/api'
import { findDyadGroup, findOrCreateDyadGroup } from '@/lib/dyad-groups'
import {
  computeFriendBalance,
  FriendBalanceSummary,
  sortFriendBalances,
} from '@/lib/friend-balances'
import { getSharedGroupsForUsers } from '@/lib/friend-balances-db'
import { getFriendExpenses } from '@/lib/friend-expenses'
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

      return findOrCreateDyadGroup(
        ctx.user.id,
        friend.friendUserId,
        displayName,
      )
    }),
})
