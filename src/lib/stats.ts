import { getGroupExpenses } from '@/lib/api'
import {
  getBalances,
  getPublicBalances,
  getSuggestedReimbursements,
} from '@/lib/balances'
import { calculateShare } from '@/lib/totals'

// --- Input Types ---

export type Expense = NonNullable<
  Awaited<ReturnType<typeof getGroupExpenses>>
>[number]

export type Participant = {
  id: string
  name: string
}

// --- Output Types ---

export interface CategoryBreakdownItem {
  categoryId: number
  categoryName: string // "Uncategorized" for id=0
  categoryGrouping: string
  amount: number // in minor units (cents)
  percentage: number // 0-100, one decimal place
}

export interface ParticipantRankingItem {
  participantId: string
  participantName: string
  totalPaid: number // in minor units
  percentage: number // of total group spending, one decimal
}

export interface ExpenseDistributionItem {
  participantId: string
  participantName: string
  totalPaid: number // in minor units
  totalShare: number // in minor units
  difference: number // paid - share (positive = overpaid)
}

export interface MonthlySpendingItem {
  year: number
  month: number // 0-indexed (JS Date convention)
  amount: number // in minor units
}

export interface MonthOverMonthData {
  currentMonth: { year: number; month: number; amount: number }
  previousMonth: { year: number; month: number; amount: number }
  absoluteDifference: number // current - previous (can be negative)
  percentageChange: number // ((current - previous) / previous) * 100
}

export interface AggregateMetricsData {
  totalCount: number
  averageAmount: number | null // null if no expenses
  largestExpense: {
    title: string
    amount: number
    date: Date
  } | null
  mostRecentExpense: {
    title: string
    amount: number
    date: Date
  } | null
}

export interface NetBalanceItem {
  participantId: string
  participantName: string
  totalPaid: number
  totalShare: number
  netBalance: number // paid - share
}

export interface PaidVsShareItem {
  participantId: string
  participantName: string
  paidPercentage: number // one decimal place
  sharePercentage: number // one decimal place
}

export interface RecordedReimbursementItem {
  expenseId: string
  title: string
  date: Date
  fromId: string
  fromName: string
  toId: string
  toName: string
  amount: number
}

export interface SuggestedReimbursementItem {
  fromId: string
  fromName: string
  toId: string
  toName: string
  amount: number
}

export interface ReimbursementStats {
  recorded: RecordedReimbursementItem[]
  suggested: SuggestedReimbursementItem[]
  totalRecordedAmount: number
}

// --- Computation Functions ---

export function computeCategoryBreakdown(
  expenses: Expense[],
): CategoryBreakdownItem[] {
  const nonReimbursements = expenses.filter((e) => !e.isReimbursement)

  const totalSpending = nonReimbursements.reduce((sum, e) => sum + e.amount, 0)

  if (totalSpending === 0) return []

  const categoryMap = new Map<
    number,
    { name: string; grouping: string; amount: number }
  >()

  for (const expense of nonReimbursements) {
    const categoryId = expense.category?.id ?? 0
    const categoryName = expense.category?.name ?? 'Uncategorized'
    const categoryGrouping = expense.category?.grouping ?? ''

    const existing = categoryMap.get(categoryId)
    if (existing) {
      existing.amount += expense.amount
    } else {
      categoryMap.set(categoryId, {
        name: categoryName,
        grouping: categoryGrouping,
        amount: expense.amount,
      })
    }
  }

  const items: CategoryBreakdownItem[] = Array.from(categoryMap.entries()).map(
    ([categoryId, { name, grouping, amount }]) => ({
      categoryId,
      categoryName: categoryId === 0 ? 'Uncategorized' : name,
      categoryGrouping: grouping,
      amount,
      percentage: Math.round((amount / totalSpending) * 1000) / 10,
    }),
  )

  items.sort((a, b) => b.amount - a.amount)

  return items
}

export function computeSpendingOverTime(
  expenses: Expense[],
): MonthlySpendingItem[] {
  const nonReimbursements = expenses.filter((e) => !e.isReimbursement)

  if (nonReimbursements.length === 0) return []

  // Aggregate by year/month
  const monthMap = new Map<string, number>()
  let minYear = Infinity
  let minMonth = Infinity
  let maxYear = -Infinity
  let maxMonth = -Infinity

  for (const expense of nonReimbursements) {
    const date = new Date(expense.expenseDate)
    const year = date.getFullYear()
    const month = date.getMonth() // 0-indexed
    const key = `${year}-${month}`

    monthMap.set(key, (monthMap.get(key) ?? 0) + expense.amount)

    if (year < minYear || (year === minYear && month < minMonth)) {
      minYear = year
      minMonth = month
    }
    if (year > maxYear || (year === maxYear && month > maxMonth)) {
      maxYear = year
      maxMonth = month
    }
  }

  // Fill gaps between earliest and latest months
  const result: MonthlySpendingItem[] = []
  let currentYear = minYear
  let currentMonth = minMonth

  while (
    currentYear < maxYear ||
    (currentYear === maxYear && currentMonth <= maxMonth)
  ) {
    const key = `${currentYear}-${currentMonth}`
    result.push({
      year: currentYear,
      month: currentMonth,
      amount: monthMap.get(key) ?? 0,
    })

    currentMonth++
    if (currentMonth > 11) {
      currentMonth = 0
      currentYear++
    }
  }

  return result
}

