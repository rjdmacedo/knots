import { analyzeKnotsImport } from '@/lib/knots-import'
import { groupMemberProcedure } from '@/trpc/init'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

export const previewKnotsImportProcedure = groupMemberProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      fileContent: z.string().min(1),
    }),
  )
  .mutation(async ({ input: { groupId, fileContent } }) => {
    try {
      return await analyzeKnotsImport(fileContent, groupId)
    } catch (error) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to analyze Knots export',
      })
    }
  })
