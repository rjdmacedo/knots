import { getGroup, getGroupExpenses } from '@/lib/api'
import {
  computeAggregateMetrics,
  computeCategoryBreakdown,
  computeDailyAverage,
  computeExpenseDistribution,
  computeMonthOverMonth,
  computeNetBalances,
  computePaidVsSharePercentages,
  computeParticipantRanking,
  computeSpendingOverTime,
} from '@/lib/stats'
import {
  getTotalActiveUserPaidFor,
  getTotalActiveUserShare,
  getTotalGroupSpending,
} from '@/lib/totals'
import { baseProcedure } from '@/trpc/init'
import { z } from 'zod'

export const getGroupStatsProcedure = baseProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      /** User ID to compute per-user statistics for (optional) */
      participantId: z.string().optional(),
    }),
  )
  .query(async ({ input: { groupId, participantId: userId } }) => {
    const expenses = await getGroupExpenses(groupId)
    const group = await getGroup(groupId)
    const members = (group?.participants ?? []).map((p) => ({
      id: p.id,
      name: p.name,
    }))

    const totalGroupSpendings = getTotalGroupSpending(expenses)

    const totalParticipantSpendings =
      userId !== undefined
        ? getTotalActiveUserPaidFor(userId, expenses)
        : undefined
    const totalParticipantShare =
      userId !== undefined
        ? getTotalActiveUserShare(userId, expenses)
        : undefined

    // Compute enhanced stats using group members (Users via GroupMembership)
    const categoryBreakdown = computeCategoryBreakdown(expenses)
    const participantRanking = computeParticipantRanking(expenses, members)
    const expenseDistribution = computeExpenseDistribution(expenses, members)
    const spendingOverTime = computeSpendingOverTime(expenses)
    const monthOverMonth = computeMonthOverMonth(spendingOverTime)
    const dailyAverage = computeDailyAverage(expenses)
    const aggregateMetrics = computeAggregateMetrics(expenses)
    const netBalances = computeNetBalances(expenses, members)
    const paidVsSharePercentages = computePaidVsSharePercentages(
      expenses,
      members,
    )

    return {
      totalGroupSpendings,
      totalParticipantSpendings,
      totalParticipantShare,
      categoryBreakdown,
      participantRanking,
      expenseDistribution,
      spendingOverTime,
      monthOverMonth,
      dailyAverage,
      aggregateMetrics,
      netBalances,
      paidVsSharePercentages,
    }
  })