export function computeMonthOverMonth(
  monthlyData: MonthlySpendingItem[],
): MonthOverMonthData | null {
  if (monthlyData.length < 2) return null

  const current = monthlyData[monthlyData.length - 1]
  const previous = monthlyData[monthlyData.length - 2]

  const absoluteDifference = current.amount - previous.amount
  const percentageChange =
    previous.amount === 0
      ? current.amount === 0
        ? 0
        : Infinity
      : ((current.amount - previous.amount) / previous.amount) * 100

  return {
    currentMonth: {
      year: current.year,
      month: current.month,
      amount: current.amount,
    },
    previousMonth: {
      year: previous.year,
      month: previous.month,
      amount: previous.amount,
    },
    absoluteDifference,
    percentageChange,
  }
}

export function computeDailyAverage(expenses: Expense[]): number | null {
  const nonReimbursements = expenses.filter((e) => !e.isReimbursement)

  if (nonReimbursements.length === 0) return null

  const totalSpending = nonReimbursements.reduce((sum, e) => sum + e.amount, 0)

  // Find earliest and latest expenseDate
  let earliest = new Date(nonReimbursements[0].expenseDate)
  let latest = new Date(nonReimbursements[0].expenseDate)

  for (const expense of nonReimbursements) {
    const date = new Date(expense.expenseDate)
    if (date < earliest) earliest = date
    if (date > latest) latest = date
  }

  // Compute days between earliest and latest (inclusive)
  const msPerDay = 24 * 60 * 60 * 1000
  const days =
    Math.round((latest.getTime() - earliest.getTime()) / msPerDay) + 1

  return totalSpending / days
}

export function computeParticipantRanking(
  expenses: Expense[],
  participants: Participant[],
): ParticipantRankingItem[] {
  const nonReimbursements = expenses.filter((e) => !e.isReimbursement)

  const totalSpending = nonReimbursements.reduce((sum, e) => sum + e.amount, 0)

  // Initialize all participants with zero
  const paidMap = new Map<string, { name: string; totalPaid: number }>()
  for (const participant of participants) {
    paidMap.set(participant.id, { name: participant.name, totalPaid: 0 })
  }

  // Accumulate paid amounts
  for (const expense of nonReimbursements) {
    const existing = paidMap.get(expense.paidBy.id)
    if (existing) {
      existing.totalPaid += expense.amount
    } else {
      // Participant not in the list but paid for an expense
      paidMap.set(expense.paidBy.id, {
        name: expense.paidBy.name,
        totalPaid: expense.amount,
      })
    }
  }

  const items: ParticipantRankingItem[] = Array.from(paidMap.entries()).map(
    ([participantId, { name, totalPaid }]) => ({
      participantId,
      participantName: name,
      totalPaid,
      percentage:
        totalSpending === 0
          ? 0
          : Math.round((totalPaid / totalSpending) * 1000) / 10,
    }),
  )

  // Sort descending by totalPaid, alphabetical tiebreaker
  items.sort((a, b) => {
    if (b.totalPaid !== a.totalPaid) return b.totalPaid - a.totalPaid
    return a.participantName.localeCompare(b.participantName)
  })

  return items
}

export function computeExpenseDistribution(
  expenses: Expense[],
  participants: Participant[],
): ExpenseDistributionItem[] {
  const nonReimbursements = expenses.filter((e) => !e.isReimbursement)

  // Initialize all participants
  const distributionMap = new Map<
    string,
    { name: string; totalPaid: number; totalShare: number }
  >()
  for (const participant of participants) {
    distributionMap.set(participant.id, {
      name: participant.name,
      totalPaid: 0,
      totalShare: 0,
    })
  }

  // Accumulate paid amounts
  for (const expense of nonReimbursements) {
    const existing = distributionMap.get(expense.paidBy.id)
    if (existing) {
      existing.totalPaid += expense.amount
    } else {
      distributionMap.set(expense.paidBy.id, {
        name: expense.paidBy.name,
        totalPaid: expense.amount,
        totalShare: 0,
      })
    }
  }

  // Accumulate shares using calculateShare
  for (const expense of nonReimbursements) {
    const participantIds = Array.from(distributionMap.keys())
    for (const participantId of participantIds) {
      const data = distributionMap.get(participantId)!
      const share = calculateShare(participantId, expense)
      data.totalShare += share
    }
  }

  const items: ExpenseDistributionItem[] = Array.from(
    distributionMap.entries(),
  ).map(([participantId, { name, totalPaid, totalShare }]) => ({
    participantId,
    participantName: name,
    totalPaid,
    totalShare,
    difference: totalPaid - totalShare,
  }))

  // Sort by absolute difference descending
  items.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference))

  return items
}

