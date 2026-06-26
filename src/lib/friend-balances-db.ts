import { prisma } from '@/lib/prisma'
import { GroupType } from '@prisma/client'

/**
 * Returns direct expenses (groupId = null) that involve both users.
 * An expense "involves" a user if they are either the payer (paidById) or a participant (in paidFor).
 * Returns in the same shape as getGroupExpenses for compatibility with the balance engine.
 */
export async function getDirectExpensesBetweenUsers(
  userId: string,
  friendUserId: string,
) {
  return prisma.expense.findMany({
    select: {
      amount: true,
      category: true,
      createdAt: true,
      expenseDate: true,
      id: true,
      isReimbursement: true,
      paidBy: { select: { id: true, name: true } },
      paidFor: {
        select: {
          user: { select: { id: true, name: true } },
          shares: true,
        },
      },
      splitMode: true,
      recurrenceRule: true,
      title: true,
      notes: true,
      _count: { select: { documents: true } },
    },
    where: {
      groupId: null,
      // Expense involves both users: each must be either the payer or a participant
      AND: [
        {
          OR: [{ paidById: userId }, { paidFor: { some: { userId } } }],
        },
        {
          OR: [
            { paidById: friendUserId },
            { paidFor: { some: { userId: friendUserId } } },
          ],
        },
      ],
    },
    orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
  })
}

/**
 * Returns groups where both users have active (non-archived) memberships.
 */
export async function getSharedGroupsForUsers(
  userId: string,
  friendUserId: string,
): Promise<
  Array<{
    id: string
    name: string
    type: GroupType
    currency: string
    currencyCode: string | null
    simplifyDebts: boolean
  }>
> {
  const memberships = await prisma.groupMembership.findMany({
    where: {
      userId: { in: [userId, friendUserId] },
      archivedAt: null,
    },
    select: {
      groupId: true,
      userId: true,
      group: {
        select: {
          id: true,
          name: true,
          type: true,
          currency: true,
          currencyCode: true,
          simplifyDebts: true,
        },
      },
    },
  })

  // Group by groupId; keep only groups where BOTH users appear
  const groupMap = new Map<
    string,
    {
      userIds: Set<string>
      group: {
        id: string
        name: string
        type: GroupType
        currency: string
        currencyCode: string | null
        simplifyDebts: boolean
      }
    }
  >()

  for (const m of memberships) {
    const entry = groupMap.get(m.groupId)
    if (entry) {
      entry.userIds.add(m.userId)
    } else {
      groupMap.set(m.groupId, {
        userIds: new Set([m.userId]),
        group: m.group,
      })
    }
  }

  const sharedGroups: Array<{
    id: string
    name: string
    type: GroupType
    currency: string
    currencyCode: string | null
    simplifyDebts: boolean
  }> = []

  Array.from(groupMap.values()).forEach((entry) => {
    if (entry.userIds.has(userId) && entry.userIds.has(friendUserId)) {
      sharedGroups.push(entry.group)
    }
  })

  return sharedGroups
}
