import { analyzeSplitwiseImport } from '@/lib/splitwise-import'
import { protectedProcedure } from '@/trpc/init'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

export const previewSplitwiseImportProcedure = protectedProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      csvContent: z.string().min(1),
    }),
  )
  .mutation(async ({ input: { groupId, csvContent } }) => {
    try {
      return await analyzeSplitwiseImport(csvContent, groupId)
    } catch (error) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to analyze Splitwise CSV',
      })
    }
  })
