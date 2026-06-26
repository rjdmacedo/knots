import { getGroup } from '@/lib/api'
import { syncDyadGroupCurrency } from '@/lib/dyad-groups'
import { groupMemberProcedure } from '@/trpc/init'
import { z } from 'zod'

export const getGroupProcedure = groupMemberProcedure
  .input(z.object({ groupId: z.string().min(1) }))
  .query(async ({ input: { groupId } }) => {
    await syncDyadGroupCurrency(groupId)
    const group = await getGroup(groupId)
    if (!group) return { group: null }

    // Return members from GroupMembership → User with { id, name, email }
    const members = group.memberships.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      email: m.user.email,
    }))

    return {
      group: {
        ...group,
        participants: members,
      },
    }
  })
