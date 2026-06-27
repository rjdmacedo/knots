import {
  buildRecurringExpenseLinkCreate,
  getGroupExpenses,
  getRecurringExpenseLinkUpdates,
  logActivity,
  randomId,
} from '@/lib/api'
import { isPaymentCategory } from '@/lib/categories'
import { upsertCategoryMapping } from '@/lib/category-mapping'
import { getCurrency } from '@/lib/currency'
import { computeRecentCategoryTrends } from '@/lib/expense-detail-trends'
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
import { buildFriendTimeline } from '@/lib/friend-timeline'
import {
  acceptFriendRequest,
  addFriendByEmail,
  declineFriendRequest,
  listFriends,
  listIncomingFriendRequests,
  removeFriend,
} from '@/lib/friends'
import { assertPaymentEditable } from '@/lib/payments'
import { prisma } from '@/lib/prisma'
import { notifyOnActivity } from '@/lib/push/notify-on-activity'
import { expenseFormSchema } from '@/lib/schemas'
import { amountAsMinorUnits } from '@/lib/utils'
import { createTRPCRouter, protectedProcedure } from '@/trpc/init'
import { ActivityType, RecurrenceRule } from '@prisma/client'
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

      const currentUser = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { preferredCurrency: true },
      })
      const directCurrency = getCurrency(
        currentUser?.preferredCurrency || 'EUR',
      )

      const [sharedGroups, directExpenses] = await Promise.all([
        getSharedGroupsForUsers(ctx.user.id, friend.friendUserId),
        getDirectExpensesBetweenUsers(ctx.user.id, friend.friendUserId),
      ])

      const sharedGroupsWithExpenses = await Promise.all(
        sharedGroups.map(async (group) => ({
          ...group,
          expenses: await getGroupExpenses(group.id),
        })),
      )

      const directBucket =
        directExpenses.length > 0
          ? [{ currency: directCurrency, expenses: directExpenses }]
          : undefined

      const balances = computeFriendBalance(
        ctx.user.id,
        friend.friendUserId,
        sharedGroupsWithExpenses,
        directBucket,
      )

      const settlements = computeFriendSettlements(
        ctx.user.id,
        friend.friendUserId,
        sharedGroupsWithExpenses,
        directBucket,
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

      const currentUser = await prisma.user.findUnique({
        where: { id: ctx.user.id },
        select: { preferredCurrency: true },
      })
      const directCurrency = getCurrency(
        currentUser?.preferredCurrency || 'EUR',
      )

      const [sharedGroups, directExpenses] = await Promise.all([
        getSharedGroupsForUsers(ctx.user.id, friend.friendUserId),
        getDirectExpensesBetweenUsers(ctx.user.id, friend.friendUserId),
      ])

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
        directExpenses.length > 0
          ? [{ currency: directCurrency, expenses: directExpenses }]
          : undefined,
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

      // 7. Fetch all payment expenses (isReimbursement = true) between current user and friend
      const paymentExpenses = await prisma.expense.findMany({
        select: {
          amount: true,
          category: true,
          createdAt: true,
          expenseDate: true,
          id: true,
          isReimbursement: true,
          paidBy: { select: { id: true, name: true } },
          paidFor: {
            select: {
              user: { select: { id: true, name: true } },
              shares: true,
            },
          },
          splitMode: true,
          recurrenceRule: true,
          title: true,
          notes: true,
          _count: { select: { documents: true } },
          groupId: true,
          creationMethod: true,
          bundleId: true,
        },
        where: {
          isReimbursement: true,
          paidFor: {
            some: {
              userId: {
                in: [ctx.user.id, friend.friendUserId],
              },
            },
          },
          paidBy: {
            id: {
              in: [ctx.user.id, friend.friendUserId],
            },
          },
        },
        orderBy: { expenseDate: 'desc' },
      })

      // 8. Build timeline entries
      const timelineEntries = buildFriendTimeline({
        currentUserId: ctx.user.id,
        friendUserId: friend.friendUserId,
        sharedGroups: sharedGroupsWithExpenses,
        directExpenses: directExpenses.map((exp) => ({
          expense: exp,
          currency: directCurrency.symbol,
          currencyCode: directCurrency.code || null,
        })),
        payments: paymentExpenses
          .filter((exp) => {
            // Only include payments where both users are involved
            const paidByThisUser =
              exp.paidBy.id === ctx.user.id ||
              exp.paidBy.id === friend.friendUserId
            const paidForThisUser = exp.paidFor.some(
              (p) =>
                p.user.id === ctx.user.id || p.user.id === friend.friendUserId,
            )
            return paidByThisUser && paidForThisUser
          })
          .map((exp) => {
            const group = sharedGroupsWithExpenses.find(
              (g) => g.id === exp.groupId,
            )
            return {
              expense: exp,
              groupId: exp.groupId,
              groupName: group?.name ?? null,
              currency: group?.currency ?? directCurrency.symbol,
              currencyCode:
                group?.currencyCode ?? (directCurrency.code || null),
              creationMethod: exp.creationMethod,
              bundleId: exp.bundleId,
            }
          }),
      })

      // 9. Apply pagination
      const offset = input.offset ?? 0
      const limit = input.limit ?? 50
      const entries = timelineEntries.slice(offset, offset + limit)

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
        recurrenceRule: z
          .nativeEnum(RecurrenceRule)
          .default(RecurrenceRule.NONE),
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
          recurrenceRule: input.recurrenceRule,
          recurringExpenseLink: buildRecurringExpenseLinkCreate(
            input.recurrenceRule,
            expenseDate,
            null,
          ),
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

  createGlobalExpense: protectedProcedure
    .input(
      z.object({
        title: z.string().min(1),
        amount: z.number().nonnegative(),
        currency: z.string().min(1),
        paidById: z.string().min(1),
        expenseDate: z.date().optional(),
        notes: z.string().optional(),
        groupId: z.string().nullable(),
        friendIds: z.array(z.string()), // Friend.id values
        splitMode: z
          .enum(['EVENLY', 'BY_SHARES', 'BY_PERCENTAGE', 'BY_AMOUNT'])
          .default('EVENLY'),
        paidFor: z
          .array(
            z.object({
              participant: z.string(), // Friend.id or User.id
              shares: z.number(),
            }),
          )
          .optional(),
        category: z.number().int().default(0),
        documents: z
          .array(
            z.object({
              id: z.string(),
              url: z.string().url(),
              width: z.number().int().min(1),
              height: z.number().int().min(1),
            }),
          )
          .default([]),
        recurrenceRule: z
          .nativeEnum(RecurrenceRule)
          .default(RecurrenceRule.NONE),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const currencyObj = getCurrency(input.currency)
      const totalAmountMinor = amountAsMinorUnits(input.amount, currencyObj)

      // Map from Friend.id to User.id to resolve connected/soft users
      const friendIdToUserIdMap = new Map<string, string>()

      for (const friendId of input.friendIds) {
        const friendRecord = await prisma.friend.findUnique({
          where: { id: friendId },
        })
        if (!friendRecord) continue

        let targetUserId = friendRecord.friendUserId
        if (!targetUserId) {
          let targetUser = await prisma.user.findUnique({
            where: { email: friendRecord.email },
          })
          if (!targetUser) {
            const { generateUniqueUsername, usernameFromEmail } =
              await import('@/lib/slugify')
            const username = await generateUniqueUsername(
              usernameFromEmail(friendRecord.email),
            )
            targetUser = await prisma.user.create({
              data: {
                name: friendRecord.name || friendRecord.email.split('@')[0],
                username,
                email: friendRecord.email,
                passwordHash: '',
              },
            })
          }
          await prisma.friend.update({
            where: { id: friendRecord.id },
            data: { friendUserId: targetUser.id },
          })
          targetUserId = targetUser.id
        }
        friendIdToUserIdMap.set(friendId, targetUserId)
      }

      // If the payer is one of the selected friends, map their Friend.id to User.id
      const paidByUserId =
        friendIdToUserIdMap.get(input.paidById) ?? input.paidById

      // Build the unique set of all participants as User.id
      const resolvedParticipantUserIds = new Set<string>()
      resolvedParticipantUserIds.add(paidByUserId)
      resolvedParticipantUserIds.add(ctx.user.id)

      friendIdToUserIdMap.forEach((uid) => {
        resolvedParticipantUserIds.add(uid)
      })

      if (input.groupId) {
        const memberships = await prisma.groupMembership.findMany({
          where: { groupId: input.groupId },
          select: { userId: true },
        })
        for (const m of memberships) {
          resolvedParticipantUserIds.add(m.userId)
        }
      }

      const participantIds = Array.from(resolvedParticipantUserIds)
      const sharesMap = new Map<string, number>()

      // Translate input.paidFor participants from Friend.id to User.id
      const resolvedPaidForInput = input.paidFor?.map((pf) => ({
        participant: friendIdToUserIdMap.get(pf.participant) ?? pf.participant,
        shares: pf.shares,
      }))

      if (input.splitMode === 'EVENLY') {
        const N = participantIds.length
        const baseShare = Math.floor(totalAmountMinor / N)
        const remainder = totalAmountMinor % N
        for (let i = 0; i < N; i++) {
          sharesMap.set(participantIds[i], baseShare + (i < remainder ? 1 : 0))
        }
      } else if (input.splitMode === 'BY_SHARES' && resolvedPaidForInput) {
        const totalShares = resolvedPaidForInput.reduce(
          (sum, pf) => sum + pf.shares,
          0,
        )
        let allocatedAmount = 0
        const sortedPaidFor = [...resolvedPaidForInput].sort(
          (a, b) => b.shares - a.shares,
        )

        for (let i = 0; i < sortedPaidFor.length; i++) {
          const pf = sortedPaidFor[i]
          let shareAmount = 0
          if (i === sortedPaidFor.length - 1) {
            shareAmount = totalAmountMinor - allocatedAmount
          } else {
            shareAmount = Math.round(
              (totalAmountMinor * pf.shares) / totalShares,
            )
            allocatedAmount += shareAmount
          }
          sharesMap.set(pf.participant, shareAmount)
        }
      } else if (input.splitMode === 'BY_PERCENTAGE' && resolvedPaidForInput) {
        let allocatedAmount = 0
        const sortedPaidFor = [...resolvedPaidForInput].sort(
          (a, b) => b.shares - a.shares,
        )

        for (let i = 0; i < sortedPaidFor.length; i++) {
          const pf = sortedPaidFor[i]
          let shareAmount = 0
          if (i === sortedPaidFor.length - 1) {
            shareAmount = totalAmountMinor - allocatedAmount
          } else {
            shareAmount = Math.round((totalAmountMinor * pf.shares) / 100)
            allocatedAmount += shareAmount
          }
          sharesMap.set(pf.participant, shareAmount)
        }
      } else if (input.splitMode === 'BY_AMOUNT' && resolvedPaidForInput) {
        let sum = 0
        for (const pf of resolvedPaidForInput) {
          const minorAmount = amountAsMinorUnits(pf.shares, currencyObj)
          sharesMap.set(pf.participant, minorAmount)
          sum += minorAmount
        }
        if (sum !== totalAmountMinor && resolvedPaidForInput.length > 0) {
          const diff = totalAmountMinor - sum
          const firstParticipant = resolvedPaidForInput[0].participant
          sharesMap.set(
            firstParticipant,
            (sharesMap.get(firstParticipant) ?? 0) + diff,
          )
        }
      } else {
        const N = participantIds.length
        const baseShare = Math.floor(totalAmountMinor / N)
        const remainder = totalAmountMinor % N
        for (let i = 0; i < N; i++) {
          sharesMap.set(participantIds[i], baseShare + (i < remainder ? 1 : 0))
        }
      }

      const createdExpenseIds: string[] = []
      const expenseDate = input.expenseDate ?? new Date()

      // A. Create Group Expense if groupId is selected
      if (input.groupId) {
        const memberships = await prisma.groupMembership.findMany({
          where: { groupId: input.groupId },
          select: { userId: true },
        })
        const groupMemberUserIds = new Set(memberships.map((m) => m.userId))
        const groupParticipants = participantIds.filter((id) =>
          groupMemberUserIds.has(id),
        )

        if (groupParticipants.length > 0) {
          const groupAmountMinor = groupParticipants.reduce(
            (sum, id) => sum + (sharesMap.get(id) ?? 0),
            0,
          )

          if (groupAmountMinor > 0) {
            const expenseId = randomId()

            await prisma.expense.create({
              data: {
                id: expenseId,
                groupId: input.groupId,
                expenseDate,
                title: input.title,
                amount: groupAmountMinor,
                paidById: paidByUserId,
                isReimbursement: false,
                splitMode: 'BY_AMOUNT',
                categoryId: input.category,
                notes: input.notes ?? null,
                recurrenceRule: input.recurrenceRule,
                recurringExpenseLink: buildRecurringExpenseLinkCreate(
                  input.recurrenceRule,
                  expenseDate,
                  input.groupId,
                ),
                paidFor: {
                  createMany: {
                    data: groupParticipants.map((userId) => ({
                      userId,
                      shares: sharesMap.get(userId) ?? 0,
                    })),
                  },
                },
                documents: {
                  createMany: {
                    data: input.documents.map((doc) => ({
                      id: randomId(),
                      url: doc.url,
                      width: doc.width,
                      height: doc.height,
                    })),
                  },
                },
              },
            })

            try {
              await upsertCategoryMapping({
                groupId: input.groupId,
                title: input.title,
                categoryId: input.category,
                isReimbursement: false,
              })
            } catch (err) {
              console.error('Failed to upsert category mapping:', err)
            }

            await logActivity(input.groupId, ActivityType.CREATE_EXPENSE, {
              userId: ctx.user.id,
              expenseId,
              data: input.title,
              changes: [
                { field: 'title', oldValue: null, newValue: input.title },
                {
                  field: 'amount',
                  oldValue: null,
                  newValue: String(groupAmountMinor),
                },
                { field: 'paidBy', oldValue: null, newValue: paidByUserId },
              ],
            })
            notifyOnActivity(input.groupId, ActivityType.CREATE_EXPENSE, {
              userId: ctx.user.id,
              expenseId,
            })

            createdExpenseIds.push(expenseId)
          }
        }
      }

      // B. Create Direct Expenses for participants outside the group (excluding the payer)
      const handledUserIds = new Set<string>()
      if (input.groupId) {
        const memberships = await prisma.groupMembership.findMany({
          where: { groupId: input.groupId },
          select: { userId: true },
        })
        for (const m of memberships) {
          handledUserIds.add(m.userId)
        }
      }

      const directParticipants = participantIds.filter(
        (id) => !handledUserIds.has(id) && id !== paidByUserId,
      )

      for (const dId of directParticipants) {
        const directShareAmount = sharesMap.get(dId) ?? 0
        if (directShareAmount > 0) {
          const expenseId = randomId()

          await prisma.expense.create({
            data: {
              id: expenseId,
              groupId: null,
              expenseDate,
              title: input.title,
              amount: directShareAmount * 2,
              paidById: paidByUserId,
              isReimbursement: false,
              splitMode: 'EVENLY',
              categoryId: input.category,
              notes: input.notes ?? null,
              recurrenceRule: input.recurrenceRule,
              recurringExpenseLink: buildRecurringExpenseLinkCreate(
                input.recurrenceRule,
                expenseDate,
                null,
              ),
              paidFor: {
                createMany: {
                  data: [
                    { userId: paidByUserId, shares: 1 },
                    { userId: dId, shares: 1 },
                  ],
                },
              },
              documents: {
                createMany: {
                  data: input.documents.map((doc) => ({
                    id: randomId(),
                    url: doc.url,
                    width: doc.width,
                    height: doc.height,
                  })),
                },
              },
            },
          })
          createdExpenseIds.push(expenseId)
        }
      }

      return { success: true, expenseIds: createdExpenseIds }
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

      assertPaymentEditable(expense)

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

  getDirectExpense: protectedProcedure
    .input(z.object({ expenseId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const expense = await prisma.expense.findFirst({
        where: { id: input.expenseId, groupId: null },
        include: {
          paidBy: { select: { id: true, name: true, email: true } },
          paidFor: {
            include: {
              user: { select: { id: true, name: true, email: true } },
            },
          },
          category: true,
          documents: true,
          recurringExpenseLink: true,
        },
      })

      if (!expense) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Direct expense not found.',
        })
      }

      const isInvolved =
        expense.paidById === ctx.user.id ||
        expense.paidFor.some((pf) => pf.userId === ctx.user.id)

      if (!isInvolved) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You do not have access to this expense.',
        })
      }

      const currentUserId = ctx.user.id
      const otherParticipant =
        expense.paidById === currentUserId
          ? expense.paidFor.find((pf) => pf.userId !== currentUserId)?.user
          : expense.paidBy

      if (!otherParticipant) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Could not resolve the other participant.',
        })
      }

      const friendRecord = await prisma.friend.findFirst({
        where: {
          userId: currentUserId,
          friendUserId: otherParticipant.id,
        },
        select: {
          id: true,
          name: true,
          email: true,
          friendUserId: true,
          friend: { select: { name: true, username: true } },
        },
      })

      const friend = friendRecord
        ? {
            id: friendRecord.id,
            email: friendRecord.email,
            name:
              friendRecord.name ??
              friendRecord.friend?.name ??
              friendRecord.email.split('@')[0],
            friendUserId: friendRecord.friendUserId,
            friendUsername: friendRecord.friend?.username ?? null,
            hasAccount: friendRecord.friendUserId !== null,
            status: 'connected' as const,
          }
        : null

      const creator = await prisma.user.findUnique({
        where: { id: expense.paidById },
        select: { preferredCurrency: true },
      })
      const currency = creator?.preferredCurrency || 'EUR'

      const directExpenses = !expense.isReimbursement
        ? await getDirectExpensesBetweenUsers(
            currentUserId,
            otherParticipant.id,
          )
        : []

      const trends = computeRecentCategoryTrends(
        directExpenses.map((entry) => ({
          amount: entry.amount,
          expenseDate: entry.expenseDate,
          categoryId: entry.category?.id ?? 0,
          isReimbursement: entry.isReimbursement,
        })),
        {
          categoryId: expense.categoryId,
          referenceDate: expense.expenseDate,
        },
      )

      return {
        expense,
        friend,
        currency,
        addedBy: {
          id: expense.paidBy.id,
          name: expense.paidBy.name ?? expense.paidBy.email,
        },
        addedAt: expense.createdAt,
        trends,
        categoryName: expense.category?.name ?? null,
      }
    }),

  deleteDirectExpense: protectedProcedure
    .input(z.object({ expenseId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const expense = await prisma.expense.findFirst({
        where: { id: input.expenseId, groupId: null },
        select: {
          id: true,
          isReimbursement: true,
          creationMethod: true,
          bundleId: true,
          paidById: true,
          paidFor: { select: { userId: true } },
        },
      })

      if (!expense) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Direct expense not found.',
        })
      }

      const isInvolved =
        expense.paidById === ctx.user.id ||
        expense.paidFor.some((pf) => pf.userId === ctx.user.id)

      if (!isInvolved) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You cannot delete this expense.',
        })
      }

      if (expense.isReimbursement) {
        assertPaymentEditable(expense)
      }

      await prisma.expense.delete({
        where: { id: input.expenseId },
      })

      return { success: true }
    }),

  updateDirectExpense: protectedProcedure
    .input(
      z.object({
        expenseId: z.string().min(1),
        expenseFormValues: expenseFormSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { expenseId, expenseFormValues } = input

      const existingExpense = await prisma.expense.findFirst({
        where: { id: expenseId, groupId: null },
        include: {
          paidBy: { select: { id: true } },
          paidFor: { select: { userId: true, shares: true, expenseId: true } },
          documents: true,
          recurringExpenseLink: true,
        },
      })

      if (!existingExpense) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Expense not found: ${expenseId}`,
        })
      }

      const isInvolved =
        existingExpense.paidById === ctx.user.id ||
        existingExpense.paidFor.some((pf) => pf.userId === ctx.user.id)

      if (!isInvolved) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You cannot edit this expense.',
        })
      }

      assertPaymentEditable(existingExpense)

      if (
        existingExpense.isReimbursement &&
        !expenseFormValues.isReimbursement
      ) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'A payment cannot be converted into an expense.',
        })
      }

      await prisma.expense.update({
        where: { id: expenseId },
        data: {
          expenseDate: expenseFormValues.expenseDate,
          amount: expenseFormValues.amount,
          originalAmount: expenseFormValues.originalAmount,
          originalCurrency: expenseFormValues.originalCurrency,
          conversionRate: expenseFormValues.conversionRate,
          title: expenseFormValues.title,
          categoryId: expenseFormValues.category,
          paidById: expenseFormValues.paidBy,
          splitMode: expenseFormValues.splitMode,
          recurrenceRule: expenseFormValues.recurrenceRule,
          recurringExpenseLink: getRecurringExpenseLinkUpdates(
            existingExpense,
            expenseFormValues.recurrenceRule as RecurrenceRule,
            expenseFormValues.expenseDate,
          ),
          paidFor: {
            create: expenseFormValues.paidFor
              .filter(
                (p) =>
                  !existingExpense.paidFor.some(
                    (pp) => pp.userId === p.participant,
                  ),
              )
              .map((paidFor) => ({
                userId: paidFor.participant,
                shares: paidFor.shares,
              })),
            update: expenseFormValues.paidFor.map((paidFor) => ({
              where: {
                expenseId_userId: {
                  expenseId,
                  userId: paidFor.participant,
                },
              },
              data: {
                shares: paidFor.shares,
              },
            })),
            deleteMany: existingExpense.paidFor
              .filter(
                (paidFor) =>
                  !expenseFormValues.paidFor.some(
                    (pf) => pf.participant === paidFor.userId,
                  ),
              )
              .map((pf) => ({ expenseId: pf.expenseId, userId: pf.userId })),
          },
          isReimbursement: expenseFormValues.isReimbursement,
          documents: {
            connectOrCreate: expenseFormValues.documents.map((doc) => ({
              create: doc,
              where: { id: doc.id },
            })),
            deleteMany: existingExpense.documents
              .filter(
                (existingDoc) =>
                  !expenseFormValues.documents.some(
                    (doc) => doc.id === existingDoc.id,
                  ),
              )
              .map((doc) => ({
                id: doc.id,
              })),
          },
          notes: expenseFormValues.notes,
        },
      })

      return { success: true }
    }),

  addDirectExpenseDocuments: protectedProcedure
    .input(
      z.object({
        expenseId: z.string().min(1),
        documents: z
          .array(
            z.object({
              id: z.string().min(1),
              url: z.string().url(),
              width: z.number().int().positive(),
              height: z.number().int().positive(),
            }),
          )
          .min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existingExpense = await prisma.expense.findFirst({
        where: { id: input.expenseId, groupId: null },
        include: { documents: true, paidFor: { select: { userId: true } } },
      })

      if (!existingExpense) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Direct expense not found.',
        })
      }

      const isInvolved =
        existingExpense.paidById === ctx.user.id ||
        existingExpense.paidFor.some((pf) => pf.userId === ctx.user.id)

      if (!isInvolved) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You cannot edit this expense.',
        })
      }

      await prisma.expense.update({
        where: { id: input.expenseId },
        data: {
          documents: {
            connectOrCreate: input.documents.map((doc) => ({
              create: doc,
              where: { id: doc.id },
            })),
          },
        },
      })

      return { expenseId: input.expenseId }
    }),

  updateDirectExpenseCategory: protectedProcedure
    .input(
      z.object({
        expenseId: z.string().min(1),
        categoryId: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const expense = await prisma.expense.findFirst({
        where: { id: input.expenseId, groupId: null },
        select: {
          id: true,
          paidById: true,
          isReimbursement: true,
          creationMethod: true,
          bundleId: true,
          categoryId: true,
          paidFor: { select: { userId: true } },
        },
      })

      if (!expense || expense.isReimbursement) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Expense not found: ${input.expenseId}`,
        })
      }

      assertPaymentEditable(expense)

      if (isPaymentCategory(input.categoryId)) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Payment is not a valid category for expenses.',
        })
      }

      const isInvolved =
        expense.paidById === ctx.user.id ||
        expense.paidFor.some((pf) => pf.userId === ctx.user.id)

      if (!isInvolved) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'You cannot edit this expense.',
        })
      }

      if (expense.categoryId === input.categoryId) {
        return { expenseId: expense.id, categoryId: expense.categoryId }
      }

      await prisma.expense.update({
        where: { id: input.expenseId },
        data: { categoryId: input.categoryId },
      })

      return { expenseId: expense.id, categoryId: input.categoryId }
    }),
})