export function computeAggregateMetrics(
  expenses: Expense[],
): AggregateMetricsData {
  const nonReimbursements = expenses.filter((e) => !e.isReimbursement)

  const totalCount = nonReimbursements.length

  if (totalCount === 0) {
    return {
      totalCount: 0,
      averageAmount: null,
      largestExpense: null,
      mostRecentExpense: null,
    }
  }

  const totalSpending = nonReimbursements.reduce((sum, e) => sum + e.amount, 0)
  const averageAmount = totalSpending / totalCount

  // Find largest expense (tiebreaker: most recent createdAt)
  const largest = nonReimbursements.reduce((max, e) => {
    if (e.amount > max.amount) return e
    if (e.amount === max.amount && e.createdAt > max.createdAt) return e
    return max
  })

  // Find most recent expense by createdAt
  const mostRecent = nonReimbursements.reduce((latest, e) => {
    if (e.createdAt > latest.createdAt) return e
    return latest
  })

  return {
    totalCount,
    averageAmount,
    largestExpense: {
      title: largest.title,
      amount: largest.amount,
      date: largest.createdAt,
    },
    mostRecentExpense: {
      title: mostRecent.title,
      amount: mostRecent.amount,
      date: mostRecent.createdAt,
    },
  }
}

export function computeNetBalances(
  expenses: Expense[],
  participants: Participant[],
): NetBalanceItem[] {
  const balances = getBalances(expenses)
  const reimbursements = getSuggestedReimbursements(balances)
  const settlementBalances = getPublicBalances(reimbursements)

  const items: NetBalanceItem[] = participants.map((participant) => ({
    participantId: participant.id,
    participantName: participant.name,
    totalPaid: balances[participant.id]?.paid ?? 0,
    totalShare: balances[participant.id]?.paidFor ?? 0,
    netBalance: settlementBalances[participant.id]?.total ?? 0,
  }))

  // Sort by netBalance descending (most owed first)
  items.sort((a, b) => b.netBalance - a.netBalance)

  return items
}

export function computePaidVsSharePercentages(
  expenses: Expense[],
  participants: Participant[],
): PaidVsShareItem[] {
  const nonReimbursements = expenses.filter((e) => !e.isReimbursement)

  const totalSpending = nonReimbursements.reduce((sum, e) => sum + e.amount, 0)

  if (totalSpending === 0) return []

  const paidMap = new Map<
    string,
    { name: string; totalPaid: number; totalShare: number }
  >()

  // Initialize all participants
  for (const participant of participants) {
    paidMap.set(participant.id, {
      name: participant.name,
      totalPaid: 0,
      totalShare: 0,
    })
  }

  // Accumulate paid amounts and shares
  for (const expense of nonReimbursements) {
    const payerId = expense.paidBy.id
    const payerEntry = paidMap.get(payerId)
    if (payerEntry) {
      payerEntry.totalPaid += expense.amount
    }

    for (const participant of participants) {
      const share = calculateShare(participant.id, expense)
      const entry = paidMap.get(participant.id)
      if (entry) {
        entry.totalShare += share
      }
    }
  }

  const items: PaidVsShareItem[] = Array.from(paidMap.entries()).map(
    ([participantId, { name, totalPaid, totalShare }]) => ({
      participantId,
      participantName: name,
      paidPercentage: Math.round((totalPaid / totalSpending) * 1000) / 10,
      sharePercentage: Math.round((totalShare / totalSpending) * 1000) / 10,
    }),
  )

  return items
}

function getParticipantName(
  participantId: string,
  participants: Participant[],
): string {
  return participants.find((p) => p.id === participantId)?.name ?? participantId
}

export function computeReimbursementStats(
  expenses: Expense[],
  participants: Participant[],
): ReimbursementStats {
  const recorded: RecordedReimbursementItem[] = []

  for (const expense of expenses) {
    if (!expense.isReimbursement) continue

    const recipients = expense.paidFor.filter(
      (paidFor) => paidFor.user.id !== expense.paidBy.id,
    )
    const primaryRecipient = recipients[0] ?? expense.paidFor[0]
    if (!primaryRecipient) continue

    recorded.push({
      expenseId: expense.id,
      title: expense.title,
      date: expense.expenseDate,
      fromId: expense.paidBy.id,
      fromName: expense.paidBy.name,
      toId: primaryRecipient.user.id,
      toName: primaryRecipient.user.name,
      amount: expense.amount,
    })
  }

  recorded.sort((a, b) => b.date.getTime() - a.date.getTime())

  const balances = getBalances(expenses)
  const suggestedRaw = getSuggestedReimbursements(balances)
  const suggested: SuggestedReimbursementItem[] = suggestedRaw.map((r) => ({
    fromId: r.from,
    fromName: getParticipantName(r.from, participants),
    toId: r.to,
    toName: getParticipantName(r.to, participants),
    amount: r.amount,
  }))

  const totalRecordedAmount = recorded.reduce((sum, r) => sum + r.amount, 0)

  return { recorded, suggested, totalRecordedAmount }
}
