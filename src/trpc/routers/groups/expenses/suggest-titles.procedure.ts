import {
  getFrequentExpenseTitlesForGroup,
  searchExpenseTitleSuggestions,
} from '@/lib/frequent-expense-titles'
import { groupMemberProcedure } from '@/trpc/init'
import { z } from 'zod'

export const suggestExpenseTitlesProcedure = groupMemberProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      query: z.string(),
    }),
  )
  .query(async ({ input }) => {
    const normalizedQuery = input.query.toLowerCase().trim()

    if (normalizedQuery.length === 0) {
      const suggestions = await getFrequentExpenseTitlesForGroup(input.groupId)
      return { suggestions }
    }

    const suggestions = await searchExpenseTitleSuggestions(
      input.groupId,
      normalizedQuery,
    )

    return { suggestions }
  })
