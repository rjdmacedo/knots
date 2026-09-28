import { deleteExpense } from '@/lib/api'
import { groupMemberProcedure } from '@/trpc/init'
import { z } from 'zod'

export const deleteGroupExpenseProcedure = groupMemberProcedure
  .input(
    z.object({
      expenseId: z.string().min(1),
      groupId: z.string().min(1),
    }),
  )
  .mutation(async ({ input: { expenseId, groupId }, ctx: { user } }) => {
    await deleteExpense(groupId, expenseId, user.id)
    return {}
  })
