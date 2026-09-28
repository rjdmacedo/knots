import { addExpenseDocuments } from '@/lib/api'
import { groupMemberProcedure } from '@/trpc/init'
import { z } from 'zod'

const expenseDocumentSchema = z.object({
  id: z.string().min(1),
  url: z.string().url(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
})

export const addGroupExpenseDocumentsProcedure = groupMemberProcedure
  .input(
    z.object({
      expenseId: z.string().min(1),
      groupId: z.string().min(1),
      documents: z.array(expenseDocumentSchema).min(1),
    }),
  )
  .mutation(
    async ({ input: { expenseId, groupId, documents }, ctx: { user } }) => {
      const expense = await addExpenseDocuments(
        groupId,
        expenseId,
        documents,
        user.id,
      )

      return { expenseId: expense.id }
    },
  )
