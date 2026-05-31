import { updateExpense } from '@/lib/api'
import { upsertCategoryMapping } from '@/lib/category-mapping'
import { notifyOnActivity } from '@/lib/push/notify-on-activity'
import { expenseFormSchema } from '@/lib/schemas'
import { baseProcedure } from '@/trpc/init'
import { ActivityType } from '@prisma/client'
import { z } from 'zod'

export const updateGroupExpenseProcedure = baseProcedure
  .input(
    z.object({
      expenseId: z.string().min(1),
      groupId: z.string().min(1),
      expenseFormValues: expenseFormSchema,
      participantId: z.string().optional(),
    }),
  )
  .mutation(
    async ({
      input: { expenseId, groupId, expenseFormValues, participantId },
    }) => {
      const expense = await updateExpense(
        groupId,
        expenseId,
        expenseFormValues,
        participantId,
      )
      notifyOnActivity(groupId, ActivityType.UPDATE_EXPENSE, {
        participantId,
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
