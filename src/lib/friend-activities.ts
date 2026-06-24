import { getGroupExpenses } from '@/lib/api'
import { getSharedGroupsForUsers } from '@/lib/friend-balances-db'
import { expenseInvolvesBothUsers } from '@/lib/friend-expenses'
import { prisma } from '@/lib/prisma'
import { ActivityType, GroupType } from '@prisma/client'

type ActivityWithChanges = {
  id: string
  groupId: string
  time: Date
  activityType: ActivityType
  participantId: string | null
  expenseId: string | null
  data: string | null
  changes: Array<{
    field: string
    oldValue: string | null
    newValue: string | null
  }>
}

function shouldIncludeActivity(
  activity: ActivityWithChanges,
  groupType: GroupType,
  expense: Awaited<ReturnType<typeof getGroupExpenses>>[number] | undefined,
  currentUserId: string,
  friendUserId: string,
) {
  if (activity.activityType === ActivityType.UPDATE_GROUP) {
    return false
  }

  if (!activity.expenseId) {
    return false
  }

  if (groupType === GroupType.DYAD) {
    return true
  }

  if (expense) {
    return expenseInvolvesBothUsers(expense, currentUserId, friendUserId)
  }

  return false
}

export async function getFriendActivities(
  currentUserId: string,
  friendUserId: string,
  options?: { offset?: number; length?: number },
) {
  const sharedGroups = await getSharedGroupsForUsers(
    currentUserId,
    friendUserId,
  )

  if (sharedGroups.length === 0) {
    return []
  }

  const groupIds = sharedGroups.map((group) => group.id)
  const groupTypeById = new Map(
    sharedGroups.map((group) => [group.id, group.type]),
  )

  const activities = await prisma.activity.findMany({
    where: { groupId: { in: groupIds } },
    include: { changes: true },
    orderBy: [{ time: 'desc' }, { id: 'desc' }],
  })

  const expenseIds = activities
    .map((activity) => activity.expenseId)
    .filter(Boolean) as string[]

  const expenses = await prisma.expense.findMany({
    where: { id: { in: expenseIds } },
    select: {
      id: true,
      groupId: true,
      title: true,
      amount: true,
      expenseDate: true,
      createdAt: true,
      isReimbursement: true,
      splitMode: true,
      notes: true,
      recurrenceRule: true,
      category: true,
      paidBy: { select: { id: true, name: true } },
      paidFor: {
        select: {
          user: { select: { id: true, name: true } },
          shares: true,
        },
      },
      _count: { select: { documents: true } },
    },
  })

  const expenseById = new Map(expenses.map((expense) => [expense.id, expense]))

  const groups = await prisma.group.findMany({
    where: { id: { in: groupIds } },
    include: {
      memberships: {
        include: { user: { select: { id: true, name: true, email: true } } },
      },
    },
  })

  const groupMap = new Map(
    groups.map((group) => [
      group.id,
      {
        id: group.id,
        name: group.name,
        currency: group.currency,
        currencyCode: group.currencyCode,
        type: group.type,
        participants: group.memberships.map((membership) => ({
          id: membership.user.id,
          name: membership.user.name,
          email: membership.user.email,
        })),
      },
    ]),
  )

  const filtered = activities.filter((activity) =>
    shouldIncludeActivity(
      activity,
      groupTypeById.get(activity.groupId) ?? GroupType.STANDARD,
      activity.expenseId ? expenseById.get(activity.expenseId) : undefined,
      currentUserId,
      friendUserId,
    ),
  )

  const offset = options?.offset ?? 0
  const length = options?.length ?? filtered.length
  const page = filtered.slice(offset, offset + length)

  return page.map((activity) => ({
    ...activity,
    expense:
      activity.expenseId !== null
        ? expenseById.get(activity.expenseId)
        : undefined,
    group: groupMap.get(activity.groupId)!,
  }))
}
