import { updateExpenseCategory } from '@/lib/api'
import { groupMemberProcedure } from '@/trpc/init'
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

      return { expenseId: expense.id, categoryId: expense.categoryId }
    },
  )
