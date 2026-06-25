import { prisma } from '@/lib/prisma'
import { GroupType } from '@prisma/client'

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
    slug: string
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
          slug: true,
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
        slug: string
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
    slug: string
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
