import { deleteGroupAsOwner } from '@/lib/group-lifecycle'
import { groupMemberProcedure } from '@/trpc/init'
import { z } from 'zod'

export const deleteGroupProcedure = groupMemberProcedure
  .input(z.object({ groupId: z.string().min(1) }))
  .mutation(async ({ input: { groupId }, ctx: { user } }) => {
    return deleteGroupAsOwner(user.id, groupId)
  })
