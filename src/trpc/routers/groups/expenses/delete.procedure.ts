import { deleteExpense } from '@/lib/api'
import { notifyOnActivity } from '@/lib/push/notify-on-activity'
import { protectedProcedure } from '@/trpc/init'
import { ActivityType } from '@prisma/client'
import { z } from 'zod'

export const deleteGroupExpenseProcedure = protectedProcedure
  .input(
    z.object({
      expenseId: z.string().min(1),
      groupId: z.string().min(1),
    }),
  )
  .mutation(async ({ input: { expenseId, groupId }, ctx: { user } }) => {
    await deleteExpense(groupId, expenseId, user.id)
    notifyOnActivity(groupId, ActivityType.DELETE_EXPENSE, {
      userId: user.id,
      expenseId,
    })
    return {}
  })
