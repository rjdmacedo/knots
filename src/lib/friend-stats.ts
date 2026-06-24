import type { getGroupExpenses as GetGroupExpenses } from '@/lib/api'
import { getGroupExpenses } from '@/lib/api'
import { getSharedGroupsForUsers } from '@/lib/friend-balances-db'
import { expenseInvolvesBothUsers } from '@/lib/friend-expenses'
import { prisma } from '@/lib/prisma'
import {
  computeAggregateMetrics,
  computeCategoryBreakdown,
  computeDailyAverage,
  computeExpenseDistribution,
  computeMonthOverMonth,
  computeNetBalances,
  computePaidVsSharePercentages,
  computeParticipantRanking,
  computeReimbursementStats,
  computeSpendingOverTime,
} from '@/lib/stats'
import {
  getTotalActiveUserPaidFor,
  getTotalActiveUserShare,
  getTotalGroupSpending,
} from '@/lib/totals'
import { getCurrencyFromGroup } from '@/lib/utils'
import { GroupType } from '@prisma/client'

type Expense = NonNullable<Awaited<ReturnType<typeof GetGroupExpenses>>[number]>

function restrictToMembers<T extends { participantId: string }>(
  items: T[],
  memberIds: Set<string>,
): T[] {
  return items.filter((item) => memberIds.has(item.participantId))
}

function restrictReimbursementStats(
  stats: ReturnType<typeof computeReimbursementStats>,
  memberIds: Set<string>,
): ReturnType<typeof computeReimbursementStats> {
  const recorded = stats.recorded.filter(
    (item) => memberIds.has(item.fromId) && memberIds.has(item.toId),
  )
  const suggested = stats.suggested.filter(
    (item) => memberIds.has(item.fromId) && memberIds.has(item.toId),
  )

  return {
    recorded,
    suggested,
    totalRecordedAmount: recorded.reduce((sum, item) => sum + item.amount, 0),
  }
}

export type FriendCurrencyStats = {
  currency: ReturnType<typeof getCurrencyFromGroup>
  totalGroupSpendings: number
  totalParticipantSpendings: number | undefined
  totalParticipantShare: number | undefined
  categoryBreakdown: ReturnType<typeof computeCategoryBreakdown>
  participantRanking: ReturnType<typeof computeParticipantRanking>
  expenseDistribution: ReturnType<typeof computeExpenseDistribution>
  spendingOverTime: ReturnType<typeof computeSpendingOverTime>
  monthOverMonth: ReturnType<typeof computeMonthOverMonth>
  dailyAverage: ReturnType<typeof computeDailyAverage>
  aggregateMetrics: ReturnType<typeof computeAggregateMetrics>
  netBalances: ReturnType<typeof computeNetBalances>
  paidVsSharePercentages: ReturnType<typeof computePaidVsSharePercentages>
  reimbursements: ReturnType<typeof computeReimbursementStats>
}

function computeStatsForCurrency(
  expenses: Expense[],
  members: Array<{ id: string; name: string }>,
  currentUserId: string,
  currency: ReturnType<typeof getCurrencyFromGroup>,
): FriendCurrencyStats {
  const memberIds = new Set(members.map((member) => member.id))
  const totalGroupSpendings = getTotalGroupSpending(expenses)
  const totalParticipantSpendings = getTotalActiveUserPaidFor(
    currentUserId,
    expenses,
  )
  const totalParticipantShare = getTotalActiveUserShare(currentUserId, expenses)
  const spendingOverTime = computeSpendingOverTime(expenses)

  return {
    currency,
    totalGroupSpendings,
    totalParticipantSpendings,
    totalParticipantShare,
    categoryBreakdown: computeCategoryBreakdown(expenses),
    participantRanking: restrictToMembers(
      computeParticipantRanking(expenses, members),
      memberIds,
    ),
    expenseDistribution: restrictToMembers(
      computeExpenseDistribution(expenses, members),
      memberIds,
    ),
    spendingOverTime,
    monthOverMonth: computeMonthOverMonth(spendingOverTime),
    dailyAverage: computeDailyAverage(expenses),
    aggregateMetrics: computeAggregateMetrics(expenses),
    netBalances: restrictToMembers(
      computeNetBalances(expenses, members),
      memberIds,
    ),
    paidVsSharePercentages: restrictToMembers(
      computePaidVsSharePercentages(expenses, members),
      memberIds,
    ),
    reimbursements: restrictReimbursementStats(
      computeReimbursementStats(expenses, members),
      memberIds,
    ),
  }
}

export async function getFriendStats(
  currentUserId: string,
  friendUserId: string,
): Promise<FriendCurrencyStats[]> {
  const [sharedGroups, users] = await Promise.all([
    getSharedGroupsForUsers(currentUserId, friendUserId),
    prisma.user.findMany({
      where: { id: { in: [currentUserId, friendUserId] } },
      select: { id: true, name: true },
    }),
  ])

  const userById = new Map(users.map((user) => [user.id, user.name]))
  const members = [
    { id: currentUserId, name: userById.get(currentUserId) ?? 'You' },
    { id: friendUserId, name: userById.get(friendUserId) ?? 'Friend' },
  ]

  const expensesByCurrency = new Map<
    string,
    { currency: ReturnType<typeof getCurrencyFromGroup>; expenses: Expense[] }
  >()

  for (const group of sharedGroups) {
    const currency = getCurrencyFromGroup({
      currency: group.currency,
      currencyCode: group.currencyCode,
    })
    const currencyKey = currency.code || currency.symbol
    const expenses = await getGroupExpenses(group.id)

    for (const expense of expenses) {
      const includeExpense =
        group.type === GroupType.DYAD ||
        expenseInvolvesBothUsers(expense, currentUserId, friendUserId)

      if (!includeExpense) continue

      const bucket = expensesByCurrency.get(currencyKey) ?? {
        currency,
        expenses: [],
      }
      bucket.expenses.push(expense)
      expensesByCurrency.set(currencyKey, bucket)
    }
  }

  return Array.from(expensesByCurrency.values()).map(({ currency, expenses }) =>
    computeStatsForCurrency(expenses, members, currentUserId, currency),
  )
}
