import {
  archiveGroupForUser,
  unarchiveGroupForUser,
} from '@/lib/group-lifecycle'
import { groupMemberProcedure } from '@/trpc/init'
import { z } from 'zod'

export const archiveGroupProcedure = groupMemberProcedure
  .input(z.object({ groupId: z.string().min(1) }))
  .mutation(async ({ input: { groupId }, ctx: { user } }) => {
    await archiveGroupForUser(user.id, groupId)
    return { success: true }
  })

export const unarchiveGroupProcedure = groupMemberProcedure
  .input(z.object({ groupId: z.string().min(1) }))
  .mutation(async ({ input: { groupId }, ctx: { user } }) => {
    await unarchiveGroupForUser(user.id, groupId)
    return { success: true }
  })
