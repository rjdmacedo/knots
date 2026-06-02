import {
  archiveGroupForUser,
  unarchiveGroupForUser,
} from '@/lib/group-lifecycle'
import { protectedProcedure } from '@/trpc/init'
import { z } from 'zod'

export const archiveGroupProcedure = protectedProcedure
  .input(z.object({ groupId: z.string().min(1) }))
  .mutation(async ({ input: { groupId }, ctx: { user } }) => {
    await archiveGroupForUser(user.id, groupId)
    return { success: true }
  })

export const unarchiveGroupProcedure = protectedProcedure
  .input(z.object({ groupId: z.string().min(1) }))
  .mutation(async ({ input: { groupId }, ctx: { user } }) => {
    await unarchiveGroupForUser(user.id, groupId)
    return { success: true }
  })
