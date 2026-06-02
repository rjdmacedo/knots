import { isAbortError, throwIfAborted } from '@/lib/abort-signal'
import { createExpense } from '@/lib/api'
import { parseKnotsExport } from '@/lib/knots-import'
import {
  addMembersFromKnotsImport,
  memberToAddSchema,
} from '@/lib/knots-import-members'
import { prisma } from '@/lib/prisma'
import { groupMemberProcedure } from '@/trpc/init'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

async function rollbackImportedExpenses(expenseIds: string[]) {
  if (expenseIds.length === 0) {
    return
  }

  const activities = await prisma.activity.findMany({
    where: { expenseId: { in: expenseIds } },
    select: { id: true },
  })

  await prisma.$transaction([
    prisma.activityChange.deleteMany({
      where: { activityId: { in: activities.map((activity) => activity.id) } },
    }),
    prisma.activity.deleteMany({
      where: { expenseId: { in: expenseIds } },
    }),
    prisma.expense.deleteMany({
      where: { id: { in: expenseIds } },
    }),
  ])
}

export const importKnotsProcedure = groupMemberProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      fileContent: z.string().min(1),
      membersToAdd: z.array(memberToAddSchema).default([]),
    }),
  )
  .mutation(
    async ({ input: { groupId, fileContent, membersToAdd }, ctx, signal }) => {
      const createdExpenseIds: string[] = []

      try {
        throwIfAborted(signal)

        if (membersToAdd.length > 0) {
          await addMembersFromKnotsImport({
            groupId,
            requesterUserId: ctx.user.id,
            membersToAdd,
          })
        }

        throwIfAborted(signal)

        const parsedExpenses = await parseKnotsExport(fileContent, groupId)

        for (const expenseData of parsedExpenses) {
          throwIfAborted(signal)
          const expense = await createExpense(expenseData, groupId)
          createdExpenseIds.push(expense.id)
        }

        return {
          success: true,
          importedCount: createdExpenseIds.length,
          addedMembersCount: membersToAdd.length,
        }
      } catch (error) {
        if (isAbortError(error) || signal?.aborted) {
          await rollbackImportedExpenses(createdExpenseIds)
          throw new TRPCError({
            code: 'CLIENT_CLOSED_REQUEST',
            message: 'Import cancelled',
          })
        }

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            error instanceof Error
              ? error.message
              : 'Failed to import Knots export',
        })
      }
    },
  )
