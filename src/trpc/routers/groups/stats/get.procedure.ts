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
      participantId: z.string().optional(),
    }),
  )
  .query(async ({ input: { groupId, participantId } }) => {
    const expenses = await getGroupExpenses(groupId)
    const group = await getGroup(groupId)
    const participants = (group?.participants ?? []).map((p) => ({
      id: p.id,
      name: p.name,
    }))

    const totalGroupSpendings = getTotalGroupSpending(expenses)

    const totalParticipantSpendings =
      participantId !== undefined
        ? getTotalActiveUserPaidFor(participantId, expenses)
        : undefined
    const totalParticipantShare =
      participantId !== undefined
        ? getTotalActiveUserShare(participantId, expenses)
        : undefined

    // Compute enhanced stats
    const categoryBreakdown = computeCategoryBreakdown(expenses)
    const participantRanking = computeParticipantRanking(expenses, participants)
    const expenseDistribution = computeExpenseDistribution(
      expenses,
      participants,
    )
    const spendingOverTime = computeSpendingOverTime(expenses)
    const monthOverMonth = computeMonthOverMonth(spendingOverTime)
    const dailyAverage = computeDailyAverage(expenses)
    const aggregateMetrics = computeAggregateMetrics(expenses)
    const netBalances = computeNetBalances(expenses, participants)
    const paidVsSharePercentages = computePaidVsSharePercentages(
      expenses,
      participants,
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
