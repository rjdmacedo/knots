import { createExpense } from '@/lib/api'
import { upsertCategoryMapping } from '@/lib/category-mapping'
import { notifyOnActivity } from '@/lib/push/notify-on-activity'
import { expenseFormSchema } from '@/lib/schemas'
import { baseProcedure } from '@/trpc/init'
import { ActivityType } from '@prisma/client'
import { z } from 'zod'

export const createGroupExpenseProcedure = baseProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      expenseFormValues: expenseFormSchema,
      participantId: z.string().optional(),
    }),
  )
  .mutation(
    async ({ input: { groupId, expenseFormValues, participantId } }) => {
      const expense = await createExpense(
        expenseFormValues,
        groupId,
        participantId,
      )
      notifyOnActivity(groupId, ActivityType.CREATE_EXPENSE, {
        participantId,
        expenseId: expense.id,
      })

      // Upsert category mapping (secondary operation - must not block expense creation)
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
