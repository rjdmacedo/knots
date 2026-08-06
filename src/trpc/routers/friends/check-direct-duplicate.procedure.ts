import {
  type DuplicateCheckResult,
  hasReinforcementFactor,
  isDateProximate,
} from '@/lib/duplicate-expense-detection'
import { prisma } from '@/lib/prisma'
import { protectedProcedure } from '@/trpc/init'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

export const checkDirectDuplicateProcedure = protectedProcedure
  .input(
    z.object({
      friendId: z.string().min(1),
      title: z.string(),
      amount: z.number().int(),
      expenseDate: z.date(),
      categoryId: z.number().int().optional(),
      excludeExpenseId: z.string().optional(),
    }),
  )
  .query(async ({ ctx, input }): Promise<DuplicateCheckResult> => {
    const emptyResult: DuplicateCheckResult = {
      hasDuplicates: false,
      matches: [],
    }

    try {
      // 1. Verify friend ownership and resolve friendUserId
      const friend = await prisma.friend.findUnique({
        where: { id: input.friendId },
        select: { id: true, userId: true, friendUserId: true },
      })

      if (!friend || friend.userId !== ctx.user.id) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Friend not found.',
        })
      }

      if (!friend.friendUserId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Friend is not connected.',
        })
      }

      const currentUserId = ctx.user.id
      const friendUserId = friend.friendUserId

      // 2. Query by amount (mandatory factor) within the direct friend relationship
      const matchingExpenses = await prisma.expense.findMany({
        where: {
          groupId: null,
          amount: input.amount,
          id: input.excludeExpenseId
            ? { not: input.excludeExpenseId }
            : undefined,
          AND: [
            {
              OR: [
                { paidById: currentUserId },
                { paidFor: { some: { userId: currentUserId } } },
              ],
            },
            {
              OR: [
                { paidById: friendUserId },
                { paidFor: { some: { userId: friendUserId } } },
              ],
            },
          ],
        },
        select: {
          id: true,
          title: true,
          amount: true,
          expenseDate: true,
          categoryId: true,
        },
      })

      // 3. Filter in-memory: amount matches (from DB), plus at least one reinforcement factor
      const matches = matchingExpenses
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
      // Re-throw TRPCErrors (ownership/connection validation)
      if (error instanceof TRPCError) {
        throw error
      }
      // Return empty result on database errors (non-blocking)
      return emptyResult
    }
  })
