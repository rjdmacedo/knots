import { createExpense } from '@/lib/api'
import {
  addMembersFromKnotsImport,
  memberToAddSchema,
} from '@/lib/knots-import-members'
import { parseSplitwiseCSV } from '@/lib/splitwise-import'
import { groupMemberProcedure } from '@/trpc/init'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

export const importSplitwiseCSVProcedure = groupMemberProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      csvContent: z.string().min(1),
      membersToAdd: z.array(memberToAddSchema).default([]),
      /** Splitwise CSV column name → group user ID */
      participantMappings: z.record(z.string(), z.string()).default({}),
    }),
  )
  .mutation(
    async ({
      input: { groupId, csvContent, membersToAdd, participantMappings },
      ctx,
    }) => {
      try {
        const csvNameToUserId: Record<string, string> = {
          ...participantMappings,
        }

        if (membersToAdd.length > 0) {
          const added = await addMembersFromKnotsImport({
            groupId,
            requesterUserId: ctx.user.id,
            membersToAdd,
          })
          for (const { exportName, userId } of added) {
            csvNameToUserId[exportName] = userId
          }
        }

        const parsedExpenses = await parseSplitwiseCSV(csvContent, groupId, {
          csvNameToUserId,
        })

        const createdExpenses = []
        for (const expenseData of parsedExpenses) {
          const expense = await createExpense(expenseData, groupId)
          createdExpenses.push(expense)
        }

        return {
          success: true,
          importedCount: createdExpenses.length,
          addedMembersCount: membersToAdd.length,
        }
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message:
            error instanceof Error ? error.message : 'Failed to import CSV',
        })
      }
    },
  )
