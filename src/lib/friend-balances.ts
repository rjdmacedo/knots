import type { getGroupExpenses } from '@/lib/api'
import { getBalances, getReimbursements, Reimbursement } from '@/lib/balances'
import { Currency } from '@/lib/currency'
import { getCurrencyFromGroup } from '@/lib/utils'
import { GroupType } from '@prisma/client'

export type GroupBalanceBreakdown = {
  groupId: string
  groupSlug: string
  groupName: string
  groupType: GroupType
  currency: Currency
  amount: number // minor units; positive = friend owes user
}

export type FriendSettlement = {
  groupId: string
  groupSlug: string
  groupName: string
  groupType: GroupType
  currency: Currency
  from: string
  to: string
  amount: number
}

export type CurrencyBalance = {
  currency: Currency
  totalAmount: number
  groups: GroupBalanceBreakdown[]
}

export type FriendBalanceSummary = {
  friendId: string
  friendUserId: string
  name: string
  dyadGroupId: string | null
  balances: CurrencyBalance[] // empty if no shared groups or all zero
}

/** Net balance between two users from reimbursement suggestions. */
export function getPairwiseBalance(
  reimbursements: Reimbursement[],
  currentUserId: string,
  friendUserId: string,
): number {
  return reimbursements.reduce((net, r) => {
    if (r.from === friendUserId && r.to === currentUserId) return net + r.amount
    if (r.from === currentUserId && r.to === friendUserId) return net - r.amount
    return net
  }, 0)
}

/** Compute balances for one friend across shared groups. */
export function computeFriendBalance(
  currentUserId: string,
  friendUserId: string,
  sharedGroups: Array<{
    id: string
    name: string
    slug: string
    type: GroupType
    currency: string
    currencyCode: string | null
    simplifyDebts: boolean
    expenses: NonNullable<Awaited<ReturnType<typeof getGroupExpenses>>>
  }>,
): CurrencyBalance[] {
  // Map of currency key → { currency, totalAmount, groups }
  const currencyMap = new Map<string, CurrencyBalance>()

  for (const group of sharedGroups) {
    const balances = getBalances(group.expenses)
    const reimbursements = getReimbursements(group.expenses, {
      simplifyDebts: group.simplifyDebts,
    })
    const amount = getPairwiseBalance(
      reimbursements,
      currentUserId,
      friendUserId,
    )

    const currency = getCurrencyFromGroup({
      currency: group.currency,
      currencyCode: group.currencyCode,
    })

    // Use currencyCode as key, or fall back to the symbol for custom currencies
    const currencyKey = currency.code || currency.symbol

    const breakdown: GroupBalanceBreakdown = {
      groupId: group.id,
      groupSlug: group.slug,
      groupName: group.name,
      groupType: group.type,
      currency,
      amount,
    }

    const existing = currencyMap.get(currencyKey)
    if (existing) {
      existing.totalAmount += amount
      existing.groups.push(breakdown)
    } else {
      currencyMap.set(currencyKey, {
        currency,
        totalAmount: amount,
        groups: [breakdown],
      })
    }
  }

  return Array.from(currencyMap.values())
}

/** Pairwise settlement suggestions between two friends in each shared group. */
export function computeFriendSettlements(
  currentUserId: string,
  friendUserId: string,
  sharedGroups: Array<{
    id: string
    name: string
    slug: string
    type: GroupType
    currency: string
    currencyCode: string | null
    simplifyDebts: boolean
    expenses: NonNullable<Awaited<ReturnType<typeof getGroupExpenses>>>
  }>,
): FriendSettlement[] {
  const settlements: FriendSettlement[] = []

  for (const group of sharedGroups) {
    const balances = getBalances(group.expenses)
    const reimbursements = getReimbursements(group.expenses, {
      simplifyDebts: group.simplifyDebts,
    })
    const debt = reimbursements.find(
      (reimbursement) =>
        (reimbursement.from === currentUserId &&
          reimbursement.to === friendUserId) ||
        (reimbursement.from === friendUserId &&
          reimbursement.to === currentUserId),
    )

    if (!debt) {
      continue
    }

    settlements.push({
      groupId: group.id,
      groupSlug: group.slug,
      groupName: group.name,
      groupType: group.type,
      currency: getCurrencyFromGroup({
        currency: group.currency,
        currencyCode: group.currencyCode,
      }),
      from: debt.from,
      to: debt.to,
      amount: debt.amount,
    })
  }

  return settlements
}

/** Sort: non-zero balances first, then alphabetical by name. */
export function sortFriendBalances(
  items: FriendBalanceSummary[],
): FriendBalanceSummary[] {
  return [...items].sort((a, b) => {
    const aMaxAbs = getMaxAbsoluteBalance(a.balances)
    const bMaxAbs = getMaxAbsoluteBalance(b.balances)

    const aHasBalance = aMaxAbs > 0
    const bHasBalance = bMaxAbs > 0

    // Non-zero balances come first
    if (aHasBalance && !bHasBalance) return -1
    if (!aHasBalance && bHasBalance) return 1

    // Both have non-zero balances: sort by largest absolute amount descending
    if (aHasBalance && bHasBalance) {
      if (aMaxAbs !== bMaxAbs) return bMaxAbs - aMaxAbs
    }

    // Tie-break: alphabetical by name
    return (a.name ?? '').localeCompare(b.name ?? '')
  })
}

/** Get the largest absolute totalAmount across all currencies for a friend. */
function getMaxAbsoluteBalance(balances: CurrencyBalance[]): number {
  if (balances.length === 0) return 0
  return Math.max(...balances.map((b) => Math.abs(b.totalAmount)))
}
