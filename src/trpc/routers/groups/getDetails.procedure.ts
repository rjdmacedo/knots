import { getGroup, getGroupExpenseUserIds } from '@/lib/api'
import { groupMemberProcedure } from '@/trpc/init'
import { TRPCError } from '@trpc/server'
import { z } from 'zod'

export const getGroupDetailsProcedure = groupMemberProcedure
  .input(z.object({ groupId: z.string().min(1) }))
  .query(async ({ input: { groupId } }) => {
    const group = await getGroup(groupId)
    if (!group) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Group not found.',
      })
    }

    // Return members from GroupMembership → User with { id, name, email, role }
    const members = group.memberships.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
      role: m.role as string,
    }))

    const participantsWithExpenses = await getGroupExpenseUserIds(groupId)
    return {
      group: {
        id: group.id,
        name: group.name,
        information: group.information,
        currency: group.currency,
        currencyCode: group.currencyCode,
        simplifyDebts: group.simplifyDebts,
        createdAt: group.createdAt,
        participants: members,
      },
      participantsWithExpenses,
    }
  })
