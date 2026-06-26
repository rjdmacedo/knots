/**
 * Group Service — manages group creation and membership.
 * Handles group CRUD and membership validation.
 */

import { prisma } from '@/lib/prisma'
import { nanoid } from 'nanoid'

export type GroupError = 'INVALID_NAME' | 'GROUP_LIMIT_REACHED'

export interface GroupService {
  createGroup(
    name: string,
    userId: string,
  ): Promise<{ ok: true; groupId: string } | { ok: false; error: GroupError }>
  getUserGroups(userId: string): Promise<
    Array<{
      id: string
      name: string
      createdAt: Date
      archivedAt: Date | null
      role: 'OWNER' | 'MEMBER'
    }>
  >
  isMember(userId: string, groupId: string): Promise<boolean>
}

const MAX_GROUP_NAME_LENGTH = 100
const MAX_GROUPS_PER_USER = 100

function createGroupService(): GroupService {
  return {
    async createGroup(
      name: string,
      userId: string,
    ): Promise<
      { ok: true; groupId: string } | { ok: false; error: GroupError }
    > {
      // Validate group name: must be 1-100 characters
      const trimmedName = name.trim()
      if (
        trimmedName.length === 0 ||
        trimmedName.length > MAX_GROUP_NAME_LENGTH
      ) {
        return { ok: false, error: 'INVALID_NAME' }
      }

      // Check user's current membership count
      const membershipCount = await prisma.groupMembership.count({
        where: { userId },
      })

      if (membershipCount >= MAX_GROUPS_PER_USER) {
        return { ok: false, error: 'GROUP_LIMIT_REACHED' }
      }

      // Create the group and add the user as a member in a transaction
      const groupId = nanoid()
      await prisma.$transaction([
        prisma.group.create({
          data: {
            id: groupId,
            name: trimmedName,
          },
        }),
        prisma.groupMembership.create({
          data: {
            userId,
            groupId,
            role: 'OWNER',
          },
        }),
      ])

      return { ok: true, groupId }
    },

    async getUserGroups(userId: string): Promise<
      Array<{
        id: string
        name: string
        createdAt: Date
        archivedAt: Date | null
        role: 'OWNER' | 'MEMBER'
      }>
    > {
      const memberships = await prisma.groupMembership.findMany({
        where: {
          userId,
        },
        include: {
          group: {
            include: {
              expenses: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { createdAt: true },
              },
            },
          },
        },
      })

      const groups = memberships.map((m) => {
        const lastExpenseAt = m.group.expenses[0]?.createdAt ?? null
        const lastActiveAt = lastExpenseAt ?? m.group.createdAt
        return {
          id: m.group.id,
          name: m.group.name,
          createdAt: m.group.createdAt,
          archivedAt: m.archivedAt,
          role: m.role,
          lastActiveAt,
        }
      })

      groups.sort((a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime())

      return groups.map(({ id, name, createdAt, archivedAt, role }) => ({
        id,
        name,
        createdAt,
        archivedAt,
        role,
      }))
    },

    async isMember(userId: string, groupId: string): Promise<boolean> {
      const membership = await prisma.groupMembership.findUnique({
        where: {
          userId_groupId: { userId, groupId },
        },
      })

      return membership !== null
    },
  }
}

/** Singleton group service instance */
export const groupService: GroupService = createGroupService()
