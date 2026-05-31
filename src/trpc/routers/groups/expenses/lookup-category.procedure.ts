import { lookupCategoryMapping } from '@/lib/category-mapping'
import { baseProcedure } from '@/trpc/init'
import { z } from 'zod'

export const lookupCategoryMappingProcedure = baseProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      title: z.string().min(1),
    }),
  )
  .query(async ({ input }) => {
    const categoryId = await lookupCategoryMapping({
      groupId: input.groupId,
      title: input.title,
    })
    return { categoryId }
  })
