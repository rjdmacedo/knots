import { addGroupMember } from '@/lib/group-members'
import { protectedProcedure } from '@/trpc/init'
import { z } from 'zod'

export const addMemberProcedure = protectedProcedure
  .input(
    z.object({
      groupId: z.string().min(1),
      email: z.string().email(),
      name: z.string().min(1).max(100).optional(),
    }),
  )
  .mutation(async ({ input: { groupId, email, name }, ctx: { user } }) => {
    const result = await addGroupMember({
      groupId,
      email,
      name,
      requesterUserId: user.id,
    })

    return { userId: result.userId, name: result.name }
  })
