import { getExpense } from '@/lib/api'
import { computeRecentCategoryTrends } from '@/lib/expense-detail-trends'
import { prisma } from '@/lib/prisma'
import { groupMemberProcedure } from '@/trpc/init'
import { ActivityType } from '@prisma/client'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

export const getGroupExpenseProcedure = groupMemberProcedure
  .input(z.object({ groupId: z.string().min(1), expenseId: z.string().min(1) }))
  .query(async ({ input: { groupId, expenseId } }) => {
    const expense = await getExpense(groupId, expenseId)
    if (!expense) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Expense not found',
      })
    }

    const [createActivity, lastUpdateActivity, trendExpenses] =
      await Promise.all([
        prisma.activity.findFirst({
          where: {
            groupId,
            expenseId,
            activityType: ActivityType.CREATE_EXPENSE,
          },
          select: { participantId: true, time: true },
          orderBy: { time: 'asc' },
        }),
        prisma.activity.findFirst({
          where: {
            groupId,
            expenseId,
            activityType: ActivityType.UPDATE_EXPENSE,
          },
          select: { participantId: true, time: true },
          orderBy: { time: 'desc' },
        }),
        prisma.expense.findMany({
          where: {
            groupId,
            isReimbursement: false,
            categoryId: expense.categoryId,
          },
          select: {
            amount: true,
            expenseDate: true,
            categoryId: true,
            isReimbursement: true,
          },
        }),
      ])

    let addedBy: { id: string; name: string } | null = null
    let addedAt = expense.createdAt

    if (createActivity?.participantId) {
      const user = await prisma.user.findUnique({
        where: { id: createActivity.participantId },
        select: { id: true, name: true },
      })
      if (user) {
        addedBy = user
      }
      addedAt = createActivity.time
    } else if (expense.paidBy) {
      addedBy = {
        id: expense.paidBy.id,
        name: expense.paidBy.name ?? expense.paidBy.email,
      }
    }

    let lastUpdatedBy: { id: string; name: string } | null = null
    let lastUpdatedAt: Date | null = null

    if (lastUpdateActivity?.participantId) {
      const user = await prisma.user.findUnique({
        where: { id: lastUpdateActivity.participantId },
        select: { id: true, name: true },
      })
      if (user) {
        lastUpdatedBy = user
      }
      lastUpdatedAt = lastUpdateActivity.time
    }

    const trends = computeRecentCategoryTrends(trendExpenses, {
      categoryId: expense.categoryId,
      referenceDate: expense.expenseDate,
    })

    return {
      expense,
      addedBy,
      addedAt,
      lastUpdatedBy,
      lastUpdatedAt,
      trends,
      categoryName: expense.category?.name ?? null,
    }
  })
