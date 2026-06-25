import type { getGroupExpenses } from '@/lib/api'
import { getGroupExpenses as fetchGroupExpenses } from '@/lib/api'
import { getSharedGroupsForUsers } from '@/lib/friend-balances-db'
import { prisma } from '@/lib/prisma'
import { getCurrencyFromGroup } from '@/lib/utils'
import { GroupType } from '@prisma/client'

export type GroupExpense = Awaited<ReturnType<typeof getGroupExpenses>>[number]

export type FriendExpenseItem = {
  expense: GroupExpense
  groupId: string
  groupSlug: string
  groupName: string
  groupType: GroupType
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

  const dyadGroups = sharedGroups.filter(
    (group) => group.type === GroupType.DYAD,
  )

  if (dyadGroups.length === 0) {
    return []
  }

  const groupIds = dyadGroups.map((group) => group.id)

  const memberCounts = await prisma.groupMembership.groupBy({
    by: ['groupId'],
    where: { groupId: { in: groupIds }, archivedAt: null },
    _count: { groupId: true },
  })

  const memberCountByGroupId = new Map(
    memberCounts.map((row) => [row.groupId, row._count.groupId]),
  )

  const items: FriendExpenseItem[] = []

  for (const group of dyadGroups) {
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
        groupSlug: group.slug,
        groupName: group.name,
        groupType: group.type,
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
    groupType: GroupType
    currency: ReturnType<typeof getCurrencyFromGroup>
  }>
> {
  const items = await getFriendExpenses(currentUserId, friendUserId)
  return items.map((item) => ({
    expense: item.expense,
    groupId: item.groupId,
    groupType: item.groupType,
    currency: item.currency,
  }))
}
