import { prisma } from '@/lib/prisma'
import { groupMemberProcedure } from '@/trpc/init'
import { z } from 'zod'

export const suggestExpenseTitlesProcedure = groupMemberProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      query: z.string().min(1),
    }),
  )
  .query(async ({ input }) => {
    const normalizedQuery = input.query.toLowerCase().trim()

    const mappings = await prisma.expenseCategoryMapping.findMany({
      where: {
        groupId: input.groupId,
        normalizedTitle: {
          startsWith: normalizedQuery,
        },
      },
      select: {
        normalizedTitle: true,
        categoryId: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: 5,
    })

    return {
      suggestions: mappings.map((m) => ({
        title: m.normalizedTitle,
        categoryId: m.categoryId,
      })),
    }
  })
