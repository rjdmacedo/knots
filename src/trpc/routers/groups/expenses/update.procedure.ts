import { updateExpense } from '@/lib/api'
import { upsertCategoryMapping } from '@/lib/category-mapping'
import { notifyOnActivity } from '@/lib/push/notify-on-activity'
import { expenseFormSchema } from '@/lib/schemas'
import { protectedProcedure } from '@/trpc/init'
import { ActivityType } from '@prisma/client'
import { z } from 'zod'

export const updateGroupExpenseProcedure = protectedProcedure
  .input(
    z.object({
      expenseId: z.string().min(1),
      groupId: z.string().min(1),
      expenseFormValues: expenseFormSchema,
    }),
  )
  .mutation(
    async ({
      input: { expenseId, groupId, expenseFormValues },
      ctx: { user },
    }) => {
      const expense = await updateExpense(
        groupId,
        expenseId,
        expenseFormValues,
        user.id,
      )
      notifyOnActivity(groupId, ActivityType.UPDATE_EXPENSE, {
        userId: user.id,
        expenseId: expense.id,
      })

      // Upsert category mapping (secondary operation - must not block the main update)
      try {
        await upsertCategoryMapping({
          groupId,
          title: expenseFormValues.title,
          categoryId: expenseFormValues.category,
          isReimbursement: expenseFormValues.isReimbursement,
        })
      } catch (error) {
        console.error('Failed to upsert category mapping:', error)
      }

      return { expenseId: expense.id }
    },
  )
