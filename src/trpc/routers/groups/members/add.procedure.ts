import { addGroupMember } from '@/lib/group-members'
import { protectedProcedure } from '@/trpc/init'
import { z } from 'zod'

export const addMemberProcedure = protectedProcedure
  .input(
    z
      .object({
        groupId: z.string().min(1),
        userId: z.string().min(1).optional(),
        email: z.string().email().optional(),
        name: z.string().min(1).max(100).optional(),
      })
      .superRefine((data, ctx) => {
        const hasUserId = !!data.userId
        const hasEmail = !!data.email

        if (hasUserId === hasEmail) {
          ctx.addIssue({
            code: 'custom',
            message: 'Exactly one of userId or email must be provided.',
            path: ['userId'],
          })
        }
      }),
  )
  .mutation(
    async ({ input: { groupId, userId, email, name }, ctx: { user } }) => {
      const result = await addGroupMember({
        groupId,
        ...(userId ? { userId } : { email: email! }),
        name,
        requesterUserId: user.id,
      })

      return { userId: result.userId, name: result.name }
    },
  )
