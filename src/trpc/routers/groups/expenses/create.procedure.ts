import { createExpense } from '@/lib/api'
import { upsertCategoryMapping } from '@/lib/category-mapping'
import { notifyOnActivity } from '@/lib/push/notify-on-activity'
import { expenseFormSchema } from '@/lib/schemas'
import { groupMemberProcedure } from '@/trpc/init'
import { ActivityType } from '@prisma/client'
import { z } from 'zod'

export const createGroupExpenseProcedure = groupMemberProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      expenseFormValues: expenseFormSchema,
    }),
  )
  .mutation(async ({ input: { groupId, expenseFormValues }, ctx }) => {
    const userId = ctx.user.id
    const expense = await createExpense(expenseFormValues, groupId)
    notifyOnActivity(groupId, ActivityType.CREATE_EXPENSE, {
      userId,
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
  })
