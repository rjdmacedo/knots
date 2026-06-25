import { getFrequentExpenseTitlesForUser } from '@/lib/frequent-expense-titles'
import { prisma } from '@/lib/prisma'
import { groupMemberProcedure } from '@/trpc/init'
import { z } from 'zod'

export const suggestExpenseTitlesProcedure = groupMemberProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      query: z.string(),
    }),
  )
  .query(async ({ ctx, input }) => {
    const normalizedQuery = input.query.toLowerCase().trim()

    if (normalizedQuery.length === 0) {
      const suggestions = await getFrequentExpenseTitlesForUser(ctx.user.id)
      return { suggestions }
    }

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
      take: 10,
    })

    return {
      suggestions: mappings.map((m) => ({
        title: m.normalizedTitle,
        categoryId: m.categoryId,
      })),
    }
  })
