import type { getGroupExpenses } from '@/lib/api'
import { getGroupExpenses as fetchGroupExpenses } from '@/lib/api'
import { getSharedGroupsForUsers } from '@/lib/friend-balances-db'
import { prisma } from '@/lib/prisma'
import { getCurrencyFromGroup } from '@/lib/utils'

export type GroupExpense = Awaited<ReturnType<typeof getGroupExpenses>>[number]

export type FriendExpenseItem = {
  expense: GroupExpense
  groupId: string
  groupName: string
  memberCount: number
  currency: ReturnType<typeof getCurrencyFromGroup>
}

export function expenseInvolvesBothUsers(
  expense: GroupExpense,
  userIdA: string,
  userIdB: string,
): boolean {
  const involved = new Set([
    expense.paidBy.id,
    ...expense.paidFor.map((paidFor) => paidFor.user.id),
  ])

  return involved.has(userIdA) && involved.has(userIdB)
}

export async function getFriendExpenses(
  currentUserId: string,
  friendUserId: string,
): Promise<FriendExpenseItem[]> {
  const sharedGroups = await getSharedGroupsForUsers(
    currentUserId,
    friendUserId,
  )

  if (sharedGroups.length === 0) {
    return []
  }

  const groupIds = sharedGroups.map((group) => group.id)

  const memberCounts = await prisma.groupMembership.groupBy({
    by: ['groupId'],
    where: { groupId: { in: groupIds }, archivedAt: null },
    _count: { groupId: true },
  })

  const memberCountByGroupId = new Map(
    memberCounts.map((row) => [row.groupId, row._count.groupId]),
  )

  const items: FriendExpenseItem[] = []

  for (const group of sharedGroups) {
    const expenses = await fetchGroupExpenses(group.id)
    const currency = getCurrencyFromGroup({
      currency: group.currency,
      currencyCode: group.currencyCode,
    })
    const memberCount = memberCountByGroupId.get(group.id) ?? 0

    for (const expense of expenses) {
      if (!expenseInvolvesBothUsers(expense, currentUserId, friendUserId)) {
        continue
      }

      items.push({
        expense,
        groupId: group.id,
        groupName: group.name,
        memberCount,
        currency,
      })
    }
  }

  items.sort((a, b) => {
    const dateDiff =
      b.expense.expenseDate.getTime() - a.expense.expenseDate.getTime()
    if (dateDiff !== 0) return dateDiff
    return b.expense.createdAt.getTime() - a.expense.createdAt.getTime()
  })

  return items
}

export async function getFriendSharedExpenseRecords(
  currentUserId: string,
  friendUserId: string,
): Promise<
  Array<{
    expense: GroupExpense
    groupId: string
    currency: ReturnType<typeof getCurrencyFromGroup>
  }>
> {
  const items = await getFriendExpenses(currentUserId, friendUserId)
  return items.map((item) => ({
    expense: item.expense,
    groupId: item.groupId,
    currency: item.currency,
  }))
}
