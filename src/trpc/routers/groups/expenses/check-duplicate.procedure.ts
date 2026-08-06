import {
  type DuplicateCheckResult,
  hasReinforcementFactor,
  isDateProximate,
} from '@/lib/duplicate-expense-detection'
import { prisma } from '@/lib/prisma'
import { groupMemberProcedure } from '@/trpc/init'
import { z } from 'zod'

export const checkDuplicateExpenseProcedure = groupMemberProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      title: z.string(),
      amount: z.number().int(),
      expenseDate: z.date(),
      categoryId: z.number().int().optional(),
      excludeExpenseId: z.string().optional(),
    }),
  )
  .query(async ({ input }): Promise<DuplicateCheckResult> => {
    try {
      // Query by amount (mandatory factor) within the same group
      const expenses = await prisma.expense.findMany({
        where: {
          groupId: input.groupId,
          amount: input.amount,
          ...(input.excludeExpenseId
            ? { id: { not: input.excludeExpenseId } }
            : {}),
        },
        select: {
          id: true,
          title: true,
          amount: true,
          expenseDate: true,
          categoryId: true,
        },
      })

      // Filter in-memory: amount matches (from DB), plus at least one reinforcement factor
      const matches = expenses
        .filter((expense) => hasReinforcementFactor(input, expense))
        .map((expense) => ({
          id: expense.id,
          title: expense.title,
          amount: expense.amount,
          expenseDate: expense.expenseDate,
          categoryId: expense.categoryId,
          isDateProximate: isDateProximate(
            input.expenseDate,
            expense.expenseDate,
          ),
        }))

      return {
        hasDuplicates: matches.length > 0,
        matches,
      }
    } catch (error) {
      // Non-blocking: return no duplicates on database errors
      return { hasDuplicates: false, matches: [] }
    }
  })
