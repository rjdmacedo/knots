import { getGroupExpenses, randomId } from '@/lib/api'
import { getCurrency } from '@/lib/currency'
import { getFriendActivities } from '@/lib/friend-activities'
import {
  computeFriendBalance,
  computeFriendSettlements,
  FriendBalanceSummary,
  sortFriendBalances,
} from '@/lib/friend-balances'
import {
  getDirectExpensesBetweenUsers,
  getSharedGroupsForUsers,
} from '@/lib/friend-balances-db'
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

    // Fetch current user's preferredCurrency for direct expense bucket
    const currentUser = await prisma.user.findUnique({
      where: { id: ctx.user.id },
      select: { preferredCurrency: true },
    })
    const directCurrency = getCurrency(currentUser?.preferredCurrency || 'EUR')

    // Cache expenses by groupId to avoid duplicate fetches when multiple friends share a group
    const expenseCache = new Map<
      string,
      Awaited<ReturnType<typeof getGroupExpenses>>
    >()

    const summaries: FriendBalanceSummary[] = await Promise.all(
      friendsWithAccount.map(async (friend) => {
        const [sharedGroups, directExpenses] = await Promise.all([
          getSharedGroupsForUsers(ctx.user.id, friend.friendUserId!),
          getDirectExpensesBetweenUsers(ctx.user.id, friend.friendUserId!),
        ])

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
          directExpenses.length > 0
            ? [{ currency: directCurrency, expenses: directExpenses }]
            : undefined,
        )

        return {
          friendId: friend.id,
          friendUserId: friend.friendUserId!,
          name: friend.name,
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

      return {
        friend: {
          id: friend.id,
          name:
            friend.name ?? friend.friend?.name ?? friend.email.split('@')[0],
          email: friend.email,
          friendUserId: friend.friendUserId,
        },
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
        balances,
      }
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

  getTimeline: protectedProcedure
    .input(
      z.object({
        friendId: z.string().min(1),
        limit: z.number().optional(),
        offset: z.number().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      // 1. Verify friend ownership + connected status
      const friend = await prisma.friend.findUnique({
        where: { id: input.friendId },
        select: {
          id: true,
          userId: true,
          name: true,
          email: true,
          friendUserId: true,
          friend: { select: { id: true, name: true, username: true } },
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
          message: 'Friend is not connected.',
        })
      }

      // Fetch current user's preferredCurrency for direct expense bucket
      const currentUser = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { preferredCurrency: true },
      })
      const directCurrency = getCurrency(
        currentUser?.preferredCurrency || 'EUR',
      )

      // 2. Get shared standard groups
      const sharedGroups = await getSharedGroupsForUsers(
        ctx.user.id,
        friend.friendUserId,
      )

      // 3. Get direct expenses (groupId = null) involving both users
      const directExpenses = await getDirectExpensesBetweenUsers(
        ctx.user.id,
        friend.friendUserId,
      )

      // 4. Get group expenses for each shared group
      const sharedGroupsWithExpenses = await Promise.all(
        sharedGroups.map(async (group) => ({
          ...group,
          expenses: await getGroupExpenses(group.id),
        })),
      )

      // 5. Compute balances (all buckets including direct)
      const balances = computeFriendBalance(
        ctx.user.id,
        friend.friendUserId,
        sharedGroupsWithExpenses,
        directExpenses.length > 0
          ? [{ currency: directCurrency, expenses: directExpenses }]
          : undefined,
      )

      // 6. Compute settlements (all buckets including direct)
      const settlements = computeFriendSettlements(
        ctx.user.id,
        friend.friendUserId,
        sharedGroupsWithExpenses,
        directExpenses.length > 0
          ? [{ currency: directCurrency, expenses: directExpenses }]
          : undefined,
      )

      // 7. Build timeline entries
      // buildFriendTimeline will be created in task 3.1 — for now return empty entries
      const allEntries: Array<{
        type: 'GROUP_SUMMARY' | 'EXPENSE' | 'PAYMENT'
        date: Date
        [key: string]: unknown
      }> = []

      // 8. Apply pagination
      const offset = input.offset ?? 0
      const limit = input.limit ?? 50
      const entries = allEntries.slice(offset, offset + limit)

      return {
        friend: {
          id: friend.id,
          name:
            friend.name ?? friend.friend?.name ?? friend.email.split('@')[0],
          email: friend.email,
          friendUserId: friend.friendUserId,
          username: friend.friend?.username ?? null,
        },
        currentUserId: ctx.user.id,
        balances,
        settlements,
        entries,
      }
    }),

  getDirectExpenses: protectedProcedure
    .input(
      z.object({
        friendId: z.string(),
        limit: z.number().optional().default(50),
        offset: z.number().optional().default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const friend = await prisma.friend.findUnique({
        where: { id: input.friendId },
        select: {
          id: true,
          userId: true,
          friendUserId: true,
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
          message: 'Friend is not connected.',
        })
      }

      const expenses = await prisma.expense.findMany({
        select: {
          id: true,
          title: true,
          amount: true,
          expenseDate: true,
          createdAt: true,
          isReimbursement: true,
          splitMode: true,
          notes: true,
          category: true,
          paidBy: { select: { id: true, name: true } },
          paidFor: {
            select: {
              user: { select: { id: true, name: true } },
              shares: true,
            },
          },
          _count: { select: { documents: true } },
        },
        where: {
          groupId: null,
          AND: [
            {
              OR: [
                { paidById: ctx.user.id },
                { paidFor: { some: { userId: ctx.user.id } } },
              ],
            },
            {
              OR: [
                { paidById: friend.friendUserId },
                { paidFor: { some: { userId: friend.friendUserId } } },
              ],
            },
          ],
        },
        orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
        skip: input.offset,
        take: input.limit,
      })

      return expenses
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

  createDirectExpense: protectedProcedure
    .input(
      z.object({
        friendId: z.string().min(1),
        title: z.string().min(1),
        amount: z.number().int().positive(),
        currency: z.string().min(1),
        paidById: z.string().min(1),
        expenseDate: z.date().optional(),
        notes: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Verify friend ownership
      const friend = await prisma.friend.findUnique({
        where: { id: input.friendId },
        select: { id: true, userId: true, friendUserId: true },
      })

      if (!friend || friend.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Friend not found.',
        })
      }

      // 2. Verify friend is connected (has friendUserId set)
      if (!friend.friendUserId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Friend is not connected.',
        })
      }

      const currentUserId = ctx.user.id
      const friendUserId = friend.friendUserId

      // 3. Validate paidById is either the current user or the friend
      if (input.paidById !== currentUserId && input.paidById !== friendUserId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'paidById must be either the current user or the friend.',
        })
      }

      // 4. Create expense with groupId = null, splitMode = EVENLY
      const expenseId = randomId()
      const expenseDate = input.expenseDate ?? new Date()

      const expense = await prisma.expense.create({
        data: {
          id: expenseId,
          groupId: null,
          expenseDate,
          title: input.title,
          amount: input.amount,
          paidById: input.paidById,
          isReimbursement: false,
          splitMode: 'EVENLY',
          categoryId: 0,
          notes: input.notes ?? null,
          paidFor: {
            createMany: {
              data: [
                { userId: currentUserId, shares: 1 },
                { userId: friendUserId, shares: 1 },
              ],
            },
          },
        },
        include: {
          paidBy: { select: { id: true, name: true } },
          paidFor: {
            include: { user: { select: { id: true, name: true } } },
          },
        },
      })

      return expense
    }),

  getPaymentDetail: protectedProcedure
    .input(
      z.object({
        expenseId: z.string().min(1),
        friendUsername: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      // 1. Look up the friend by username
      const targetUser = await prisma.user.findUnique({
        where: { username: input.friendUsername },
        select: { id: true, name: true, username: true },
      })

      if (!targetUser) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Payment not found.',
        })
      }

      const friend = await prisma.friend.findFirst({
        where: {
          userId: ctx.user.id,
          friendUserId: targetUser.id,
        },
        select: { id: true, name: true, friendUserId: true },
      })

      if (!friend || !friend.friendUserId) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Payment not found.',
        })
      }

      // 2. Load the expense
      const expense = await prisma.expense.findUnique({
        where: { id: input.expenseId },
        include: {
          paidBy: { select: { id: true, name: true, username: true } },
          paidFor: {
            include: {
              user: { select: { id: true, name: true, username: true } },
            },
          },
          group: {
            select: {
              id: true,
              name: true,
              currency: true,
              currencyCode: true,
            },
          },
        },
      })

      if (!expense) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Payment not found.',
        })
      }

      // 3. Verify isReimbursement === true
      if (!expense.isReimbursement) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Payment not found.',
        })
      }

      // 4. Verify expense involves the friend (as payer or payee)
      const friendUserId = friend.friendUserId
      const involvesFriend =
        expense.paidById === friendUserId ||
        expense.paidFor.some((pf) => pf.userId === friendUserId)

      if (!involvesFriend) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Payment not found.',
        })
      }

      // 5. Determine payer and payee
      // For a payment: paidBy is the payer (fromUser), paidFor[0] is the payee (toUser)
      const payer = {
        id: expense.paidBy.id,
        name: expense.paidBy.name ?? 'Unknown',
        username: expense.paidBy.username,
      }
      const payee = expense.paidFor[0]
        ? {
            id: expense.paidFor[0].user.id,
            name: expense.paidFor[0].user.name ?? 'Unknown',
            username: expense.paidFor[0].user.username,
          }
        : payer

      // 6. Resolve currency
      let currencyCode: string
      if (expense.group?.currencyCode) {
        currencyCode = expense.group.currencyCode
      } else if (expense.group?.currency) {
        currencyCode = expense.group.currency
      } else {
        // Direct payment — use creator's preferredCurrency
        const creator = await prisma.user.findUnique({
          where: { id: expense.paidById },
          select: { preferredCurrency: true },
        })
        currencyCode = creator?.preferredCurrency || 'EUR'
      }

      // 7. Find who added the expense (createdBy = paidBy in absence of a createdBy field)
      const addedBy = payer

      return {
        id: expense.id,
        payer,
        payee,
        amount: expense.amount,
        currency: currencyCode,
        expenseDate: expense.expenseDate,
        createdAt: expense.createdAt,
        addedBy,
        groupId: expense.groupId,
        groupName: expense.group?.name ?? null,
        creationMethod: expense.creationMethod,
        bundleId: expense.bundleId,
        friendName: friend.name ?? targetUser.name ?? input.friendUsername,
        friendUsername: input.friendUsername,
      }
    }),

  deletePayment: protectedProcedure
    .input(
      z.object({
        expenseId: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Load the expense
      const expense = await prisma.expense.findUnique({
        where: { id: input.expenseId },
        include: {
          paidBy: { select: { id: true } },
          paidFor: { select: { userId: true } },
        },
      })

      if (!expense) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Payment not found.',
        })
      }

      // Must be a reimbursement
      if (!expense.isReimbursement) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Payment not found.',
        })
      }

      // Current user must be involved (as payer or payee)
      const isInvolved =
        expense.paidById === ctx.user.id ||
        expense.paidFor.some((pf) => pf.userId === ctx.user.id)

      if (!isInvolved) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You cannot delete this payment.',
        })
      }

      // Delete the expense
      await prisma.expense.delete({
        where: { id: input.expenseId },
      })

      return { success: true }
    }),

  settleAll: protectedProcedure
    .input(
      z.object({
        friendId: z.string().min(1),
        currency: z.string().min(1), // settle one currency at a time
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // 1. Verify friend ownership + connected
      const friend = await prisma.friend.findUnique({
        where: { id: input.friendId },
        select: { id: true, userId: true, friendUserId: true },
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
          message: 'Friend is not connected.',
        })
      }

      const currentUserId = ctx.user.id
      const friendUserId = friend.friendUserId

      // 2. Get shared groups + direct expenses
      const [sharedGroups, directExpenses] = await Promise.all([
        getSharedGroupsForUsers(currentUserId, friendUserId),
        getDirectExpensesBetweenUsers(currentUserId, friendUserId),
      ])

      const sharedGroupsWithExpenses = await Promise.all(
        sharedGroups.map(async (group) => ({
          ...group,
          expenses: await getGroupExpenses(group.id),
        })),
      )

      // 3. Compute settlements for the specified currency
      const directCurrency = getCurrency(input.currency)
      const settlements = computeFriendSettlements(
        currentUserId,
        friendUserId,
        sharedGroupsWithExpenses,
        directExpenses.length > 0
          ? [{ currency: directCurrency, expenses: directExpenses }]
          : undefined,
      )

      // 4. Filter non-zero buckets for this currency
      const bucketsForCurrency = settlements.filter(
        (s) =>
          s.amount > 0 &&
          (s.currency.code === input.currency ||
            s.currency.symbol === input.currency),
      )

      // 5. If only 1 bucket → reject (use per-bucket settle instead)
      if (bucketsForCurrency.length < 2) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'Settle-all requires at least 2 non-zero buckets. Use per-bucket settle instead.',
        })
      }

      // 6. Generate shared bundleId
      const bundleId = randomId()

      // 7. Create all entries in a single transaction
      const entries = await prisma.$transaction(
        bucketsForCurrency.map((bucket) => {
          const expenseId = randomId()
          return prisma.expense.create({
            data: {
              id: expenseId,
              groupId: bucket.groupId,
              expenseDate: new Date(),
              title: '',
              amount: bucket.amount,
              paidById: bucket.from,
              isReimbursement: true,
              splitMode: 'EVENLY',
              creationMethod: 'DEBT_CONSOLIDATION',
              bundleId,
              categoryId: 1, // Payment category
              paidFor: {
                create: {
                  userId: bucket.to,
                  shares: 1,
                },
              },
            },
            include: {
              paidBy: { select: { id: true, name: true } },
              paidFor: {
                include: { user: { select: { id: true, name: true } } },
              },
            },
          })
        }),
      )

      return { bundleId, entries }
    }),

  recordDirectPayment: protectedProcedure
    .input(
      z.object({
        friendId: z.string().min(1),
        amount: z.number().int().positive(),
        currency: z.string().min(1),
        fromUserId: z.string().min(1),
        toUserId: z.string().min(1),
        date: z.date().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const friend = await prisma.friend.findUnique({
        where: { id: input.friendId },
        select: { id: true, userId: true, friendUserId: true },
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
          message: 'Friend is not connected.',
        })
      }

      const currentUserId = ctx.user.id
      const friendUserId = friend.friendUserId

      // Validate fromUserId and toUserId form the correct pair
      const validPair =
        (input.fromUserId === currentUserId &&
          input.toUserId === friendUserId) ||
        (input.fromUserId === friendUserId && input.toUserId === currentUserId)

      if (!validPair) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            'fromUserId and toUserId must be the current user and the friend.',
        })
      }

      const expenseId = randomId()
      const expenseDate = input.date ?? new Date()

      const payment = await prisma.expense.create({
        data: {
          id: expenseId,
          groupId: null,
          expenseDate,
          title: '',
          amount: input.amount,
          paidById: input.fromUserId,
          isReimbursement: true,
          splitMode: 'EVENLY',
          creationMethod: 'PAYMENT',
          categoryId: 1, // Payment category
          paidFor: {
            create: {
              userId: input.toUserId,
              shares: 1,
            },
          },
        },
        include: {
          paidBy: { select: { id: true, name: true } },
          paidFor: {
            include: { user: { select: { id: true, name: true } } },
          },
        },
      })

      return payment
    }),
})
