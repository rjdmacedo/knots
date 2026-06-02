import { deleteGroupAsOwner } from '@/lib/group-lifecycle'
import { protectedProcedure } from '@/trpc/init'
import { z } from 'zod'

export const deleteGroupProcedure = protectedProcedure
  .input(z.object({ groupId: z.string().min(1) }))
  .mutation(async ({ input: { groupId }, ctx: { user } }) => {
    return deleteGroupAsOwner(user.id, groupId)
  })
