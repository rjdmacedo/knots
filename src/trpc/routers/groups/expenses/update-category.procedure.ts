import { updateExpenseCategory } from '@/lib/api'
import { notifyOnActivity } from '@/lib/push/notify-on-activity'
import { groupMemberProcedure } from '@/trpc/init'
import { ActivityType } from '@prisma/client'
import { z } from 'zod'

export const updateGroupExpenseCategoryProcedure = groupMemberProcedure
  .input(
    z.object({
      expenseId: z.string().min(1),
      groupId: z.string().min(1),
      categoryId: z.number().int().min(0),
    }),
  )
  .mutation(
    async ({ input: { expenseId, groupId, categoryId }, ctx: { user } }) => {
      const expense = await updateExpenseCategory(
        groupId,
        expenseId,
        categoryId,
        user.id,
      )

      notifyOnActivity(groupId, ActivityType.UPDATE_EXPENSE, {
        userId: user.id,
        expenseId: expense.id,
      })

      return { expenseId: expense.id, categoryId: expense.categoryId }
    },
  )
